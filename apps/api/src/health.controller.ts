import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database';

@Controller('health')
export class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check() {
    try {
      await this.database.ping();
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    }
  }
}
