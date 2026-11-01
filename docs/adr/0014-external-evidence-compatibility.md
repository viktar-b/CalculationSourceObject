# ADR-0014: Preserve external-call evidence across supported consumers

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

External invocations add result definitions, coverage information and document
items that older strict readers cannot interpret. Current CLI execution detects
an incompatible Python response after running the calculation. Some existing
exports retain only mathematical rows or the CSO object, losing invocation
evidence and method text. Exporting an external result as a literal would freeze
the number without preserving the calculation that produced it.

## Decision

Introduce the feature through a coordinated producer/reader update. Give changed
execution, prepared-document, report and reference contracts explicit version
handling. Change other format versions only when their contracts change. Update
Python, core, React, CLI and initializer dependency pins together. Establish
support for the external-call protocol before invoking an adapter; response
validation after execution is insufficient for this feature.

Continue reading currently supported pure-CSO captures under their existing
rules. Do not invent external-call evidence, numeric kinds or stronger coverage
claims for historical data. Reprepare saved documents from supported retained
captures and assets without executing Python. This does not restore support for
previously rejected prepared-document versions.

Support full captured evidence and prepared HTML/PDF as the v1 preservation
paths for external invocations. Reject standalone CSO export and conversions to
math-only sheets, compact value trees or generated Python when they would drop
external-call evidence or turn the result into a fixed constant. Diagnose the
unsupported export before discarding information needed to recognize its
external origin. Existing pure-CSO exports retain their behavior.

Keep scientific libraries as optional dependencies of authored adapters and
examples, not mandatory CSO runtime dependencies. Static description and binding
generation must work without those libraries installed.

## Consequences

### Positive

- Supported consumers preserve invocation identity and verification meaning.
- Compatibility failures occur before external computation begins.
- Historical captures retain their original claims, and presentation migration
  does not change their numerical results.

### Negative / Trade-offs

- The producer and consumers need a coordinated upgrade, including generated
  project dependency pins and explicit compatibility tests.
- Some mathematical export paths remain unavailable for calculations containing
  external calls. A lossless external-code exporter requires a separate design.
- Adapter authors manage their scientific-library dependencies.

## Alternatives Considered

### Add fields without versioned reader handling

Existing strict readers reject unknown fields and variants. This would hide the
compatibility boundary and may detect it only after executing an adapter.

### Export captured results as ordinary constants

That loses call identity, method documentation and coverage limitations. The
user chose an explicit unsupported-export error over an incomplete calculation.

### Rerun source to migrate a saved report

Later source, library state or external inputs may produce different results.
Saved presentation must remain attached to its retained execution.

## Related

- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Numeric-kind compatibility precedent](0005-python-numeric-kind-evidence.md)
- [External-result verification](0011-external-result-verification.md)
- [External execution lifetime](0012-external-execution-lifetime.md)
- [External-call document items](0013-external-call-document-items.md)
- [Introduce imported black box calculation functions](https://github.com/viktar-b/CalculationSourceObject/issues/54)

This records accepted design intent. Protocol negotiation, new format versions
and consumer compatibility checks remain implementation work.
