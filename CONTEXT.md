# CalculationSourceObject

Transparent engineering calculations connect authored formulas and numerical
results with the information an engineer needs to review them.

## Language

**Annotated calculation**:
An authored calculation with explicit inputs, symbol metadata, formulas, and
returned results.

**Calculation definition**:
The declared parameters, defaults and named public output selections of an
annotated calculation, independent of a particular invocation or numerical result.

**Calculation method**:
The shared explanation of an annotated calculation's inputs, formulas,
relationships, outputs and authored engineering context, independent of case values.

**Calculation case**:
One evaluated invocation represented in a comparison table, retaining its own
identity even when its inputs or results equal another case's values.

**Comparison table**:
A presentation of calculation quantities and distinct cases on opposite axes,
bound to their existing inputs, results and qualifications. Cases can appear
in columns or rows.

**Engineering check**:
An authored criterion applied to a calculated result. A failed check can describe
a valid numerical result that does not meet the criterion.

**Applicability condition**:
An authored condition identifying when a calculation result can be used within
its stated assumptions and limits. An inapplicable result is distinct from a
valid result that fails an engineering check.

**Inapplicable result**:
A result outside its authored applicability conditions, or dependent on an
inapplicable quantity actually used in its calculation. Retaining a computed
number does not establish that the result is applicable.

**External function declaration**:
The reusable description of an ordinary Python function's numeric inputs,
named numeric outputs and method, separate from its implementation.

**External invocation**:
One authored call to an external function, with its own supplied inputs and
returned results. Separate calls retain distinct identities even with equal inputs.

**External result**:
A named numeric output of an external invocation, available to subsequent
documented formulas. Capturing it does not independently verify the external algorithm.

**CalculationSourceObject (CSO)**:
The structured record of a calculation's formulas, symbols, results, units,
explanations, document structure, and source metadata.
_Avoid_: calling a rendered sheet the complete calculation source.

**Symbol**:
A named quantity with a displayed glyph, descriptive metadata, and a value.
Its display identity combines normalized glyph notation with its authored
notation scope; it is separate from the symbol reference identity.

**Value tree**:
A formula represented by literal values, symbol references, and function
applications, with a designated root and a documented result.

**Numeric evidence**:
A recorded quantity's value and, when captured, its actual integer or
floating-point kind. Its kind is distinct from the quantity's declared type.

**FormulaSheet**:
The reviewable presentation of a calculation's rows, mathematical notation,
substitutions, units, explanations, and results.

**Calculation report**:
The reviewable engineering narrative for one source revision, selected function and resolved input
set, including assumptions, references, formulas, units and results. HTML and
PDF can present the same report; the verification report is a separate record.

**Source-to-document consistency**:
Agreement between captured execution and documented quantities. Formula
quantities are checked by independent formula evaluation; external results are
checked against their captured calls.
_Avoid_: treating structural validation as numerical agreement or captured
external results as independently verified algorithms.

**Independent numerical reference case**:
A case whose expected results have a separately established numerical basis.
Agreement with it is distinct from source-to-document consistency.

**Document preservation**:
Accounting for every input, formula step, explanation, figure, unit, and result
when converting a calculation into a document, including intentional differences.
_Avoid_: treating an automatically generated document as newly human-approved.
