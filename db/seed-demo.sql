INSERT INTO locations (code, name)
VALUES ('DEMO-DISTRIBUTOR', 'Demo Distributor'), ('DEMO-PHARMACY', 'Demo Pharmacy')
ON CONFLICT (code) DO NOTHING;

SELECT id AS distributor_id FROM locations WHERE code = 'DEMO-DISTRIBUTOR' \gset
SELECT id AS pharmacy_id FROM locations WHERE code = 'DEMO-PHARMACY' \gset

INSERT INTO batches (medicine_name, manufacturer, lot_number, expires_on)
VALUES ('Demo Medicine 100 mg', 'Demo Manufacturer', 'DEMO-' || gen_random_uuid(), CURRENT_DATE + 730)
RETURNING id AS batch_id \gset

INSERT INTO stock_receipts (batch_id, location_id, quantity)
VALUES (:batch_id, :distributor_id, 500), (:batch_id, :distributor_id, 100);

INSERT INTO stock_transfers (batch_id, from_location_id, to_location_id, quantity)
VALUES (:batch_id, :distributor_id, :pharmacy_id, 200);

INSERT INTO stock_balances (batch_id, location_id, quantity)
VALUES (:batch_id, :distributor_id, 400), (:batch_id, :pharmacy_id, 200);

SELECT 'http://127.0.0.1:5173/?batch=' || :batch_id;
