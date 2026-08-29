# PersonaChat — Quality Phase 70–76 (Creator Studio excluded)

This release consolidates the next product-quality pass while explicitly excluding the Character Creator Studio work planned as Phase 74.

## Implemented in this pass
- Restored a wider desktop sidebar (288px) to match the product's navigation density and the supplied mobile reference.
- Sidebar owns the vertical scroll surface so the complete conversation list remains reachable without a nested list scrollbar.
- Removed the old eight-item visual cap from desktop conversation navigation.
- Search fields force an explicit high-contrast text/caret color in dark and light themes.
- Desktop chat reading column and message bubbles are capped again to keep a conversational, non-horizontal feel.
- Regeneration uses the same in-bubble typing/stream presentation as normal generation instead of leaving a stale response visible while waiting.
- Regeneration has an in-flight ref guard to prevent duplicate requests from rapid clicks.
- Generation counter remains stable while regenerating; the animated dots remain inside the message bubble only.
- Progressive reveal was tuned to feel like streaming without making long responses wait unnecessarily.
- Existing feedback is cleared when a new generation starts; the new generation is therefore presented un-rated.
- Existing branching, rewind, pinning, memory editing, and discovery/search systems are preserved rather than replaced.
- Added reduced-motion handling for chat and navigation micro-interactions.

## Explicitly excluded
- Phase 74 / Character Creator Studio redesign.

## Reference basis
- Next.js App Router layout guidance: keep navigation and main content as separate layout surfaces with independent overflow where appropriate.
- WCAG 2.2: visible focus and focus not obscured; reduced-motion support is treated as a product-quality requirement.
- Character.AI official guidance: swiping/regeneration, Rewind to Here, Start New Chat From Here, pinned/chat memories, search/discovery, and response-quality iteration were used as product references, not implementation sources.

See the release notes for validation details.

## Phase 71.1 — clean-checkout test contract
- Added the missing `.env.example` required by `scripts/test-all.mjs`.
- Kept every secret blank and documented safe local defaults only.
- This removes a false-negative in clean environments while preserving the existing security checks.
- Full regression: 44/44 OK.
