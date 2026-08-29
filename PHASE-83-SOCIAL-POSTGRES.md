# Phase 83 — Community / Social / Feedback / Reports

Opt-in Postgres runtime layer for community discovery, likes/follows, response feedback, product feedback and reports.

Flag: `PERSONACHAT_POSTGRES_SOCIAL=1`

Migration: `npm run db:migrate:social-postgres`

The migration requires the Users/Auth and Characters data to already exist in Postgres and verifies row-count parity across all seven domains before reporting success.
