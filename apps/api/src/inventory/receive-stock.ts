import type { Pool } from 'pg';
import { assertBatchNotRecalled } from './assert-batch-not-recalled';

export interface ReceiveStockInput {
    batchId: number;
    locationId: number;
    quantity: number;
}

export async function receiveStock(pool: Pool, input: ReceiveStockInput) {
    const client = await pool.connect();
    const values = [input.batchId, input.locationId, input.quantity];
    let discardClient = false;

    try {
        await client.query('BEGIN');
        await assertBatchNotRecalled(client, input.batchId);
        const receipt = await client.query<{ id: number }>(
            /* sql */ `INSERT INTO stock_receipts (batch_id, location_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING id`,
            values,
        );

        const balance = await client.query<{ quantity: number }>(
            /* sql */ `INSERT INTO stock_balances (batch_id, location_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (batch_id, location_id)
       DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity
       RETURNING quantity`,
            values,
        );

        await client.query('COMMIT');

        return {
            receiptId: receipt.rows[0].id,
            quantityOnHand: balance.rows[0].quantity,
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            discardClient = true;
        }
        throw error;
    } finally {
        client.release(discardClient);
    }
}