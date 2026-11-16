import type { Pool } from 'pg';

interface BatchDetails {
  id: number;
  medicineName: string;
  manufacturer: string;
  lotNumber: string;
  expiresOn: string;
  balances: Array<{
    locationCode: string;
    locationName: string;
    quantity: number;
  }>;
  receipts: Array<{
    id: number;
    locationCode: string;
    quantity: number;
    receivedAt: string;
  }>;
  recall: {
    reason: string;
    recalledAt: string;
  } | null;
  transfers: Array<{
    id: number;
    fromLocationCode: string;
    toLocationCode: string;
    quantity: number;
    transferredAt: string;
  }>;
}

export async function getBatch(
  pool: Pool,
  batchId: number,
): Promise<BatchDetails | null> {
  const result = await pool.query<BatchDetails>(
    /* sql */ `SELECT
       b.id,
       b.medicine_name AS "medicineName",
       b.manufacturer,
       b.lot_number AS "lotNumber",
       to_char(b.expires_on, 'YYYY-MM-DD') AS "expiresOn",
       COALESCE((
         SELECT json_agg(
           json_build_object(
             'locationCode', l.code,
             'locationName', l.name,
             'quantity', s.quantity
           ) ORDER BY l.code
         )
         FROM stock_balances s
         JOIN locations l ON l.id = s.location_id
         WHERE s.batch_id = b.id
       ), '[]'::json) AS balances,
       COALESCE((
         SELECT json_agg(
           json_build_object(
             'id', r.id,
             'locationCode', l.code,
             'quantity', r.quantity,
             'receivedAt', r.received_at
           ) ORDER BY r.received_at DESC, r.id DESC
         )
         FROM stock_receipts r
         JOIN locations l ON l.id = r.location_id
         WHERE r.batch_id = b.id
       ), '[]'::json) AS receipts,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', t.id,
              'fromLocationCode', l_from.code,
              'toLocationCode', l_to.code,
              'quantity', t.quantity,
              'transferredAt', t.transferred_at
            ) ORDER BY t.transferred_at DESC, t.id DESC
          )
          FROM stock_transfers t
          JOIN locations l_from ON l_from.id = t.from_location_id
          JOIN locations l_to ON l_to.id = t.to_location_id
          WHERE t.batch_id = b.id
        ), '[]'::json) AS transfers,
       (
         SELECT json_build_object(
           'reason', recall.reason,
           'recalledAt', recall.recalled_at
         )
         FROM batch_recalls recall
         WHERE recall.batch_id = b.id
       ) AS recall
      FROM batches b
      WHERE b.id = $1`,
    [batchId],
  );

  return result.rows[0] ?? null;
}