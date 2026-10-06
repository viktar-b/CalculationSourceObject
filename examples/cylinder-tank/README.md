# Cylindrical tank estimate

These calculations estimate the steel in an open vertical cylinder, the liquid it
contains, and the plan position of its centre. They are a material and contents
estimate, not a structural capacity calculation. Human engineering approval is
not claimed.

The sources are separate calculation shapes. Each one exercises a rule from
[authoring](../../docs/authoring.md) that the other maintained examples do not
combine in a small project.

| Shape | Source | What is different |
| --- | --- | --- |
| Shared metadata | [quantities.py](quantities.py) | Float and int aliases for glyphs, descriptions, and units |
| Reusable circle in a nested path | [geometry/circle.cso.py](geometry/circle.cso.py) | `math.pi`, a hidden radius, and qualified glyphs. The directory name is a Python identifier |
| Explicit unit conversion | [thickness.cso.py](thickness.cso.py) | Millimetres become metres in their own calculation. Callers do not convert by ignoring the unit |
| Integer counts | [courses.cso.py](courses.cso.py) | `int` inputs and `int` results, including `math.ceil` and `max`. The maximum course height is a callee default |
| Conditional fill | [contents.cso.py](contents.cso.py) | A comparison chain selects empty, partial, or full liquid height. Only the selected branch is evaluated |
| Notation scopes and trigonometry | [position.cso.py](position.cso.py) | `c_{off}` is kept in `x-axis` and `y-axis` scopes. Degrees are converted with `math.radians` before `cos` and `sin`; `hypot` and `atan2` recover the radius and bearing |
| Composition and a hidden intermediate | [shell.cso.py](shell.cso.py) | Calls the circle, conversion, and course calculations. A `document_section` groups the plate formulas. Developed area is documented and is not a public output |
| Parent estimate | [estimate.cso.py](estimate.cso.py) | Forwards the inside area into the contents calculation, so that quantity keeps its identity. Adds assumptions, a notation legend, and [tank.svg](tank.svg) |
| Repeated calls | [compare.cso.py](compare.cso.py) | Calls the shell twice. `baseline_shell` and `candidate_shell` qualify repeated glyphs. The parent returns the masses and the ratio; the child formulas stay in the document |
| Reference-glyph reproduction | [references/published_circle.cso.py](references/published_circle.cso.py) | The tank does not call this file. It preserves the published glyphs `d`, `r`, `C`, and `A` and records the reference URL |

## Generate and verify

Run from the repository root after [setup](../../docs/development.md#setup).
`PYTHON` selects the interpreter that contains the installed `cs-object` wheel.

```sh
"$PYTHON" -m cso_python bindings examples/cylinder-tank
node packages/cso-cli/dist/cli.js bindings examples/cylinder-tank --check
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/estimate.cso.py --function estimate --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/estimate.cso.py --function estimate --input fill_ratio=0 --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/estimate.cso.py --function estimate --input fill_ratio=1 --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/estimate.cso.py --function estimate --input bearing_degrees=90 --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/estimate.cso.py --function estimate --input course_count=3 --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/compare.cso.py --function compare_shells --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/compare.cso.py --function compare_shells --input candidate_diameter=2 --reference examples/cylinder-tank/reference.json --format json
node packages/cso-cli/dist/cli.js verify examples/cylinder-tank/references/published_circle.cso.py --function published_circle --reference examples/cylinder-tank/reference.json --format json
```

For a plain Python consumer, use this directory as the working folder:

```sh
(cd examples/cylinder-tank && "$PYTHON" - <<'PY'
import math
from _cso_bindings.estimate import estimate
from _cso_bindings.compare import compare_shells

result = estimate()
assert result["area"] == math.pi
assert result["bolt_count"] == 48
assert result["radial_offset"] == 5.0
assert compare_shells()["mass_ratio"] == 1.25
assert compare_shells(candidate_diameter=2)["mass_ratio"] == 1.0
print(result)
PY
)
```

Successful execution does not establish source-to-document consistency. `verify`
does. Passing `--reference` adds independent numerical agreement. HTML and PDF
checks add content retention, and PDF adds rendering. Visual inspection of every
page is still separate. See [rendering](../../docs/rendering.md#choose-verification-by-change).

## Expected results

The default estimate uses diameter 2 m, height 6 m, wall 8 mm, steel density
7850 kg/m^3, 4 courses, 12 bolts per course, fill ratio 0.5, liquid density
1000 kg/m^3, plan radius 5 m, and bearing 0 degrees. The maximum course height
stays at its callee default of 1.5 m.

| Quantity | Result |
| --- | --- |
| Inside radius, area, circumference | 1 m, pi m^2, 2 pi m |
| Wall thickness | 0.008 m |
| Developed area, shell volume, shell mass | 12 pi m^2, 0.096 pi m^3, 753.6 pi kg |
| Course height, required courses, bolts, shortfall | 1.5 m, 4, 48, 0 |
| Liquid height, volume, mass, freeboard | 3 m, 3 pi m^3, 3000 pi kg, 3 m |
| East, north, radial offset, recovered bearing | 5 m, 0 m, 5 m, 0 degrees |

`pi` here is Python's `math.pi`. Products that are not exact decimals are the
binary64 results of the authored operation order. At these defaults the shell
mass is 2367.504223745268 kg and the liquid mass is 9424.77796076938 kg.

Fill ratio 0 selects the empty branch: liquid height, volume, and mass are 0,
and freeboard is 6 m. Fill ratio 1 selects the full branch: liquid height is
6 m, liquid volume is 6 pi m^3, liquid mass is 6000 pi kg, and freeboard is 0.
Bearing 90 degrees gives a north component of 5 m, a radial offset of 5 m, and
a recovered bearing of 90 degrees. The east component is the binary64 cosine of
a right angle, about 3.06e-16 m, not a mathematical zero. Three courses give a
course height of 2 m, 36 bolts, and a shortfall of 1.

The default comparison uses diameters 2 m and 2.5 m. Shell mass is proportional
to diameter, and the candidate-to-baseline ratio is 1.25. Equal diameters give
a ratio of 1. The published circle at diameter 2 m has radius 1 m, circumference
2 pi m, and area pi m^2.

[reference.json](reference.json) binds these values to the source bytes, the
selected function, and the resolved inputs. Formula-only edits leave generated
handles current and make this file stale. Review the formulas and source hashes
before rebinding it. Do not copy expected numbers from the execution being
checked.

## Notation

Python names stay descriptive. Display glyphs are compact, and the estimate
legend defines them: tank, circ, wall, mm, stl, liq, crs, bolt, req, short,
free, plan, bear, rad, off, rec, dev, and shl.

`c_{off}` is one glyph in two scopes. The x-axis scope is the easting and the
y-axis scope is the northing. The diagram uses `D_{tank}`, `h_{tank}`, and
`t_{wall,mm}`.

The comparison qualifies repeated results. `baseline_shell` and
`candidate_shell` become `bs` and `cs`. Nested `base_circle`, `wall_thickness`,
and `course_bolts` become `bc`, `wt`, and `cb`. The baseline inside area is
`A_{circ,bs,bc}` and the baseline shell mass is `m_{shl,bs}`. Equal inputs do
not merge the two shells.

The published circle is the exception that keeps bare reference glyphs. The tank
sources do not use those glyphs.
