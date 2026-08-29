# PersonaChat v83 — Community / Social / Feedback / Reports Postgres cutover

This phase is opt-in via `PERSONACHAT_POSTGRES_SOCIAL=1`.

Migrated domains:
- bot_likes
- profile_likes
- follows
- response_preference_profiles
- response_feedback
- product_feedback
- reports

Prerequisite: users from the SQLite source must already exist in Postgres. Run `db:migrate:accounts-postgres` first, then `db:migrate:social-postgres` using the same migration-copy SQLite directory and the same Postgres target.

The runtime flag should only be enabled after the migration prints `ok: true` and the SQLite/Postgres counts match for every domain.

This phase intentionally leaves unrelated admin audit/capacity and the final usage/Premium/OSINT cutover for later phases.
