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
4. For document evidence, choose the checks using the
   [rendering guide](../../docs/rendering.md#choose-verification-by-change).
   Use `cso html` for an inspectable report and `--check-layout` for shared browser
   diagnostics. Inspect affected HTML formulas at their intended width. Use PDF
   checks when print behavior or PDF delivery is in scope. Done when the displayed
   formulas and results can be traced to the same capture and the changed behavior
   has matching evidence.
5. Apply the [delivery checks](../../docs/rendering.md#printing-and-inspection)
   to artifacts being delivered. Leave unrelated generated test artifacts marked
   with their actual review status. Report numerical checks, browser checks and
   visual inspection separately.

When converting a prototype into maintained support, put regression cases in
the owning package or root integration suite. Generated demos and cached test
counts are evidence for a run, not the specification for later runs.
