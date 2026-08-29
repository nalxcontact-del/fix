-- PersonaChat v91.7 — durable beta capacity control.
-- Stores the operator-controlled free concurrency limit in Postgres so Vercel
-- instances share the same admission policy.
CREATE TABLE IF NOT EXISTS beta_capacity_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  capacity INTEGER NOT NULL CHECK (capacity >= 1 AND capacity <= 10000),
  updated_at BIGINT NOT NULL,
  updated_by TEXT
);

INSERT INTO beta_capacity_settings (id, capacity, updated_at, updated_by)
VALUES (1, 5, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_beta_capacity_settings_updated
  ON beta_capacity_settings(updated_at DESC);
