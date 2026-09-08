---
status: accepted
---

# Enforce numeric declarations during Python execution

Accepted on 2026-09-08. Generated calculation handles promise the declared
Python result types, so execution must enforce those declarations for inputs,
documented assignments and public returns. Require an actual Python `int` for
an `int` declaration, including inherited and forwarded quantities. Accepting
`1.0` would break that promise for direct Python callers, and converting it
would change the authored result. The [authoring guide](../authoring.md#inputs-and-reusable-calculations)
owns the runtime rules and migration guidance.

Keep declaration interpretation in the existing definition and annotation
modules, and runtime enforcement in execution. Bindings generation remains
static. JSON numerical verification remains separate because parsed JSON numbers
do not retain Python's `int` versus `float` distinction. This change does not
add output type evidence or change the execution protocol. A return with the
right type but the wrong numerical value remains observable for core verification
to reject.
