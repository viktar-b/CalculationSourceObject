# Section-property reference transcriptions

These maintained calculations transcribe the formulas, defaults, glyphs and units
from the two Enji templates provided for the compatibility investigation:

- [Hot-formed I-sections](https://www.enji.io/templates/basic-section-properties/hot-formed-I-sections):
  [source](hot-formed-I-sections/calculate.cso.py), 8 inputs and 38 calculated quantities.
- [Unequal tapered I-beam](https://www.enji.io/templates/basic-section-properties/unequal-tapered-i-beam):
  [source](unequal-tapered-i-beam/calculate.cso.py), 9 inputs (including the lower
  section boundary) and 91 calculated quantities.

Calculation metadata records each reference URL and the SHA-256 of its Python
export captured on 2026-09-26. Python names are descriptive; original exported
quantity names remain symbol IDs. The hot-formed formulas retain their original
grouping. The tapered example records the corrections below and adds an explicit
local PNA distance. Dimensionless `-` units become empty units.

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
the Enji pages. External figures and page styling are not included. Human engineering approval is not claimed. The independent polygon checks below
cover selected section properties; they are not a complete reference file for all
documented intermediates.
The [integration checks](../../tests/integration/section-properties.test.ts)
verify every documented calculation against the captured Python execution and
check selected default values against the external export.

## Tapered-section corrections

The original export remains identified by its URL and hash. The maintained
calculation corrects three inherited expressions: the web parallel-axis distance
is squared; each tapered y-axis inertia includes both triangular wings and the
central rectangle; bottom-taper width varies linearly with height using its
gradient. These changes affect the dependent inertias, radii and moduli.

`Y_0` translates absolute section boundaries, candidate PNA coordinates and the
selected PNA. Component centroids and the new local PNA distance are measured
from the lower section boundary. Section properties therefore remain unchanged
when only the origin changes.

[Independent polygon checks](../../tests/integration/section-properties-reference.test.ts)
construct the section perimeter from its dimensions, integrate polygon area and
first/second moments, and bisect a horizontal clip to find the half-area PNA.
Plastic modulus follows from the clipped first moments. Cases place the PNA in
each flange, each taper and the web, with zero, positive and negative origins.
They check area, centroid, inertia, PNA, plastic modulus and dependent quantities
without using captured calculation outputs as expected values.
