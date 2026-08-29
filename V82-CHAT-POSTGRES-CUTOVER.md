# v82.1 Chat Postgres Cutover

The chat migration now applies Supabase migrations 001, 002, then 003 before copying data. It refuses to write chat rows when any SQLite user is missing from Postgres, preventing partial foreign-key migration.

The source SQLite file is copied to a temporary file before compatibility changes are made; the original is never mutated.

Run the accounts migration first when the target Postgres is empty. Then run `npm run db:migrate:chat-postgres`.
