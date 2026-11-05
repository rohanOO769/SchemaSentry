// apps/api/src/health/health.controller.ts

import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      service: 'schemasentry-api',
      timestamp: new Date().toISOString(),
    };
  }
}