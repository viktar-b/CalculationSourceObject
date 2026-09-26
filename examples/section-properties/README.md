# Section-property reference transcriptions

These maintained calculations transcribe the formulas, defaults, glyphs and units
from the two Enji templates provided for the compatibility investigation:

- [Hot-formed I-sections](https://www.enji.io/templates/basic-section-properties/hot-formed-I-sections):
  [source](hot-formed-I-sections/calculate.cso.py), 8 inputs and 38 calculated quantities.
- [Unequal tapered I-beam](https://www.enji.io/templates/basic-section-properties/unequal-tapered-i-beam):
  [source](unequal-tapered-i-beam/calculate.cso.py), 9 inputs (including the lower
  section boundary) and 90 calculated quantities.

Calculation metadata records each reference URL and the SHA-256 of its Python
export captured on 2026-09-26. Python names are descriptive; original exported
quantity names remain symbol IDs. Formulas retain the original grouping. Reference
units and descriptions are retained even where their engineering interpretation
needs separate review. Dimensionless `-` units become empty units.

The hot-formed reference uses bare `X`, `g` and `U` glyphs. The tapered reference
uses `Z_{web}` twice; explicit x-axis and y-axis notation scopes preserve that
notation in the corresponding plastic-modulus sections. Its negative default
bottom discriminant is guarded by a conditional; the unused square root must not
be evaluated.

From the repository root after [setup](../../docs/development.md#setup):

```sh
node apps/cso-cli/dist/cli.js verify examples/section-properties/hot-formed-I-sections/calculate.cso.py --function calculate --format json
node apps/cso-cli/dist/cli.js verify examples/section-properties/unequal-tapered-i-beam/calculate.cso.py --function calculate --format json
```

These are numerical compatibility examples, not pixel-identical reproductions of
the Enji pages. External figures and page styling are not included. No independently
established engineering reference cases or human engineering approval are claimed.
The [integration checks](../../tests/integration/section-properties.test.ts)
verify every documented calculation against the captured Python execution and
check selected default values against the external export.
