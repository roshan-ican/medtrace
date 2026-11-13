CREATE TABLE batches (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    medicine_name text NOT NULL,
    manufacturer text NOT NULL,
    lot_number text NOT NULL,
    expires_on date NOT NULL,
    UNIQUE (medicine_name, manufacturer, lot_number)
);

CREATE TABLE locations (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE stock_receipts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id integer NOT NULL REFERENCES batches (id),
    location_id integer NOT NULL REFERENCES locations (id),
    quantity integer NOT NULL CHECK (quantity > 0),
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_balances (
    batch_id integer NOT NULL REFERENCES batches (id),
    location_id integer NOT NULL REFERENCES locations (id),
    quantity integer NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (batch_id, location_id)
);