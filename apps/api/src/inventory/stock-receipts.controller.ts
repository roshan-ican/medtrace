import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Database } from '../database';
import type { ReceiveStockInput } from './receive-stock';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

@Controller('stock-receipts')
export class StockReceiptsController {
  constructor(private readonly database: Database) {}

  @Post()
  async create(@Body() body: Partial<ReceiveStockInput> | undefined) {
    const { batchId, locationId, quantity } = body ?? {};
    if (!isPositiveInteger(batchId) || !isPositiveInteger(locationId) || !isPositiveInteger(quantity)) {
      throw new BadRequestException('batchId, locationId, and quantity must be positive 32-bit integers');
    }

    try {
      return await this.database.receiveStock({ batchId, locationId, quantity });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '23503') {
        throw new NotFoundException('Batch or location does not exist');
      }
      if (code === '22003') {
        throw new ConflictException('The resulting stock balance exceeds the supported range');
      }
      throw error;
    }
  }
}
