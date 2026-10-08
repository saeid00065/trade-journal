CREATE TABLE IF NOT EXISTS mt_trades (
  account_id TEXT NOT NULL,
  ticket TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  volume REAL NOT NULL,
  open_time TEXT,
  close_time TEXT NOT NULL,
  open_price REAL,
  close_price REAL,
  profit REAL NOT NULL,
  commission REAL NOT NULL DEFAULT 0,
  swap REAL NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, ticket)
);
