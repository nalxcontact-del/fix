# Codebase organization — v71.1

- Restored `app/page.tsx` and the pre-v71 global desktop CSS from v70.1.
- Kept only the v71 mobile refinement layer, scoped to mobile breakpoints.
- Removed generated `tsconfig.tsbuildinfo` from the distributable project.
- Removed unused default create-next-app SVG placeholders from `public/`.
- Moved historical phase/release/chat-polish notes into `docs/history/root-phase-archive/`.
- Kept active architecture, policy, setup, and project-state documentation in the repository root.

No API, database, authentication, OSINT, generation, memory, or Create Character logic was changed by this cleanup.
