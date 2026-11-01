# ADR-0013: Keep each external invocation together in the document

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex
**Amended**: 2026-11-01

## Context

An external invocation has documented inputs, an authored method and named
outputs. Several results can belong to the same call, including results that
no later formula uses. Separate calls with equal inputs retain separate
identities. The report needs to preserve that context across page boundaries.

The current document preparer receives an execution and captured assets. These
establish factual classification, but do not establish that verification passed.

## Decision

Add a dedicated external-call prepared item bound to its captured invocation.
Place it at the authored call position, with inputs, method and named outputs
in that order. Preserve every declared input and output, their metadata and
source context. Shared inputs retain their Symbol identities and compact call
summaries rather than new full input sections. Selecting several outputs from
one invocation does not repeat its report block.

When a comparison table replaces grouped case sections, retain complete
case-specific external blocks, labeled with the owning case and call path.
Selected table rows must not hide declared external inputs, outputs, method
text or algorithm exclusions. Keep the existing row selection and orientation
rules. Consolidating those details into another table design is deferred.

Reuse the existing quantity, notation and prose rendering inside the grouped
item. Keep the captured invocation and quantity references explicit so that
preparation can validate complete call content without relying on loose item
adjacency. Preserve authored method text; the renderer does not infer an
internal derivation or expand the adapter's loop iterations.

Print the external-source label, adapter path and callable, and the limitation
that the external algorithm is outside CSO formula verification. Retain full
hashes and environment details in machine-readable evidence. A separate coverage
summary may show verification outcomes only from a report bound to the same
captured execution. Preparation without that report may show factual external
classification, but cannot assert passed checks.

Let long methods continue at paragraph or row boundaries, with the call heading
and algorithm limitation repeated on each page. Keep an output's name, value
and unit together. Do not truncate text or shrink a whole call to fit, and do
not require an arbitrarily large call or output group to stay on one page.

## Consequences

### Positive

- Each invocation remains identifiable when its method or results span pages.
- A grouped contract supports explicit checks for missing inputs or outputs.
- Formula verification, external-call coverage and independent references can
  remain distinct without an automatic printed audit appendix.

### Negative / Trade-offs

- The prepared-document contract gains another item variant and needs a
  coordinated schema and renderer update.
- Separate invocations repeat their fixed method explanation. Method/table
  consolidation remains a separate feature.
- Printing verification outcomes requires an explicitly bound report input.

## Alternatives Considered

### Loose symbol and text items

These can approximate the appearance but make call membership and preservation
depend on item ordering. The user selected a dedicated grouped item.

### Outputs first or narrative columns

The disposable preview compared both with an input/method/output table. The user
selected the table because it keeps the complete call in its review context.
Its long text was a pagination stress case, not a recommended method length.

## Related

- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [External-result verification](0011-external-result-verification.md)
- [External execution lifetime](0012-external-execution-lifetime.md)
- [Rendering and inspection](../rendering.md)
- [Introduce imported black box calculation functions](https://github.com/viktar-b/CalculationSourceObject/issues/54)

See the [authoring guide](../authoring.md#external-functions) and
[rendering guide](../rendering.md#engineering-presentation) for supported behavior
and the maintained verification workflow. The earlier static preview was a layout
study and does not establish production-renderer acceptance.
