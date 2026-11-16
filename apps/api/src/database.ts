import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { receiveStock, type ReceiveStockInput } from './inventory/receive-stock';
import { getBatch } from './inventory/get-batch';


@Injectable()
export class Database implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });
    this.pool.on('error', (error) => console.error('Idle database connection failed', error));
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  receiveStock(input: ReceiveStockInput) {
    return receiveStock(this.pool, input);
  }

  getBatch(batchId: number) {
    return getBatch(this.pool, batchId);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
