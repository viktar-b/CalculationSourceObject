# Write scalar calculations

Use constrained Python in `calculations/report.cso.py`. Declare documented inputs
and assignments with `Annotated[float, symbol(...)]` or
`Annotated[int, symbol(...)]`. A plain `float` or `int` parameter needs a separate
documented `given()` assignment.
Use descriptive names and qualified glyphs such as `A_{rect}`. Define units and
explain each glyph qualifier. Return a dictionary that selects documented values.

Use finite scalar numbers and arithmetic `+`, `-`, `*`, `/`, and `**`.
Python booleans are not numeric inputs. Declare `float` for fractional results.
Exact integers must fit within ±(2**53 - 1). Keep assumptions and references in
literal `text(id=..., content=...)` calls so they appear in the report.

The [maintained authoring guide](https://github.com/viktar-b/CalculationSourceObject/blob/main/docs/authoring.md)
describes supported functions, composition, and document content. Unsupported
Python constructs must be replaced with supported scalar expressions before
the calculation can pass verification.
