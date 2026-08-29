# PersonaChat — Deep Audit 78

## Fixed

- Removed the hardcoded admin-email bootstrap path. Administrative ownership now depends on `PERSONACHAT_ADMIN_USER_IDS` / `PERSONACHAT_ADMIN_EMAILS`.
- Rate-limited profile reads, community reads, and response-alternative reads.
- Prevented private liked characters from appearing in another viewer's public profile response.
- Restricted follow graph details to the profile owner.
- Prevented ordinary chat state mutations from triggering a full smooth scroll-to-bottom by narrowing the entry-scroll effect dependencies.
- Added `scrollbar-gutter: stable` and `overflow-anchor: none` to the chat message surface to reduce width/layout jumps and browser anchoring fights.
- Consolidated repeated v68 scroll-to-bottom CSS.
- Switched mobile settings/chats pages to small-viewport units where full-screen height is intended.

## Findings to address before production

1. Rate limiting is process-local. A multi-instance/serverless deployment needs a shared durable limiter.
2. SQLite is still a single-node persistence design; production deployment needs a durable network database/storage strategy.
3. Community discovery aggregates all message metadata on every request; as usage grows this should move to denormalized counters or cached aggregates.
4. `app/page.tsx` and `globals.css` are very large and contain many historical overrides. They remain workable but make regressions more likely; gradual component/CSS consolidation is recommended.
5. The current ZIP still contains the security migration tool rather than a permanently regenerated 16.3.3 lockfile. The validated local tree remains the security baseline until a clean release archive is generated from that tree.
