CREATE TABLE batch_recalls (
    batch_id integer PRIMARY KEY REFERENCES batches (id),
    reason text NOT NULL CHECK (btrim(reason) <> ''),
    recalled_at timestamptz NOT NULL DEFAULT now()
);
