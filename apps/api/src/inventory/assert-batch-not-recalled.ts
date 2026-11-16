import type { PoolClient } from 'pg';

export class BatchRecalledError extends Error { }

export async function assertBatchNotRecalled(
    client: PoolClient,
    batchId: number,
): Promise<void> {
    await client.query(
        /* sql */ `SELECT id FROM batches WHERE id = $1 FOR NO KEY UPDATE`,
        [batchId],
    );

    const recall = await client.query(
        /* sql */ `SELECT batch_id FROM batch_recalls WHERE batch_id = $1`,
        [batchId],
    );

    if (recall.rows.length > 0) {
        throw new BatchRecalledError(`Batch ${batchId} has been recalled`);
    }
}