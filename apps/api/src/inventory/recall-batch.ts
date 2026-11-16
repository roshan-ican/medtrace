import type { Pool } from 'pg';

export interface RecallBatchInput {
  batchId: number;
  reason: string;
}

interface RecallRecord {
  batchId: number;
  reason: string;
  recalledAt: Date;
}

interface AffectedLocation {
  locationCode: string;
  locationName: string;
  quantity: number;
}

export async function recallBatch(
  pool: Pool,
  input: RecallBatchInput,
): Promise<{
  recallRecord: RecallRecord;
  affectedLocations: AffectedLocation[];
}> {
  const { batchId, reason } = input;
  const client = await pool.connect();
  let discardClient = false;

  try {
    await client.query("BEGIN");
    await client.query(
      /* sql */ `SELECT id FROM batches
            WHERE id = $1 FOR NO KEY UPDATE`,
      [batchId],
    );

    const recall = await client.query<RecallRecord>(
      /* sql */ `INSERT INTO batch_recalls (batch_id, reason)
            VALUES ($1, $2)
            RETURNING batch_id AS "batchId", reason, recalled_at AS "recalledAt"`,
      [batchId, reason.trim()],
    );

    const affected = await client.query<AffectedLocation>(
      /* sql */ `SELECT l.code AS "locationCode",
                        l.name AS "locationName",
                        s.quantity
                 FROM stock_balances s
                 JOIN locations l ON l.id = s.location_id
                 WHERE s.batch_id = $1 AND s.quantity > 0
                 ORDER BY l.code`,
      [batchId],
    );

    await client.query("COMMIT");
    return { recallRecord: recall.rows[0], affectedLocations: affected.rows };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
