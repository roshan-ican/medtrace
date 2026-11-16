import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Database } from '../database';
import { BatchRecalledError } from './assert-batch-not-recalled';
import { isPositiveInteger } from './is-positive-integer';
import type { ReceiveStockInput } from './receive-stock';

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
      if (error instanceof BatchRecalledError) {
        throw new ConflictException(error.message);
      }
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
