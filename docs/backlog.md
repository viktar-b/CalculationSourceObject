# Backlog

## SEC-001: Resolve the esbuild security-update dependency conflict

- Status: Open; automatic remediation is blocked by the parent dependency range.
- Triage: ready-for-agent
- Owner: @viktar-b
- Reviewed: 2026-09-14
- Next review: 2026-09-21
- Finding: [Dependabot alert 42](https://github.com/viktar-b/CalculationSourceObject/security/dependabot/42),
  low severity, development dependency, GHSA-g7r4-m6w7-qqqr. The advisory concerns
  esbuild's development server on Windows. Exposure in this project's use of
  esbuild has not been established; the alert remains open, with no risk acceptance.
- Blocker: [Run 34868382739](https://github.com/viktar-b/CalculationSourceObject/actions/runs/34868382739)
  reports `security_update_not_possible`: `tsup@8.5.1` requires `esbuild@^0.27.0`,
  making `0.27.7` the latest resolvable version; the first patched version is
  `0.28.1`. Recheck these constraints before changing dependencies.
- Scope and next action: inspect the resolved dependency paths and server use;
  evaluate a compatible parent-package upgrade first. If an override is needed,
  document why it is compatible. Update the lockfile through npm and validate
  the affected builds, all four required checks, and installed library archives.
  Do not dismiss the alert merely because the high-severity audit passes.
- Completion evidence: pending. Record the merged fix, resolved dependency
  versions, successful checks and alert state. If remediation remains blocked,
  record exposure and mitigation with the next review date. Remove this entry
  once remediation evidence has been preserved in the owning PR or alert.
