# Calculation authoring

The Python package owns the [authoring contract](../packages/cso-python/src/cso_python/authoring.md).
Installed users can read or export the matching guide with
`python -m cso_python authoring` or
`python -m cso_python authoring --out authoring-contract.md`.
Edit the package-owned guide when changing shared rules.

For contributor setup use [development](development.md). The maintained
[two-panel example](../examples/two-panel/README.md) demonstrates composition;
[section properties](../examples/section-properties/README.md) demonstrates
comparisons. Use [rendering](rendering.md#choose-verification-by-change) for
repository layout checks and [inspection](rendering.md#printing-and-inspection)
for artifact delivery.

The section links below preserve existing contributor bookmarks.

## Names and notation

[Read this section](../packages/cso-python/src/cso_python/authoring.md#names-and-notation).

## Inputs and reusable calculations

[Read this section](../packages/cso-python/src/cso_python/authoring.md#inputs-and-reusable-calculations).

### Report components and prose

[Read this section](../packages/cso-python/src/cso_python/authoring.md#report-components-and-prose).

### Reuse a calculation

[Read this section](../packages/cso-python/src/cso_python/authoring.md#reuse-a-calculation).

### Explain one method and compare its cases

Declare `method(id=..., calculation=..., title=...)` before the calls it
explains, then `table(...)` after those calls. The method and every case share
one symbolic plan from that source revision. A table does not rerun the
calculation or invent a second reading of the formulas.

Core resolves the method's formulas through each case's parameter and helper-call
bindings and checks their structure against the captured formulas. Changing an
operation, constant or referenced quantity fails verification even when the
numbers happen to agree. This check uses the captured cases; an empty table does
not execute a representative calculation.

`cases` maps a heading to an earlier call result. Each call belongs to one
table. `cases_axis="columns"` is the default and places cases in columns.
`cases_axis="rows"` places cases in rows. Use the same choice in HTML and PDF.
`column_cap` is an optional positive integer that limits how many data columns
share one print part; measured fit still decides the split. Orientation and
the cap do not change cell identity, case order or numerical evidence.

`inputs` and `outputs` select table rows by quantity name. Omit either tuple
to include every parameter or public output. Selection does not remove
formulas, nested calls, text or figures from the method. For a smaller comparison,
extract a reusable calculation with the required scope and call it from both the
comparison and the full calculation. The tapered section example shares its area
and x-axis inertia formulas this way.

A composed method may return a helper's public output directly. Its table cell
keeps that output's captured symbol identity; no copied assignment is required.
Prefer direct forwarding when an input or result keeps its meaning. The report
shows its origin in the quantity row rather than as another calculation step.
An explicitly annotated assignment declares an intentional new review quantity
or notation, so it retains a derivation even when its expression is a reference.
Use one when that distinction matters, for example to name the target of a
criterion. Arithmetic and unit conversions always retain their derivations.
Method quantities use the ordinary formula-row layout without case substitutions.
Select all inputs needed to review the cases, including shared dimensions.
Cases in columns usually fit a few cases with many quantities; rows suit many
cases with fewer quantities.

`check(id=..., targets=(...), explanation=..., predicate=...)` records an
engineering criterion. Each case shows Pass or Fail with the explanation while
keeping the calculated number. Nested helper outcomes identify their call path
and remain visible when their quantities are omitted from the table.
Write the explanation as the criterion, since it appears with both outcomes.
`applicable(...)` uses the same arguments to record when a
result may be used. An inapplicable result displays "Not applicable" and the
originating explanation; the computed number stays in the execution.
Inapplicability follows dependencies that the calculation actually used. A
failed check does not make a valid number inapplicable. Python errors still
stop the run.

Captures that contain method or table evidence use protocol version 3 and CSO
schema `1.1.0`. Prepared documents that contain those items use document
version 3. Protocol 2 and prepared document version 2 remain valid when the
source has no method or table. Rebuild a prepared document from the retained
execution with `prepareExecutionDocument`. Do not rebind an older execution to
a new numerical run in order to add a method.
[Read this section](../packages/cso-python/src/cso_python/authoring.md#explain-one-method-and-compare-its-cases).

### Boolean values and table outcomes

[Read this section](../packages/cso-python/src/cso_python/authoring.md#boolean-values-and-table-outcomes).

### Parameters and public outputs

[Read this section](../packages/cso-python/src/cso_python/authoring.md#parameters-and-public-outputs).

### Binding generation and project layout

[Read this section](../packages/cso-python/src/cso_python/authoring.md#binding-generation-and-project-layout).

## Supported source and document content

[Read this section](../packages/cso-python/src/cso_python/authoring.md#supported-source-and-document-content).

### External functions

[Read this section](../packages/cso-python/src/cso_python/authoring.md#external-functions).

### Formulas and document content

[Read this section](../packages/cso-python/src/cso_python/authoring.md#formulas-and-document-content).

## Repeated symbols

[Read this section](../packages/cso-python/src/cso_python/authoring.md#repeated-symbols).

## Verification and source changes

[Read this section](../packages/cso-python/src/cso_python/authoring.md#verification-and-source-changes).
