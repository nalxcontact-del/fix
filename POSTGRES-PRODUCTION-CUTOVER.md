# PersonaChat v85 — Production Postgres Cutover

This phase adds the final production gate for the Postgres data-plane migration.

## Activation

Production should set:

- `PERSONACHAT_PRODUCTION_POSTGRES=1`
- `PERSONACHAT_POSTGRES_ACCOUNTS=1`
- `PERSONACHAT_POSTGRES_CHAT=1`
- `PERSONACHAT_POSTGRES_SOCIAL=1`
- `PERSONACHAT_POSTGRES_CONTROL=1`
- `DATABASE_URL` or `DATABASE_POOLER_URL`

When `PERSONACHAT_PRODUCTION_POSTGRES=1` is active, production startup fails closed if the database or any migrated domain is not enabled.

## Important boundary

This gate does not delete the local SQLite file. It prevents a production deployment from starting unless the migrated Postgres domains are configured. Built-in editorial character content is static application data and is not treated as user persistence.

Before enabling the flag in production, complete and verify the SQLite-to-Postgres migrations for the current data set and keep a backup of the source database.
