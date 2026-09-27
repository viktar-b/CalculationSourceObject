# ADR-0002: Evidence and engineering presentation

**Status**: Accepted
**Date**: 2026-09-07
**Authors**: viktar-b

## Context

The decisions were accepted on 2026-09-06 and 2026-09-07. A generated report
must make engineering steps readable while retaining complete source and audit
data. Structural validation, numerical agreement, presentation and human
inspection answer different questions. The earlier practice of printing every
retained field added internal-record appendices that obscured the calculation.
PDF publication also needs a receipt tied to the exact execution and bytes.

## Decision

Keep source-to-document consistency, independent numerical agreement, data
retention, engineering presentation and visual inspection separate. Structural
validation and successful execution do not establish numerical correctness.
Historical review metadata cannot approve a fresh calculation.

Default HTML and PDF present the reviewable engineering narrative. Preserve
complete accepted JSON source and audit data separately, including unknown
extensions, ordered records and exact own-key identities. Assign every field
an explicit presentation or evidence destination.

Run Python once for a verified PDF. Use that captured execution for
verification, preparation and rendering. Bind independent references to the
source closure, function and resolved inputs, preserving the distinction
between positive and negative zero. Source changes require explicit review
before rebinding references, even if numerical results are unchanged.

Publish complete evidence before the final atomic PDF replacement. An unused
bundle is not a successful command receipt. `--no-evidence` is an explicit
PDF-only mode that retains verification and atomic replacement. Acceptance
receipts apply only to their recorded source revision and artifacts.

## Consequences

### Positive

- The report stays readable while complete accepted source and audit data
  remain available for inspection.
- One execution binds formulas, runtime observations, verification and rendered
  results to the same source revision and inputs.
- Reference coverage and human visual inspection retain their own statuses.
- Evidence can be checked against the final PDF and successful command report.

### Negative / Trade-offs

- Presentation and evidence need separate mappings and preservation checks.
- Source hashes identify captured Python bytes but the CLI evidence bundle does
  not retain those source bytes.
- Automatic PDF generation leaves visual inspection pending; a human-reviewed
  delivery requires findings bound to the exact PDF bytes.
- A failed final rename can leave an unused complete bundle. A stdout failure
  after PDF replacement cannot reliably roll back that filesystem change.

## Alternatives Considered

### Print every retained field

The resulting internal-record appendices obscured the engineering calculation.
Complete data remains in evidence, while the default document shows the
reviewable narrative.

## Related

- [ADR-0001: Package ownership and the CSO handoff](0001-package-ownership-and-cso-handoff.md)
- [ADR-0004: Hosted verification and PDF review](0004-hosted-verification-and-pdf-review.md)
  narrows the delivery rule for on-demand downloads with automated checks and
  pending human review.
- [CLI contract](../../packages/cso-cli/README.md)
- [Rendering guide](../rendering.md)
- [Code map](../code-map.md)
