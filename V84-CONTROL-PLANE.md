# PersonaChat v84 — Usage / Premium / OSINT / Capacity Control Plane

This phase adds the production Postgres data plane for usage, premium plan aggregation, OSINT cache/refresh state, generation reservations, quality telemetry, and concurrency capacity leases.

## What is migrated
- generation_events
- generation_reservations
- quality_events
- capacity_leases
- system_migrations
- osint_facts
- osint_sources
- osint_refresh_log

Premium entitlement remains `users.plan` (`free` / `premium`) from the existing account cutover.

## Runtime policy
The new Postgres control layer is opt-in with `PERSONACHAT_POSTGRES_CONTROL=1` and requires `DATABASE_URL` or `DATABASE_POOLER_URL`.

Beta capacity
`capacity_leases` is shared through Postgres in production. The default free concurrent limit is 5 and is persisted in `beta_capacity_settings` by migration 008. Administrators can change the limit from Admin → Capacidade; the change takes effect for all Vercel instances without a redeploy. Premium/admin accounts bypass the free queue.

The existing SQLite runtime is intentionally retained until the data-plane parity is verified and the application cutover is done in the following phase. This prevents usage accounting, capacity admission, or OSINT refresh failures from silently changing behavior mid-migration.

## Migration
Set `PERSONACHAT_DATA_DIR` to a copy of the SQLite directory and provide a Postgres/Supabase URL, then run:

```powershell
npm run db:migrate:control-postgres
```

The migration stops before writes if a source user is missing from Postgres and performs post-migration count parity checks.
