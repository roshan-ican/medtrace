import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Database } from '../database';
import { isPositiveInteger } from './is-positive-integer';
import type { RecallBatchInput } from './recall-batch';
import { downloadRecall, inspectRecallQueue, publishRecall } from './recall-publication';

@Controller('batch-recalls')
export class BatchRecallsController {
  private readonly logger = new Logger(BatchRecallsController.name);

  constructor(private readonly database: Database) {}

  @Post()
  async create(@Body() body: Partial<RecallBatchInput> | undefined) {
    const { batchId, reason } = body ?? {};
    if (!isPositiveInteger(batchId)) {
      throw new BadRequestException('batchId must be a positive 32-bit integer');
    }
    if (typeof reason !== 'string' || reason.trim().length === 0 || reason.includes('\u0000')) {
      throw new BadRequestException('A valid recall reason is required');
    }

    try {
      const result = await this.database.recallBatch({ batchId, reason });
      const affectedUnits = result.affectedLocations.reduce((total, { quantity }) => total + quantity, 0);
      this.logger.log(`Batch ${batchId} recalled in PostgreSQL. Affected: ${affectedUnits} units at ${result.affectedLocations.length} locations.`);
      return result;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '23503') {
        throw new NotFoundException('Batch does not exist');
      }
      if (code === '23505') {
        throw new ConflictException('Batch has already been recalled');
      }
      throw error;
    }
  }

  @Post('notifications/inspect')
  @HttpCode(200)
  async inspectNotifications() {
    try {
      return await inspectRecallQueue();
    } catch (error) {
      if (error instanceof Error && error.name.endsWith('NonExistentQueue')) {
        throw new NotFoundException('Publish a recall to create the queue');
      }
      throw new ServiceUnavailableException('AWS Emulator could not read the queue');
    }
  }

  @Post(':id/publish')
  async publish(@Param('id', ParseIntPipe) id: number) {
    if (!isPositiveInteger(id)) {
      throw new BadRequestException('Batch ID must be a positive 32-bit integer');
    }
    const batch = await this.database.getBatch(id);
    if (!batch) {
      throw new NotFoundException('Batch does not exist');
    }
    if (!batch.recall) {
      throw new ConflictException('Recall this batch before publishing a report');
    }

    try {
      return await publishRecall(batch);
    } catch (error) {
      this.logger.warn(`Recall publication failed for batch ${id}: ${error instanceof Error ? error.name : 'UnknownError'}`);
      throw new ServiceUnavailableException('AWS Emulator could not complete publication. Try again.');
    }
  }

  @Get(':id/report')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="medtrace-recall.json"')
  async report(@Param('id', ParseIntPipe) id: number) {
    if (!isPositiveInteger(id)) {
      throw new BadRequestException('Batch ID must be a positive 32-bit integer');
    }
    try {
      return await downloadRecall(id);
    } catch (error) {
      if (error instanceof Error && ['NoSuchKey', 'NoSuchBucket'].includes(error.name)) {
        throw new NotFoundException('Publish the recall to create its report');
      }
      throw new ServiceUnavailableException('AWS Emulator could not retrieve the report');
    }
  }
}
