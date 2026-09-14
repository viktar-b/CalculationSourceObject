# Backlog

## SEC-001: Resolve the esbuild security-update dependency conflict

- Status: Fix implemented on `codex/fix-esbuild-security`; awaiting PR checks
  and maintainer review. Main-branch remediation remains pending.
- Triage: needs-triage
- Owner: @viktar-b
- Reviewed: 2026-09-14
- Next review: 2026-09-21
- Finding: [Dependabot alert 42](https://github.com/viktar-b/CalculationSourceObject/security/dependabot/42),
  low severity, development dependency, GHSA-g7r4-m6w7-qqqr. The advisory concerns
  esbuild's development server on Windows. No use of esbuild's server API or
  `--serve` was found in owned code; the alert remains open, with no risk acceptance.
- Upstream constraint: `tsup@8.5.1` is still the latest release and requires
  `esbuild@^0.27.0`, excluding the first patched version, `0.28.1`.
- Fix: pin esbuild to `0.28.2` for workspace and standalone project builds and
  update the browser-archive consumer. The lockfile was regenerated through npm;
  only esbuild and its platform binaries changed. The rationale and removal
  condition live in [development](development.md).
- Evidence so far: clean `npm ci`, `npm ls esbuild tsup --all` (only `0.28.2`),
  full `npm audit --json` (zero vulnerabilities), and `npm run build:cli` passed.
  PR checks will supply isolation, quality, installed-package and dependency-review
  evidence before review.
- Next action: review the PR, merge after all required checks pass, then verify
  the main-branch dependency graph and alert closure. Preserve final evidence in
  the PR and remove this entry after remediation is confirmed.
