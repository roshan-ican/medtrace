import type { Pool } from 'pg';
import { assertBatchNotRecalled } from './assert-batch-not-recalled';

export interface TransferStockInput {
    batchId: number;
    fromLocationId: number;
    toLocationId: number;
    quantity: number;
}

export class InsufficientStockError extends Error { }

export async function transferStock(pool: Pool, input: TransferStockInput) {

    const { batchId, fromLocationId, toLocationId, quantity } = input;

    const client = await pool.connect();
    let discardClient = false;

    try {
        await client.query('BEGIN');

        await assertBatchNotRecalled(client, batchId);
        const transfer = await client.query<{ id: number }>(
            /* sql */ `INSERT INTO stock_transfers (batch_id, from_location_id, to_location_id, quantity)
            VALUES ($1, $2, $3, $4)
            RETURNING id`,
            [batchId, fromLocationId, toLocationId, quantity]
        );

        const source = await client.query<{ quantity: number }>(
            /* sql */ `UPDATE stock_balances
            SET quantity = stock_balances.quantity - $3
            WHERE batch_id = $1 AND location_id = $2 AND quantity >= $3
            RETURNING quantity`,
            [batchId, fromLocationId, quantity]
        );

        if (source.rowCount === 0) {
            throw new InsufficientStockError(`Insufficient stock at location ${fromLocationId} for batch ${batchId}`);
        }
        const destination = await client.query<{ quantity: number }>(
            /* sql */ `INSERT INTO stock_balances (batch_id, location_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (batch_id, location_id)
            DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity
            RETURNING quantity`,
            [batchId, toLocationId, quantity]
        );
        await client.query('COMMIT');

        return {
            transferId: transfer.rows[0].id,
            sourceQuantityOnHand: source.rows[0].quantity,
            destinationQuantityOnHand: destination.rows[0].quantity,
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            discardClient = true;
        }
        throw error;
    }
    finally {
        client.release(discardClient);
    }
}