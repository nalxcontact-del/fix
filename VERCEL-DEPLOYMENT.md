# PersonaChat — Vercel deployment contract

This repository is prepared for a Vercel Preview/Production deployment with PostgreSQL as the production data plane and Stripe as the only billing provider.

## Required production variables

- `DATABASE_POOLER_URL` — Supabase transaction pooler URL for serverless runtime.
- `DATABASE_URL` — direct/admin connection, used for migrations and administrative tasks; do not expose it to the browser.
- `PERSONACHAT_PRODUCTION_POSTGRES=1`
- `PERSONACHAT_POSTGRES_ACCOUNTS=1`
- `PERSONACHAT_POSTGRES_CHAT=1`
- `PERSONACHAT_POSTGRES_SOCIAL=1`
- `PERSONACHAT_POSTGRES_CONTROL=1`
- `PERSONACHAT_REQUIRE_POSTGRES=1`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MONTHLY_PRICE_ID`
- `STRIPE_YEARLY_PRICE_ID`
- `PERSONACHAT_ADMIN_EMAILS`

## Recommended infrastructure variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_STORAGE_PUBLIC_BASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PERSONACHAT_PUBLIC_URL`
- `GOOGLE_REDIRECT_URI`

## Beta capacity

The initial capacity is 5 concurrent Free users. The persistent value is stored in Postgres by migration `008_personachat_beta_capacity.sql` and can be changed from Admin → Capacidade without a redeploy.

Premium and admin accounts bypass the Free queue.

## Stripe webhook

Configure:

`https://YOUR_VERCEL_DOMAIN/api/webhooks/stripe`

Events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Never put Stripe secrets in `NEXT_PUBLIC_*` variables.

## Deployment order

1. Create the Supabase project.
2. Apply migrations `001` through `008` to the target database.
3. Run the SQLite→Postgres migration tools against a backup/test copy and verify row parity.
4. Configure Vercel Preview variables first.
5. Deploy a Preview.
6. Test auth, chat, queue, admin capacity and Stripe test mode.
7. Only then promote to Production.

The application intentionally fails closed when production Postgres cutover is requested but its required flags/database are missing.
