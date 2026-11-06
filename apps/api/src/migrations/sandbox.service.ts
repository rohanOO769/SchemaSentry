// apps/api/src/migrations/sandbox.service.ts

import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Client } from 'ssh2';
import { existsSync,readFileSync } from 'node:fs';

@Injectable()
export class SandboxService {
  private readonly host = process.env.SANDBOX_SSH_HOST;
  private readonly username = process.env.SANDBOX_SSH_USER;
  private readonly privateKeyPath = process.env.SANDBOX_SSH_KEY_PATH;

  private readonly sandboxName = 'schemasentry-migration-test';

  constructor() {
    if (!this.host || !this.username || !this.privateKeyPath) {
      throw new Error('Sandbox SSH configuration was not loaded');
    }

    if (!existsSync(this.privateKeyPath)) {
      throw new Error('Sandbox SSH private key file was not found');
    }
  }

  async execute(command: string): Promise<string> {
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
    ];

    if (!allowedCommands.includes(command)) {
      throw new Error('Unsupported sandbox operation');
    }

    const commands: Record<string, string> = {
      SELECT_VERSION:
        `/home/sandboxuser/.local/bin/msb exec ${this.sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT version();"`,

      CAPTURE_SCHEMA:
        `/home/sandboxuser/.local/bin/msb exec ${this.sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT json_agg(row_to_json(c)) FROM (SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position) c;"`,

      CAPTURE_TABLE_STATS:
        `/home/sandboxuser/.local/bin/msb exec ${this.sandboxName} -- psql -U schemasentry -d schemasentry -t -A -c "SELECT COALESCE(jsonb_object_agg(table_name, row_count), '{}'::jsonb) FROM (SELECT table_name, (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) AS count FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS row_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') counts;"`,
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
    sandboxName = 'schemasentry-migration-test',
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
