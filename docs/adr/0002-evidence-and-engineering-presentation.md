---
status: accepted
---

# Evidence and engineering presentation

This records decisions accepted on 2026-09-06 and 2026-09-07.

## Decision

Keep source-to-document consistency, independent numerical agreement, data
retention, engineering presentation and visual inspection separate. Structural
validation and successful execution cannot establish numerical correctness.
Historical review metadata cannot approve a fresh calculation.

Default HTML/PDF presents the reviewable engineering narrative. Preserve complete
accepted JSON source/audit data separately, including unknown extensions, ordered
records and exact own-key identities. Each field has an explicit presentation or
evidence destination. This supersedes the earlier requirement to print every
retained field, which produced internal-record appendices and obscured calculations.

Run Python once for a verified PDF and use that same captured execution for
verification, preparation and rendering. Bind independent references to source
closure, function and resolved inputs; preserve the distinction between positive
and negative zero. Reference revisions require explicit review after source
changes, even when numerical results are unchanged.

Publish complete evidence before the final atomic PDF replacement. An unused
bundle is not a successful command receipt. The filesystem commit cannot be
rolled back reliably if stdout subsequently fails. `--no-evidence` is an explicit
PDF-only mode; it retains verification and atomic replacement.

## Consequences

Source metadata, raw execution evidence and engineering presentation have
different roles. Source hashes identify captured Python bytes but do not retain
those source bytes in the CLI evidence bundle. Automatic generation leaves
visual inspection pending; delivery requires findings bound to the exact PDF.

The [CLI contract](../../apps/cso-cli/README.md), [rendering guide](../rendering.md)
and [code map](../code-map.md) point to the current implementation and tests.
Acceptance receipts apply only to their recorded source revision and artifacts.
