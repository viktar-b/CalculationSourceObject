# Execution evidence

Use this workflow for a function prototype, a numerical regression or a rendered
calculation proof. Start with the existing
[function-support integration example](../../tests/integration/function-support.test.ts)
and [numeric-evidence cases](../../tests/integration/numeric-evidence.test.ts).
Reuse their public-interface sequence before writing another standalone harness.

1. Author a small synthetic calculation using the
   [authoring conventions](../../docs/authoring.md). Use temporary consumers in
   tests and retain prototype artifacts in an ignored task directory. Done when
   the input, units, formula and independently expected result are explicit.
2. Execute through the selected installed wheel and parse the response with
   `ExecutionResponseSchema`. Check success before reading the execution.
   Run `verifyExecution` on that capture. Done when the recorded value and
   independent evaluation agree under the current numeric policy.
3. For Python export, use `createSheetFromCalculationSourceObject` with its
   required options and take the returned `.sheet`. The
   [converter](../../packages/cso-core/src/calculation-source/to-sheet.ts) returns
   a wrapper, not a bare `SheetDocument`. Execute the generated Python and compare
   the intended output by Symbol ID, including kind and signed zero when relevant.
   Done when the round trip preserves the quantity being checked.
4. For document evidence, prepare and render the same execution through the
   [React path](../../docs/rendering.md#engineering-presentation). Capture the
   actual renderer output. If a demo also offers live browser calculations,
   label those separately from saved Python verification. Done when the displayed
   formulas and results can be traced to the capture.
5. Inspect every delivered PDF page and bind findings to its exact bytes, as
   required by the [printing guide](../../docs/rendering.md#printing-and-inspection).
   For HTML evidence, inspect the affected formulas at their intended width.
   Report numerical checks and visual inspection separately.

When converting a prototype into maintained support, put regression cases in
the owning package or root integration suite. Generated demos and cached test
counts are evidence for a run, not the specification for later runs.
