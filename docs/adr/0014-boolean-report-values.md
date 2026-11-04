# ADR-0014: Keep Boolean report values separate from numerical quantities

**Status**: Accepted
**Date**: 2026-11-04
**Authors**: viktar-b, Codex

## Context

Comparison tables need True/False facts as well as engineering verdicts,
applicability and selected rules. Existing parameter, output, external adapter
and numeric reference contracts deliberately distinguish Python booleans from
`int` and `float`. Widening those numerical interfaces would change arithmetic
and reference semantics for unrelated calculations.

## Decision

Use `boolean(id=..., description=..., predicate=...)` to declare a Boolean
report value. Reuse existing predicate planning and independent reproduction.
Capture the exact Boolean and used operands, and bind selected table rows to
their declaration, case and call. Permit literal True/False as well as supported
numeric comparisons and their existing logical combinations.

Keep True/False, Pass/Fail and Applicable/Not applicable distinct. Table selection
may omit optional Boolean facts; it cannot suppress required qualifications or
the captured rule chosen by a conditional calculation. The renderer consumes
these outcomes without evaluating predicates or manufacturing verdicts.

New Boolean evidence uses protocol 5, CSO schema `1.3.0` and prepared document
version 5. Numeric-only and existing external captures keep their old versions.
Negotiation rejects unsupported Boolean evidence before authored execution.
Math-only export rejects it explicitly instead of silently dropping report data.

## Consequences

### Positive

- Tables can compare Boolean facts and qualified engineering outcomes through
  one fixed table component, while preserving exact case and call identities.
- Numerical APIs, external adapters and older captures retain their contracts.

### Negative / Trade-offs

- Boolean facts need an explicit declaration rather than an annotated Boolean
  numerical output. Table selection addresses declarations in the shared root
  calculation; nested Boolean facts remain visible for each case. Boolean-bearing
  invocations must belong to a grouped table case subtree; reject other placements
  before execution rather than silently dropping their report values.
- Producers and consumers must upgrade together to use the new evidence version.

## Alternatives Considered

### Native Boolean parameters and numerical outputs

This would widen numeric contracts, arithmetic roles, external interfaces and
independent reference expectations. It is unnecessary for a Boolean report fact.

### Store Boolean values as zero and one

That loses their type and can confuse a numerical value with absence or a verdict.

### Render outcomes as prose outside the table

That repeats case names and separates a condition from the outcomes being compared.

## Related

- [Applicability and numerical execution](0010-applicability-and-numerical-execution.md)
- [Calculation authoring](../authoring.md#boolean-values-and-table-outcomes)
- [Boolean and outcome tables, #111](https://github.com/viktar-b/CalculationSourceObject/issues/111)
