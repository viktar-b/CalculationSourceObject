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

**CalculationSourceObject (CSO)**:
The structured record of a calculation's formulas, symbols, results, units,
explanations, document structure, and source metadata.
_Avoid_: calling a rendered sheet the complete calculation source.

**Symbol**:
A named quantity with a displayed glyph, descriptive metadata, and a value.

**Value tree**:
A formula represented by literal values, symbol references, and function
applications, with a designated root and a documented result.

**FormulaSheet**:
The reviewable presentation of a calculation's rows, mathematical notation,
substitutions, units, explanations, and results.

**Source-to-document consistency**:
Agreement between the authored calculation's runtime results and the values
obtained by evaluating the documented formulas.
_Avoid_: treating structural validation as numerical agreement.

**Independent numerical reference case**:
A case whose expected results have a separately established numerical basis.
Agreement with it is distinct from source-to-document consistency.

**Document preservation**:
Accounting for every input, formula step, explanation, figure, unit, and result
when converting a calculation into a document, including intentional differences.
_Avoid_: treating an automatically generated document as newly human-approved.
