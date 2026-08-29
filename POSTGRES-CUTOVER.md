# PersonaChat Postgres cutover (v80)

## What this phase does

v80 creates the production Postgres destination and a repeatable SQLite -> Postgres migrator. The live application remains on SQLite until the runtime cutover phase is completed and validated.

## Recommended Supabase connections

- **Migration / administrative work:** use the Supabase direct connection string. Supabase documents direct connections as the option for migrations and backups.
- **Serverless runtime:** use the transaction pooler on port 6543; transaction mode does not support prepared statements, so Postgres.js is configured with `prepare: false`.

See the official Supabase connection guidance for current connection-mode details. 

## One-time setup

1. Create a Supabase project.
2. Put the direct connection string in `DATABASE_URL` for the migration only.
3. Keep the transaction pooler connection in `DATABASE_POOLER_URL` for the later runtime cutover.
4. Install dependencies with `npm install` so `postgres@3.4.9` is added to the lockfile.
5. Keep a backup of the SQLite database.

## Migration

Run:

```powershell
npm run db:migrate:postgres
```

Optional source database path:

```powershell
node scripts/migrate-sqlite-to-postgres.mjs "C:\path\to\personachat.db"
```

The migration is read-only against SQLite. It creates all 25 current application tables, copies rows in batches, recreates indexes, adds foreign keys after data copy, and performs a row-count parity check.

`PERSONACHAT_POSTGRES_FRESH=1` truncates the target tables before copy. Use that only against a disposable or intentionally reset target.

## Important

Do not switch `PERSONACHAT_REQUIRE_POSTGRES=1` yet. The runtime adapter is intentionally not wired into the existing synchronous `getDb().prepare().get/all/run` API in this phase. That cutover will be a separate, tested phase so login, chat, memory, community, moderation, usage, Premium, and OSINT are not broken by a large async refactor.
