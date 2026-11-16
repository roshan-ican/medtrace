import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Database } from './database';
import { HealthController } from './health.controller';
import { StockReceiptsController } from './inventory/stock-receipts.controller';
import { BatchesController } from './inventory/batches.controller';
@Module({
  controllers: [HealthController, StockReceiptsController, BatchesController],
  providers: [Database],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});