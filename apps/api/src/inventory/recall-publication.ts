import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Agent } from 'node:https';
import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CreateQueueCommand, GetQueueUrlCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { fromIni } from '@aws-sdk/credential-providers';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { getBatch } from './get-batch';

const logger = new Logger('RecallPublication');
const bucket = 'medtrace-recall-reports';
const queue = 'medtrace-recall-notifications.fifo';

async function emulatorConfig() {
  return {
    endpoint: 'https://aws-emulator:9297',
    region: 'us-east-1',
    credentials: fromIni({
      profile: 'default',
      filepath: '/run/aws-emulator/emulator_credentials',
      configFilepath: '/dev/null',
      ignoreCache: true,
    }),
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({
      // The emulator certificate identifies localhost, including when reached over Compose DNS.
      httpsAgent: new Agent({
        ca: await readFile('/run/aws-emulator/ca.pem'),
        servername: 'localhost',
      }),
      connectionTimeout: 2000,
      requestTimeout: 5000,
    }),
  };
}

export async function publishRecall(batch: NonNullable<Awaited<ReturnType<typeof getBatch>>>) {
  const config = await emulatorConfig();
  const s3 = new S3Client({ ...config, forcePathStyle: true });
  const sqs = new SQSClient({ ...config, useQueueUrlAsEndpoint: false });
  const key = `recalls/batch-${batch.id}.json`;
  const affectedLocations = batch.balances.filter(({ quantity }) => quantity > 0);
  const affectedUnits = affectedLocations.reduce((total, { quantity }) => total + quantity, 0);

  try {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'BucketAlreadyOwnedByYou') {
        throw error;
      }
    }

    const { QueueUrl } = await sqs.send(new CreateQueueCommand({
      QueueName: queue,
      Attributes: { FifoQueue: 'true' },
    }));
    if (!QueueUrl) {
      throw new Error('AWS Emulator returned no queue URL');
    }

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: 'application/json',
      Body: JSON.stringify({ ...batch, affectedLocations, affectedUnits }, null, 2),
    }));

    logger.log(`S3 PutObject saved s3://${bucket}/${key} for ${affectedUnits} affected units.`);

    const { MessageId } = await sqs.send(new SendMessageCommand({
      QueueUrl,
      MessageBody: JSON.stringify({ batchId: batch.id, lotNumber: batch.lotNumber, bucket, key, affectedUnits }),
      MessageGroupId: 'batch-recalls',
      MessageDeduplicationId: `batch-${batch.id}`,
    }));
    if (!MessageId) {
      throw new Error('AWS Emulator returned no message ID');
    }

    logger.log(`SQS SendMessage queued recall for batch ${batch.id}. Message ID: ${MessageId}`);
    return { bucket, key, queue, messageId: MessageId };
  } finally {
    config.requestHandler.destroy();
  }
}

export async function downloadRecall(batchId: number): Promise<string> {
  const config = await emulatorConfig();
  const s3 = new S3Client({ ...config, forcePathStyle: true });
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: `recalls/batch-${batchId}.json`,
    }));
    if (!result.Body) {
      throw new Error('AWS Emulator returned an empty report');
    }
    const report = await result.Body.transformToString();
    logger.log(`S3 GetObject read the report for batch ${batchId}.`);
    return report;
  } finally {
    s3.destroy();
  }
}

export async function inspectRecallQueue() {
  const sqs = new SQSClient({ ...await emulatorConfig(), useQueueUrlAsEndpoint: false });
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queue }));
    if (!QueueUrl) {
      throw new Error('AWS Emulator returned no queue URL');
    }

    const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: 10,
      VisibilityTimeout: 0,
      WaitTimeSeconds: 1,
    }));
    logger.log(`SQS ReceiveMessage returned ${Messages.length} messages from ${queue}.`);
    return {
      queue,
      messages: Messages.map(({ MessageId, Body }) => ({ id: MessageId, body: Body ?? '' })),
    };
  } finally {
    sqs.destroy();
  }
}
