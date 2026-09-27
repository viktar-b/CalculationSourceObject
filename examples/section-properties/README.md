# Section-property reference transcriptions

These maintained calculations transcribe the formulas, defaults, glyphs and units
from the two Enji templates provided for the compatibility investigation:

- [Hot-formed I-sections](https://www.enji.io/templates/basic-section-properties/hot-formed-I-sections):
  [source](hot_formed_i_sections/calculate.cso.py), 8 inputs and 38 calculated quantities.
- [Unequal tapered I-beam](https://www.enji.io/templates/basic-section-properties/unequal-tapered-i-beam):
  [source](unequal_tapered_i_beam/calculate.cso.py), 9 inputs (including the lower
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
node packages/cso-cli/dist/cli.js verify examples/section-properties/hot_formed_i_sections/calculate.cso.py --function calculate --format json
node packages/cso-cli/dist/cli.js verify examples/section-properties/unequal_tapered_i_beam/calculate.cso.py --function calculate --format json
```

These are numerical compatibility examples, not pixel-identical reproductions of
the Enji pages. External figures and page styling are not included. Human engineering approval is not claimed. The independent polygon checks below
cover selected section properties; they are not a complete reference file for all
documented intermediates.
The [integration checks](../../tests/integration/section-properties.test.ts)
verify every documented calculation against the captured Python execution and
check selected default values against the external export.

## Reuse in a comparison

[compare.cso.py](compare.cso.py) contains two parent calculations:
`compare_hot_formed` calls the hot-formed reference twice, and `compare_tapered`
calls the tapered reference twice. Both vary section depth while retaining the
other reference defaults. Each passes area and centroidal second moment to
[comparison.cso.py](comparison.cso.py), which computes candidate-to-baseline
ratios. Ratios describe geometry; they do not establish capacity or compliance.
Use physically valid dimensions and positive baseline area and inertia. These
are author-supplied assumptions; the examples do not validate physical geometry.
Some valid tapered geometries also fail in inactive wedge calculations;
[#59](https://github.com/viktar-b/CalculationSourceObject/issues/59) records the
affected cases and the required geometry checks.

Generate from this directory's common root so the imports mirror the source
paths. The Python-compatible directory names differ from the external reference
URL slugs; the reference calculation files retain their original bytes.

```sh
"$PYTHON" -m cso_python bindings examples/section-properties
node packages/cso-cli/dist/cli.js bindings examples/section-properties --check
node packages/cso-cli/dist/cli.js verify examples/section-properties/compare.cso.py --function compare_hot_formed --format json
node packages/cso-cli/dist/cli.js verify examples/section-properties/compare.cso.py --function compare_tapered --format json
```

The hot-formed comparison uses depths 1056 and 1200 mm by default. The tapered
comparison uses 100 and 120 mm. Run an equal-depth case, whose expected ratios
are 1:

```sh
node packages/cso-cli/dist/cli.js verify examples/section-properties/compare.cso.py --function compare_tapered --input candidate_depth=100 --format json
```

This command checks formula consistency. The ordinary Python consumer below
separately asserts the expected ratios; no independent reference file is supplied.

The tapered parent's call sequence is:

```python
from _cso_bindings.unequal_tapered_i_beam.calculate import calculate as tapered_section
from _cso_bindings.comparison import compare_properties

# Within compare_tapered():
baseline_section = tapered_section(section_depth=baseline_depth)
candidate_section = tapered_section(section_depth=candidate_depth)
property_ratios = compare_properties(
    baseline_area=baseline_section["total_area_of_the_section"],
    candidate_area=candidate_section["total_area_of_the_section"],
    baseline_inertia=baseline_section["second_moment_of_area_about_x_axis"],
    candidate_inertia=candidate_section["second_moment_of_area_about_x_axis"],
)
```

The parent returns the two areas and two ratios. All 91 calculated quantities
from each tapered invocation remain in its report, including the plastic-modulus
work that the parent does not return. The hot-formed report similarly retains
all 38 quantities from each invocation. The shared comparison contributes two
more formulas. Forwarded outputs retain their original symbols and units rather
than becoming new independent input rows.

`baseline_section` and `candidate_section` qualify repeated result glyphs with
`bs` and `cs`. The tapered calculation also retains its separate x-axis and
y-axis notation scopes. The comparison helpers accept matching `mm^2` and
`mm^4` quantities; there is no automatic unit conversion.

For a plain Python consumer, use the common generation root as the working
folder and import the parent:

```sh
(cd examples/section-properties && "$PYTHON" - <<'PY'
from _cso_bindings.compare import compare_tapered

result = compare_tapered(candidate_depth=100)
assert result["area_ratio"] == 1
assert result["inertia_ratio"] == 1
print(result)
PY
)
```

To inspect the complete composed report:

```sh
node packages/cso-cli/dist/cli.js pdf examples/section-properties/compare.cso.py --function compare_hot_formed --out output/hot-formed-comparison.pdf --format json
node packages/cso-cli/dist/cli.js pdf examples/section-properties/compare.cso.py --function compare_tapered --out output/tapered-comparison.pdf --format json
```

PDF publication checks source-to-document consistency and content retention.
Inspect every page separately. The tapered comparison currently clips some long
formulas despite a passing automated rendering check; see
[#61](https://github.com/viktar-b/CalculationSourceObject/issues/61). Its PDF needs
that rendering repair before publication. The new comparison cases have no complete
independent numerical reference file. Existing polygon checks below continue to
check selected properties of the canonical tapered calculation independently.
See [authoring](../../docs/authoring.md#binding-generation-and-project-layout)
for regeneration and distribution rules, and the [two-panel walkthrough](../two-panel/README.md)
for a smaller introduction.

## Tapered-section corrections

The elastic x-axis modulus uses the farther extreme fiber, so it governs both
orientations of an asymmetric section. Independent checks also cover the y-axis
elastic modulus using the maximum flange width.

The original export remains identified by its URL and hash. The maintained
calculation corrects four inherited expressions: the web parallel-axis distance
is squared; each tapered y-axis inertia includes both triangular wings and the
central rectangle; bottom-taper width varies linearly with height using its
gradient; and the elastic x-axis modulus uses the farther extreme fiber.
These changes affect the dependent inertias, radii and moduli.

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
