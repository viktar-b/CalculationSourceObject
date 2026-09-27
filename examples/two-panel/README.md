# Two-panel material estimate

The three calculations share input metadata in `quantities.py`. Geometry and
material functions accept signature inputs and work standalone or composed.
The estimate imports generated handles and returns only area, volume and mass.
Both rectangle perimeters remain documented and verified.

## Define, generate and compose

1. [quantities.py](quantities.py) declares shared `Annotated` metadata for inputs
   and totals. A quantity includes its numeric type, glyph, description and unit.
2. [geometry.cso.py](geometry.cso.py) defines `rectangle(width, height)`. Its return
   dictionary exposes `area` and `perimeter` to callers.
3. Generate `_cso_bindings/` using the command below. Its `.py` files create
   runtime handles; `.pyi` files supply editor signatures and public result keys.
4. [estimate.cso.py](estimate.cso.py) imports those handles and calls the rectangle
   calculation twice:

   ```python
   from _cso_bindings.geometry import rectangle

   # Within estimate():
   first_panel = rectangle(width=width, height=first_panel_height)
   second_panel = rectangle(width=width, height=second_panel_height)
   total_area: TotalPanelArea = first_panel["area"] + second_panel["area"]
   ```

5. The estimate passes `total_area` into [material.cso.py](material.cso.py), then
   exposes area, volume and mass. Forwarding a documented quantity preserves
   its identity and metadata, so the material section does not repeat the area
   as an unrelated input. Its declared unit must match exactly.

Calls place child calculations into the report at their source positions.
Selecting fewer public outputs does not remove intermediate calculations from
the document. Both perimeters remain visible even though the estimate does not
return them. Equal input values also do not merge the two panel invocations.

## Generate and verify

Run from the repository root after [setup](../../docs/development.md#setup).
These commands use the workspace CLI; an installed CLI also exposes `cso`.

```sh
"$PYTHON" -m cso_python bindings examples/two-panel
node apps/cso-cli/dist/cli.js bindings examples/two-panel --check
node apps/cso-cli/dist/cli.js verify examples/two-panel/estimate.cso.py --function estimate --input width=2 --reference examples/two-panel/reference.json --format json
node apps/cso-cli/dist/cli.js pdf examples/two-panel/estimate.cso.py --function estimate --input width=2 --reference examples/two-panel/reference.json --out output/two-panel-width-2.pdf --format json
```

Repeat with width 1 for the second case. Python 3.11 or newer is supported.
`PYTHON` selects the interpreter containing the installed `cso-python` wheel.
For a plain Python import and call, see the [library consumer example](../../packages/cso-python/README.md#generated-calculation-bindings).
The [authoring guide](../../docs/authoring.md#binding-generation-and-project-layout)
owns regeneration and Git-ignore policy.

## Expected results and notation

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
