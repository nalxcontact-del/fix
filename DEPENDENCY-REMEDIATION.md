# Dependency remediation — v33

This release remediates the three high-severity advisories reported by the v32 local `npm audit`:

- `brace-expansion`: pinned to patched 1.1.18 / 5.0.9 branches as required by their respective minimatch trees.
- `js-yaml`: pinned to 4.3.1.
- `nanoid`: pinned to 3.3.18.

The project uses npm `overrides` so a fresh install does not silently reintroduce the vulnerable transitive versions. The lockfile entries are updated to the patched versions; npm should refresh integrity metadata during `npm install` in an environment with registry access.

Do not use `npm audit fix --force` blindly. After extracting the package, run:

```powershell
npm install
npm audit
npm ls brace-expansion js-yaml nanoid
npm run lint
npm run build
npm run test:all
npm run check:release-candidate
npm run check:beta-readiness
```

The advisories addressed here are: GHSA-rgw5-rvv9-x895 (`brace-expansion`), GHSA-5p4m-2wfm-xmqj (`js-yaml`), and GHSA-2v37-7h3g-55p8 (`nanoid`).
