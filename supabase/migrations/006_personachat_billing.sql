-- PersonaChat billing ledger. Provider owns the payment lifecycle; this table
-- keeps the minimum local state needed to map subscriptions to users safely.
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT UNIQUE,
  billing TEXT NOT NULL CHECK (billing IN ('monthly','yearly')),
  status TEXT NOT NULL,
  currency TEXT,
  amount DOUBLE PRECISION,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  current_period_end BIGINT,
  cancel_at_period_end BIGINT NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_status ON billing_subscriptions(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_provider_id ON billing_subscriptions(provider, provider_subscription_id);
