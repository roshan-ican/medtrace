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
import { InsufficientStockError, type TransferStockInput } from './transfer-stock';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly database: Database) {}

  @Post()
  async create(@Body() body: Partial<TransferStockInput> | undefined) {
    const { batchId, fromLocationId, toLocationId, quantity } = body ?? {};
    if (
      !isPositiveInteger(batchId) ||
      !isPositiveInteger(fromLocationId) ||
      !isPositiveInteger(toLocationId) ||
      !isPositiveInteger(quantity)
    ) {
      throw new BadRequestException('batchId, fromLocationId, toLocationId, and quantity must be positive 32-bit integers');
    }
    if (fromLocationId === toLocationId) {
      throw new BadRequestException('Source and destination locations must differ');
    }

    try {
      return await this.database.transferStock({ batchId, fromLocationId, toLocationId, quantity });
    } catch (error) {
      if (error instanceof InsufficientStockError || error instanceof BatchRecalledError) {
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
