# ADR-0010: Keep applicability separate from numerical execution

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

Consolidated calculation tables must distinguish a valid result that fails an
engineering check from a result outside the calculation's applicability. The
user chose to keep Python's existing stop-on-error behavior and retain every
computed number. A presentation-only label on an upstream result could otherwise
allow its dependent results to appear usable without qualification.

## Decision

Authors explicitly declare engineering checks and applicability conditions
alongside calculation formulas. Each declaration has a predicate, an explanation
and named result targets. Reuse the existing numeric comparison rules and full
numerical values. Do not infer engineering significance from arbitrary formulas
or decide conditions from rounded display values.

A valid result that fails an engineering check retains its displayed number
and visible failed-check outcome. For an inapplicable result, display
"Not applicable" and its reason while retaining any computed number in the
execution evidence. Table row selection cannot hide required qualifications.

Propagate inapplicability through dependencies actually used to compute a result.
For example, an inapplicable area makes a volume computed from that area
inapplicable. A reference in an unselected conditional branch does not cause
propagation. Preserve the originating reason. A failed engineering check alone
does not make a valid numerical result inapplicable.

A check with an inapplicable target or an actually used inapplicable operand
displays "Not applicable" with the originating reason. It does not present a
usable pass/fail verdict. Retain the raw predicate evidence when evaluated.

Capture conditional outcomes. Keep all alternatives in the method and identify
differing selected rules in compact case notes that refer to the method's
formulas. Use authored rule labels when supplied, otherwise formula-linked rule
labels. Required check and applicability outcomes remain visible as output rows
or associated notes regardless of optional quantity-row selection.

These outcomes do not replace numeric values, skip calculations or change
numerical decisions. Original numbers continue through later calculations and
remain subject to numerical verification. Python execution errors still stop
the run; they do not become failed engineering checks or inapplicable table cells.

## Consequences

### Positive

- Reports distinguish criterion failure from a result that cannot be used.
- Downstream presentation retains the effect of an upstream applicability limit.
- Numeric evidence and existing execution behavior remain available for review.
- Conditional alternatives do not contaminate unrelated selected results.

### Negative / Trade-offs

- Capture and core need identified predicate evidence and outcome validation.
- Report applicability needs dependency tracking that respects lazy evaluation.
- Consumers of raw numerical outputs must also inspect qualification evidence
  when deciding whether a result is applicable.

## Alternatives Considered

### Always show a number with an attached qualification

The user chose an explicit "Not applicable" display for affected results while
retaining the number in evidence. This makes the report's applicability state
distinct from a valid number that fails a criterion.

### Propagate through every syntactic reference

That would mark results inapplicable because of unused conditional branches.
The user chose dependencies actually used during evaluation.

### Change execution values or skip affected calculations

This conflicts with the accepted requirement to preserve numerical execution
and stored values. Applicability governs report interpretation and evidence.

## Related

- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Shared calculation method planning](0009-shared-calculation-method-plan.md)
- [Domain glossary](../../CONTEXT.md)
- [Proposal: method and table for repeated calculations](https://github.com/viktar-b/CalculationSourceObject/issues/87)

This records accepted design intent, not implemented support. Authoring declarations,
serialized contracts and both table orientations must implement these semantics.
