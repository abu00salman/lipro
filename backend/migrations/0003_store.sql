-- Store orders. Same columns as the live lipro-db table so data copies over unchanged.
-- Money columns are halalas (total_price INTEGER). IF NOT EXISTS: this table already exists on lipro-db-v2.
CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,
  order_number       TEXT NOT NULL UNIQUE,
  items_json         TEXT NOT NULL,
  subtotal_price     TEXT,
  delivery_fee       INTEGER DEFAULT 0,
  total_price        INTEGER NOT NULL,
  customer_name      TEXT NOT NULL,
  customer_mobile    TEXT NOT NULL,
  city               TEXT,
  district           TEXT,
  address            TEXT NOT NULL,
  website            TEXT,
  notes              TEXT,
  delivery_method    TEXT,
  delivery_method_name TEXT,
  currency           TEXT NOT NULL DEFAULT 'SAR',
  payment_gateway    TEXT NOT NULL DEFAULT 'bank_transfer',
  order_status       TEXT NOT NULL DEFAULT 'new',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  tap_charge_id      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ord_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_ord_mobile ON orders(customer_mobile);
CREATE INDEX IF NOT EXISTS idx_ord_status ON orders(order_status);
