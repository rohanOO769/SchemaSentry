// apps/api/src/migrations/sandbox.service.ts

import {
  Injectable,
  InternalServerErrorException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Client } from 'ssh2';
import { existsSync,readFileSync } from 'node:fs';

interface SandboxListItem {
  name: string;
}

interface SandboxInspection {
  name: string;
  created_at: string;
  config?: {
    labels?: Record<string, string>;
    lifecycle?: {
      max_duration_secs?: number;
    };
  };
}

@Injectable()
export class SandboxService implements OnApplicationBootstrap{
  private readonly host = process.env.SANDBOX_SSH_HOST;
  private readonly username = process.env.SANDBOX_SSH_USER;
  private readonly privateKeyPath = process.env.SANDBOX_SSH_KEY_PATH;

  private readonly sandboxName = 'schemasentry-migration-test';
  
  private readonly msbPath = '/home/sandboxuser/.local/bin/msb';

  constructor() {
    if (!this.host || !this.username || !this.privateKeyPath) {
      throw new Error('Sandbox SSH configuration was not loaded');
    }

    if (!existsSync(this.privateKeyPath)) {
      throw new Error('Sandbox SSH private key file was not found');
    }
  }  

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.cleanupAbandonedSandboxes();
    } catch (error) {
      console.error(
        '[SchemaSentry] Sandbox recovery failed:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async cleanupAbandonedSandboxes(): Promise<void> {
    const output = await this.runSshCommand(
      `${this.msbPath} list --format json`,
    );

    const sandboxes = JSON.parse(output) as SandboxListItem[];

    const candidates = sandboxes.filter((sandbox) =>
      /^schemasentry-[0-9a-f]{8}$/.test(sandbox.name),
    );

    for (const candidate of candidates) {
      const inspectionOutput = await this.runSshCommand(
        `${this.msbPath} inspect ${candidate.name} --format json`,
      );

      const inspection = JSON.parse(
        inspectionOutput,
      ) as SandboxInspection;

      const labels = inspection.config?.labels ?? {};

      if (
        labels.project !== 'schemasentry' ||
        labels.purpose !== 'migration-execution'
      ) {
        continue;
      }

      const createdAt = Date.parse(inspection.created_at);
      const maxDuration =
        inspection.config?.lifecycle?.max_duration_secs;

      if (
        !Number.isFinite(createdAt) ||
        typeof maxDuration !== 'number' ||
        maxDuration <= 0
      ) {
        console.warn(
          `[SchemaSentry] Skipping sandbox with incomplete metadata: ${candidate.name}`,
        );
        continue;
      }

      const ageSeconds = (Date.now() - createdAt) / 1000;
      const safetyBufferSeconds = 300;

      if (ageSeconds <= maxDuration + safetyBufferSeconds) {
        continue;
      }

      console.warn(
        `[SchemaSentry] Removing abandoned sandbox: ${candidate.name}`,
      );

      await this.removeSandbox(candidate.name);
    }
  }

  
  async createSandbox(sandboxName: string): Promise<void> {
    this.validateSandboxName(sandboxName);

    const command =
      `${this.msbPath} create postgres:16-alpine ` +
      `--name ${sandboxName} ` +
      '--cpus 1 --memory 1G ' +
      '--no-net --idle-timeout 30m --max-duration 1h ' +
      '--label project=schemasentry ' +
      '--label purpose=migration-execution';

    let created = false;

    try {
      await this.runSshCommand(command);
      created = true;

      await this.runSshCommand(
        `${this.msbPath} exec --detach ` +
        '--env POSTGRES_USER=schemasentry ' +
        '--env POSTGRES_DB=schemasentry ' +
        '--env POSTGRES_HOST_AUTH_METHOD=trust ' +
        `${sandboxName} -- docker-entrypoint.sh postgres`,
      );

      await this.waitForPostgres(sandboxName);
    } catch (error) {
      if (created) {
        try {
          await this.removeSandbox(sandboxName);
        } catch (cleanupError) {
          console.error(
            `Failed to clean up sandbox ${sandboxName}:`,
            cleanupError,
          );
        }
      }

      throw error;
    }
  }


  async removeSandbox(sandboxName: string): Promise<void> {
    this.validateSandboxName(sandboxName);

    await this.runSshCommand(
      `${this.msbPath} remove --force ${sandboxName}`,
    );
  }

  private validateSandboxName(sandboxName: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(sandboxName)) {
      throw new Error('Invalid sandbox name');
    }
  }

  private async waitForPostgres(
    sandboxName: string,
    maxAttempts = 20,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.runSshCommand(
          `${this.msbPath} exec ${sandboxName} -- ` +
          'pg_isready -U schemasentry -d schemasentry',
        );

        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error(
      `PostgreSQL did not become ready in sandbox ${sandboxName}`,
    );
  }


  private async runSshCommand(command: string): Promise<string> {
    if (!this.host || !this.username || !this.privateKeyPath) {
      throw new InternalServerErrorException(
        'Sandbox SSH configuration is missing',
      );
    }

    const privateKey = readFileSync(this.privateKeyPath);

    return new Promise((resolve, reject) => {
      const connection = new Client();

      connection.on('ready', () => {
        connection.exec(command, (error, stream) => {
          if (error) {
            connection.end();
            return reject(error);
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

          stream.on('close', (code: number) => {
            connection.end();

            if (code !== 0) {
              return reject(
                new Error(errorOutput || output || 'Sandbox command failed'),
              );
            }

            resolve(output.trim());
          });
        });
      });

      connection.on('error', (error) => {
        connection.end();
        reject(error);
      });

      connection.connect({
        host: this.host,
        port: 22,
        username: this.username,
        privateKey,
        readyTimeout: 10000,
      });
    });
  }


  async execute(
    command: string,
    sandboxName = this.sandboxName,
  ): Promise<string> {

    if (!/^[a-zA-Z0-9_-]+$/.test(sandboxName)) {
      throw new Error('Invalid sandbox name');
    }

    const host = this.host;
    const username = this.username;
    const privateKeyPath = this.privateKeyPath;

    if (!host || !username || !privateKeyPath) {
      throw new InternalServerErrorException(
        'Sandbox SSH configuration is missing',
      );
    }

    const privateKey = readFileSync(privateKeyPath);

    // Only permit predefined Microsandbox operations.
    const allowedCommands = [
      'SELECT_VERSION',
      'CAPTURE_SCHEMA',
      'CAPTURE_TABLE_STATS',
      'CAPTURE_COLUMN_STATS',
    ];

    if (!allowedCommands.includes(command)) {
      throw new Error('Unsupported sandbox operation');
    }

    const commands: Record<string, string> = {
      SELECT_VERSION:
        `/home/sandboxuser/.local/bin/msb exec ${sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT version();"`,

      CAPTURE_SCHEMA:
        `/home/sandboxuser/.local/bin/msb exec ${sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT json_agg(row_to_json(c)) FROM (SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position) c;"`,

      CAPTURE_TABLE_STATS:
        `/home/sandboxuser/.local/bin/msb exec ${sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT COALESCE(jsonb_object_agg(table_name, row_count), '{}'::jsonb) FROM (SELECT table_name, (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) AS count FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS row_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') counts;"`,

      CAPTURE_COLUMN_STATS:
        `/home/sandboxuser/.local/bin/msb exec ${sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT COALESCE(jsonb_object_agg(table_name || '.' || column_name, jsonb_build_object('total_rows', total_rows, 'non_null', non_null_count)), '{}'::jsonb) FROM (SELECT c.table_name, c.column_name, (xpath('/row/total/text()', q.result))[1]::text::bigint AS total_rows, (xpath('/row/non_null/text()', q.result))[1]::text::bigint AS non_null_count FROM information_schema.columns c CROSS JOIN LATERAL (SELECT query_to_xml(format('SELECT count(*) AS total, count(%I) AS non_null FROM %I.%I', c.column_name, c.table_schema, c.table_name), false, true, '') AS result) q WHERE c.table_schema = 'public') column_stats;"`,
    };

    return new Promise((resolve, reject) => {
      const connection = new Client();

      connection.on('ready', () => {
        connection.exec(commands[command], (error, stream) => {
          if (error) {
            connection.end();
            return reject(error);
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

          stream.on('close', (code: number) => {
            connection.end();

            if (code !== 0) {
              return reject(
                new Error(errorOutput || 'Sandbox command failed'),
              );
            }

            resolve(output.trim());
          });
        });
      });

      connection.on('error', (error) => {
        reject(error);
      });

      connection.connect({
        host,
        port: 22,
        username,
        privateKey,
        readyTimeout: 10000,
      });
    });
  }

  async executeMigration(
    sql: string,
    sandboxName = this.sandboxName,
  ): Promise<string> {
    if (!sql.trim()) {
      throw new Error('Migration SQL cannot be empty');
    }

    if (sql.length > 50000) {
      throw new Error('Migration SQL exceeds the 50000 character limit');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sandboxName)) {
      throw new Error('Invalid sandbox name');
    }

    const command =
      `/home/sandboxuser/.local/bin/msb exec ${sandboxName} -- ` +
      'psql -X --set ON_ERROR_STOP=1 --single-transaction ' +
      '-U schemasentry -d schemasentry -f -';

    const privateKey = readFileSync(this.privateKeyPath!);

    return new Promise((resolve, reject) => {
      const connection = new Client();

      connection.on('ready', () => {
        connection.exec(command, (error, stream) => {
          if (error) {
            connection.end();
            return reject(error);
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

          stream.on('close', (code: number) => {
            connection.end();

            if (code !== 0) {
              return reject(
                new Error(errorOutput || output || 'Migration execution failed'),
              );
            }

            resolve(output.trim());
          });

          // Send SQL through stdin, not through the shell command.
          stream.end(sql);
        });
      });

      connection.on('error', (error) => {
        reject(error);
      });

      connection.connect({
        host: this.host,
        port: 22,
        username: this.username,
        privateKey,
        readyTimeout: 10000,
      });
    });
  }
}
