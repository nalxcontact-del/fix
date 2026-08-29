-- Billing provider extensions for Stripe.
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer ON billing_subscriptions(provider, provider_customer_id);
