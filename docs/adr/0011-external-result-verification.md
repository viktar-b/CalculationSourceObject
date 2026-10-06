# ADR-0011: Verify external-call boundaries with explicit formula coverage

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

External Python functions can supply values for documented CSO formulas without
exposing an independently evaluated formula for their internal computation.
Treating those values as ordinary supplied inputs would obscure their origin.
Treating them as unsupported formulas would block the requested report workflow.

Existing reference cases assume complete calculated-symbol coverage and require
evaluated formulas. A separately established external output expectation need
not establish every diagnostic quantity returned by a scientific library.

## Decision

Capture external invocations explicitly and give their named results a dedicated
definition kind. Retain invocation and parent identities, call location,
declaration/source identity, actual argument values and origins, numeric kinds,
the authored method explanation, and named numeric outputs. Each external result
identifies its invocation and output name. Core uses those captured values when
independently evaluating subsequent documented formulas.

Permit normal report generation when execution, external boundary checks and all
applicable formula/output checks pass, with no failed matching independent
comparison. Count formula checks, captured external calls and external results
separately. State explicitly that the external algorithms are excluded from
formula verification. A report containing only external calls may succeed with
zero formula checks; an empty formula category is not applicable, never passed.

Add explicitly scoped partial independent-reference cases for selected external
outputs. Compare captured output values with independently established expected
values without rerunning the helper. List checked and uncovered quantities.
Missing coverage remains pending; a failed supplied matching comparison blocks
normal success. Preserve the completeness semantics of existing reference cases
and never silently reinterpret them as partial cases.

Source-to-document consistency is the aggregate agreement between captured
execution and documented quantities. Independent formula evaluation establishes
formula agreement; correspondence with captured calls establishes external-result
consistency. Keep these checks and independent numerical references visible
separately. None establishes independent correctness of the external algorithm
or human engineering approval.

## Consequences

### Positive

- External outputs can feed verified arithmetic with their origin preserved.
- Reports state exactly which numerical checks occurred, including zero-formula
  reports and incomplete independent-reference coverage.
- A selected external output can have an independent expectation without an
  invented expectation for unrelated diagnostic outputs.

### Negative / Trade-offs

- Capture, core validation, verification summaries and document consumers need
  an explicit external-result contract and coordinated compatibility handling.
- New scoped reference cases need coverage validation distinct from existing
  complete-reference cases.
- A successful aggregate no longer suffices to describe formula coverage;
  consumers must retain and display the reported coverage information.

## Alternatives Considered

### Store external results as ordinary inputs

This would obscure their computed origin and provide no authoritative link to
the captured external invocation.

### Reuse the unsupported documented-result escape hatch

That intentionally fails ordinary verification and cannot support the requested
normal HTML/PDF workflow. Its existing behavior remains unchanged.

### Require independent expectations for every external output

This would require expectations for diagnostic quantities that the available
independent source may not establish. Explicit partial coverage preserves the
useful comparisons without claiming coverage of untested outputs.

## Related

- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Static external-function declarations](0008-static-external-function-declarations.md)
- [Numeric kind evidence](0005-python-numeric-kind-evidence.md)
- [Applicability and numerical execution](0010-applicability-and-numerical-execution.md)
- [Domain glossary](../../CONTEXT.md)
- [Introduce imported black box calculation functions](https://github.com/viktar-b/CalculationSourceObject/issues/54)

This records accepted design intent. It does not claim implemented support or
settle execution lifetime, dependency provenance, exact report layout or rollout.
