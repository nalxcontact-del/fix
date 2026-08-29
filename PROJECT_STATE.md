# PersonaChat Project State — v91.7 beta

## Base
- v72.3 security-migrated and validated on Windows: npm ci, lint, build, audit all passed.
- v73 OSINT-quality work merged onto the validated v72.3 dependency tree.

## v74 changes
- Merged OSINT query hardening and result-source diversification.
- Merged Windows-safe security migration helper without shell=true.
- Added phase 73 OSINT quality regression script.
- No visual/UI changes in this release.

## Validation expectation
Run npm ci, npm run lint, npm run build, npm audit --audit-level=high, and npm run check:phase73.


### v74.1 build/dependency correction
- Fixed the OSINT TypeScript build error by importing `OsintConfidence` from `lib/server/osint-policy`.
- v74.1 retains the security migration script for upgrading Next.js to 16.3.3 and validating patched Sharp resolution.


## v76 — chat async-state hardening
- Prevents an old conversation generation failure from restoring its draft or error into a newly opened conversation.
- Scopes regeneration errors to the originating conversation.
- Preserves v75 composer/streaming fixes.


## v79.2 Build-fix follow-up
- Fixed nullable stored bot image assignment in `app/api/profile/route.ts` for strict TypeScript.
- Registered and added `check:phase79-buildfix` so the project can validate this correction from a clean checkout.


## v80 — Postgres migration layer
The canonical v79.2 application remains the stable UI/runtime baseline. v80 adds a Postgres destination schema, SQLite→Postgres migration tooling, a server-only Postgres client, and parity checks. Runtime cutover remains intentionally separate and is not enabled by this phase.


## Phase 81 — Users/Auth + Characters

Added an opt-in Postgres account/session data plane and Postgres write support for user-created characters. SQLite remains the default runtime; canonical character reads intentionally remain on SQLite until the asynchronous read cutover is separately validated.

Acceptance: check:phase81.


## Phase 81.1 — auth async build fix
- Fixed async username generation in email registration and Google OAuth callback.
- Registered `check:phase81-1` regression check.


## Phase 82
- Added opt-in Postgres runtime for conversations, messages, memories and response alternatives.
- Relationships intentionally remain on SQLite during this phase.
- Added parity-checked SQLite → Postgres chat migrator and cutover schema.


## Current architecture
See `ARCHITECTURE.md` for the canonical technical architecture and maintenance boundaries.
