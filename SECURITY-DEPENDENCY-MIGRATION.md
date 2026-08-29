# PersonaChat — Security Dependency Migration

## Why this exists

The stable v71.2 dependency tree installs cleanly and the application passes lint/build. However, Next.js 16.2.12 is behind the August 25, 2026 security release. The official Next.js release notes recommend upgrading to 16.3.3 to address two critical vulnerabilities.

The current lockfile also resolves `sharp@0.34.5`, which is below the patched `sharp@0.35.0`; the sharp maintainers recommend the latest 0.35.x release for the libvips vulnerabilities fixed in July 2026.

## Safe migration

Do not run `npm audit fix --force`.

From the project root, run:

```powershell
node scripts/upgrade-security-deps.mjs
```

The script:

1. updates Next.js to exactly 16.3.3;
2. updates eslint-config-next to exactly 16.3.3;
3. pins sharp to 0.35.3 through an npm override;
4. regenerates package-lock.json with your registry;
5. prints the resolved security-sensitive versions;
6. runs `npm audit --audit-level=high`.

After it succeeds:

```powershell
npm ci
npm run lint
npm run build
```

The lockfile generated on the developer/CI machine must be committed and distributed with the project. The migration script is intentionally not a substitute for the final lockfile.

## Why we do not commit a hand-edited lockfile

`package-lock.json` contains registry metadata and integrity information for a large platform-specific optional dependency tree. Hand-editing it is unsafe. The project should let npm regenerate it against the actual registry, then validate the resulting installation and production build.
