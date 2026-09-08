# Two-panel material estimate

The three calculations share input metadata in `quantities.py`. Geometry and
material functions accept signature inputs and work standalone or composed.
The estimate imports generated handles and returns only area, volume and mass.
Both rectangle perimeters remain documented and verified.

```sh
python -m cso_python bindings examples/two-panel
cso bindings examples/two-panel --check
cso verify examples/two-panel/estimate.cso.py --function estimate --input width=2 --reference examples/two-panel/reference.json --format json
cso pdf examples/two-panel/estimate.cso.py --function estimate --input width=2 --reference examples/two-panel/reference.json --out output/two-panel-width-2.pdf --format json
```

Repeat with width 1 for the second case. Python 3.11 or newer is supported.
`PYTHON` selects the interpreter containing the installed `cso-python` wheel.

Each document has five inputs and seven calculated results. The width-2 case
has panel areas 6 and 8, perimeters 10 and 12, total area 14, volume 1.4 and
mass 700. The width-1 case has areas 3 and 4, perimeters 8 and 10, total area 7,
volume 0.7 and mass 350. Volume and mass each appear once and remain public
outputs of the estimate. Units and assumptions describe a material estimate.

`reference.json` binds hand-derived expected values to the source bytes,
function and resolved inputs. Calls named `first_panel` and `second_panel` give
each rectangle a distinct scope. Python uses `first_panel_height`,
`second_panel_height`, `total_area` and `material_quantities`. The estimate
keyword arguments are `width`, `first_panel_height` and `second_panel_height`.

Every displayed variable has a compact, defined qualifier. The legend uses
`pan` for panel, `fp` for first panel, `sp` for second panel, `rect` for rectangle,
`tot` for total and `mat` for material. Inputs include `w_{pan}`, `h_{fp}` and
`\rho_{mat}`. Rectangle results use `A_{rect,fp}` and `A_{rect,sp}`, with matching
perimeter symbols. The total is `A_{tot} = A_{rect,fp} + A_{rect,sp}`. These
symbols remain distinct when inputs happen to be equal. Python names retain
full descriptive words.
Formula-only edits leave generated types current but make
reference bindings stale; review before rebinding them. Source consistency
and reference agreement are separate checks.

The [authoring guide](../../docs/authoring.md) defines the current input and
notation rules. [Reference cases](reference.json) bind expected
values to source bytes; [integration checks](../../tests/integration/README.md)
exercise the installed commands.
