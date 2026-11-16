CREATE TABLE stock_transfers (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id integer NOT NULL REFERENCES batches (id),
    from_location_id integer NOT NULL REFERENCES locations (id),
    to_location_id integer NOT NULL REFERENCES locations (id),
    quantity integer NOT NULL CHECK (quantity > 0),
    transferred_at timestamptz NOT NULL DEFAULT now(),
    CHECK (from_location_id <> to_location_id)
);
