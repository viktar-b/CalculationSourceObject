# ADR-0005: Preserve Python numeric kinds for independent evaluation

**Status**: Accepted
**Date**: 2026-09-26
**Authors**: Codex

## Context

JSON numbers erase the distinction between a Python `int` and a Python `float`.
The original hot-formed I-section torsional-index formula has finite float
products around 1e25. Core rejected these because their binary64 values happened
to be integer-valued. Regrouping a reference formula would hide this limitation
and change the documented calculation. Exact Python integers still require a
safe range because the TypeScript verifier cannot recover rounded JSON integers.

## Decision

Keep independent numerical verification in TypeScript core, as in ADR-0001.
Capture the actual `numericKind` (`int` or `float`) on numeric literals, literal
input bindings, observations and public outputs. Declared annotations remain
separate runtime promises, as in ADR-0003.

Core independently propagates numeric kinds from authoritative literals and
bindings. Integer arithmetic must remain within ±(2**53 - 1). Mixed arithmetic,
true division and square roots produce finite binary64 floats; finite floats
may exceed the integer range. `ceil` and one-argument `round` produce safe
integers. `max` preserves the kind of its selected operand, including its first
operand on equality. Non-finite values fail for both kinds.

Kind evidence is optional for older payloads. Missing evidence retains the old
conservative integer-valued range rule. The verification report identifies the
new policy as `finite-real-typed-safe-integer`; report readers also accept the
historical policy identifier.

## Consequences

### Positive

- Reference formulas can retain large floating-point intermediates unchanged.
- Exact integers remain protected against silent JSON rounding.
- Existing captured fixtures remain readable without fabricating numeric kinds.

### Negative / Trade-offs

- New captures add fields that older strict readers do not understand; producer
  and reader versions must be upgraded together.
- Float agreement remains tolerance-based rather than exact or arbitrary precision.
- Kind evidence is captured provenance, not proof that authored formulas are
  independently correct engineering calculations.

## Alternatives Considered

### Move verification into Python

The user chose to retain existing ownership. A move would also require changing
Python capture's integer-valued-float rejection, so ownership alone does not
solve the reported range failure.

### Allow every integer-valued JSON number

Without kind evidence, core cannot distinguish a rounded exact integer from an
approximate float. This would remove the existing exact-integer protection.

### Regroup the reference formula

This changes source grouping to work around the verifier and leaves the general
numeric-domain defect unresolved.

## Related

- [ADR-0001](0001-package-ownership-and-cso-handoff.md)
- [ADR-0003](0003-runtime-numeric-declarations.md)
- [Authoring guide](../authoring.md)
- [Issue #32](https://github.com/viktar-b/CalculationSourceObject/issues/32)
