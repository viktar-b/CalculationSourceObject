# ADR-0009: Share source planning between methods and calculation capture

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

Repeated calculations need one common explanation and a table of case inputs
and outputs. Existing static calculation definitions describe public interfaces;
the planner currently constructs formulas and document content per invocation.
An interface fingerprint can remain unchanged after a formula edit.

Reconstructing a common method from captured cases would need extra rules for
empty tables, case-specific symbols and conditional alternatives. Maintaining a
second formula parser for methods would create competing interpretations of the
same calculation source.

## Decision

Extract a reusable symbolic formula-and-content plan from the existing Python
planner. Use that shared source-derived plan for the common method explanation
and each invocation's captured formulas. Method preparation must not require a
representative numerical execution.

For the first version, the common method preserves the calculation's complete
authored formulas and explanatory content in source order. Selecting table rows
changes the comparison without pruning the method's explanation. Full execution
evidence remains available independently of its document placement.

Bind a method to one annotated function at its captured source revision. Use
source identity as well as the function identity; interface fingerprints,
matching formulas and equal values are insufficient. Grouped cases must refer
to that same source definition, including its captured dependencies.

Explain each nested helper method once while retaining a distinct symbolic
call description for every call site. Each call description preserves its
parameter mappings, selected outputs and subsequent use in the parent method.
Sharing helper content must not merge calls with different argument mappings.

Use the reusable calculation's declared labels, glyphs and units for the common
explanation and table rows. Preserve case-specific quantity identities, notation
and bindings in evidence. Require missing common metadata to be authored with
the reusable calculation rather than borrowing it from one case.

Keep explicit `method` and `table` declarations in calculation source. Table
case headings refer to earlier calculation-call variables, resolved through
invocation identities. Results remain ordinary numeric dictionaries. Each
invocation belongs to one table; the first version groups direct earlier child
calls and rejects overlapping grouped subtrees, including conflicting inner
table ownership. Ordinary nested calls and later numerical reuse remain supported.

Preserve declaration positions in document order. A method declaration precedes
its associated tables and places the explanation once. Each table appears at
its declaration; additional disjoint tables may refer to the same method.
Grouped case sections have their expanded placements replaced during document
preparation, while their source content and numerical evidence remain retained.

Keep table identity and cell bindings independent of orientation. Support cases
in columns or rows using the same case/quantity references and qualifications.
Transposition changes placement, not the shared method, case order, selected
quantities, numerical execution or evidence. It does not create another owner
for the grouped invocations.

The author selects orientation explicitly per table with `cases_axis="columns"`
by default or `cases_axis="rows"` for transposition. Use that choice in both
HTML and PDF. Measured continuation fits the selected column axis at readable
type size; it must not silently change orientation when inputs or rendering
conditions change. Repeat identifying labels and required qualifications in
each relevant continuation.

Keep the package ownership established in ADR-0001. Python owns source planning
and capture, core owns authoritative contracts and independent verification,
React owns document preparation and rendering, and CLI owns publication.

## Consequences

### Positive

- One source interpretation supplies both method formulas and case capture.
- A method can be explained when its table has no evaluated cases.
- Changing the authored formulas changes the common explanation.
- Table row selection cannot silently remove authored engineering context.

### Negative / Trade-offs

- The existing planner needs refactoring before the two consumers share a plan.
- A calculation with many intermediates still has a substantial common method.
- The shared plan and its source/case bindings need explicit contract validation.

## Alternatives Considered

### Reconstruct the method from captured invocations

This could reduce the initial capture refactor, but it requires normalization
of case-bound quantities, consistency checks across invocations and a separate
answer for an empty table. The user selected shared source planning instead.

### Restrict the method to selected output dependencies

This could shorten the method further, but dependency selection alone does not
explain which prose, assumptions and figures to retain. The user selected the
complete authored explanation for the first version.

## Related

- [Package ownership and the CSO handoff](0001-package-ownership-and-cso-handoff.md)
- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Domain glossary](../../CONTEXT.md)
- [Proposal: method and table for repeated calculations](https://github.com/viktar-b/CalculationSourceObject/issues/87)

This records accepted design intent, not implemented support. Serialized contracts
and pagination must implement these invariants. Qualification semantics are recorded in
[Applicability and numerical execution](0010-applicability-and-numerical-execution.md).
