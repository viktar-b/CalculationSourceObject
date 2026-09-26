# ADR-0003: Enforce numeric declarations during Python execution

**Status**: Accepted
**Date**: 2026-09-08
**Authors**: viktar-b

## Context

Generated calculation handles promise declared Python result types. Static
binding generation cannot ensure that authored execution returns those types.
Accepting `1.0` for an `int` declaration would break that promise for direct
Python callers, while converting the value would change the authored result.

## Decision

Enforce numeric declarations for inputs, documented assignments and public
returns during Python execution, including inherited and forwarded quantities.
An `int` declaration requires an actual Python `int`. A `float` declaration
accepts Python `int` and `float` values within the supported numeric range.
Preserve values without coercion and reject booleans.

Keep declaration interpretation in the existing definition and annotation
modules and runtime enforcement in execution. Binding generation remains
static. JSON numerical verification remains separate because parsed JSON
numbers do not retain Python's `int` versus `float` distinction.

## Consequences

### Positive

- Generated handles keep their declared type promise for direct Python callers.
- Runtime checks cover composed calculations and public returns without
  changing authored numerical values.
- Core still checks numerical agreement independently of Python's type checks.

### Negative / Trade-offs

- Calculations that returned `1.0` for an `int` declaration must correct the
  declaration or source; execution will no longer accept them.
- This decision adds no output-type evidence to the JSON protocol and does not
  change that protocol. A value with the right Python type but wrong number
  remains for core verification to reject.

## Alternatives Considered

### Coerce float values into declared integers

Converting `1.0` to `1` would hide an authored type mismatch and change the
runtime value rather than enforce the declaration.

### Rely on generated bindings alone

Static bindings do not protect dynamic or direct Python callers against a
runtime mismatch.

## Related

- [Authoring guide](../authoring.md#inputs-and-reusable-calculations)
- [Code map](../code-map.md)
