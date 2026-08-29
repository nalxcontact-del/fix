# Phase 81 — Users/Auth + Characters

This phase introduces an opt-in Postgres data plane for accounts, sessions, and user-created characters. Default behavior remains SQLite so the existing product is unchanged until the target database is migrated and verified.

## Enable
Set `PERSONACHAT_POSTGRES_ACCOUNTS=1` and configure `DATABASE_URL` (or `DATABASE_POOLER_URL`). The Postgres schema from `supabase/migrations/002_personachat_postgres_core.sql` must already exist.

## Migrate
Run the v80 migration for the existing SQLite database against a dedicated/test Postgres target first. Verify row parity before enabling the flag. For production, use a backup and an isolated cutover window.

## Scope
- users
- sessions
- password login/register
- Google account lookup/create/link
- account deletion
- profile writes
- user-created character create/update/delete

Character reads intentionally remain on the existing canonical SQLite loader during this phase so the current synchronous chat path is not changed. This provides a safe write-path cutover first. A later phase will move canonical character reads to Postgres and validate chat discovery parity before removing SQLite dependency.

## Rollback
Unset `PERSONACHAT_POSTGRES_ACCOUNTS` and restart the app to return account/session runtime to SQLite. Do not treat this as data rollback: writes made only to Postgres must be migrated back before reverting after a live cutover.
