# Security policy

Do not file a public issue for a vulnerability.

Report privately with a
[GitHub security advisory](https://github.com/viktar-b/CalculationSourceObject/security/advisories/new)
for `viktar-b/CalculationSourceObject`.

## Supported versions

Only the latest `main` of this repository is supported. No older release line
is maintained.

## Ownership and response targets

The repository maintainer, [@viktar-b](https://github.com/viktar-b), owns security
alerts and failed security updates until another owner is recorded. Review
security notifications promptly and review the open alerts and failed Dependabot
jobs at least weekly. Response targets run from detection or receipt of a report:

| Finding | Required response |
| --- | --- |
| Confirmed exposed credential | Revoke or rotate immediately, then investigate use and remove the exposure. Deleting a file or rewriting Git history does not revoke a credential. |
| High or critical vulnerability | Assess within 24 hours. Block affected releases until fixed or a maintainer records a reasoned risk acceptance with an expiry and mitigation. |
| Other vulnerability | Triage within seven days and record an owner, exposure assessment, next action and review date. |

Keep undisclosed vulnerabilities and credential details in the private advisory
or alert record. Track public, unresolved remediation work in
[the backlog](docs/backlog.md), following the repository's issue-tracker rules.
Record why a finding is dismissed; severity alone is not a dismissal reason.

## Failed automatic updates

A failed Dependabot job is not a completed fix. Its owner must inspect the
failure within the finding's response target, identify the blocking dependency
or service error, and record a manual next action and review date. Inspect
transient failures before retrying; do not repeatedly retry a dependency conflict.

For dependency conflicts, evaluate an upgrade of the parent package first. Any
override must explain compatibility and pass the affected package tests and the
required PR checks, including installed-package checks. Confirm the resolved
lockfile no longer contains the affected version before closing remediation.
If a fix is unavailable, record the exposure, mitigation and next review date;
keep the alert open unless its dismissal is justified. Passing an audit with a
high-severity threshold does not resolve lower-severity findings.

The [development guide](docs/development.md#continuous-integration) owns the
automated scanning and merge requirements. Scans support this response process;
they do not replace maintainer triage.

## Out of scope

The following are not treated as security reports:

- correctness of a user's own engineering calculation
- agreement with an independent numerical reference case
- human approval of a generated PDF
