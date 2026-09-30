# Author calculations

This guide ships with the generated project. Write constrained Python in
`calculations/*.cso.py`; the installed `cs-object` package captures the same
source for numerical execution and the report. Start with
[`calculations/report.cso.py`](calculations/report.cso.py), then replace the
rectangle example with the calculation in [brief.md](brief.md). Keep the
brief, sources and reviewable report consistent.

## Before writing formulas

State the purpose, input ranges, units, assumptions, required outputs and
acceptance cases in [brief.md](brief.md). Keep source documents or links under
[`references/`](references/README.md), with the edition, page or clause and the
assumption each supports. Ask for a decision when a missing assumption would
change the result. Establish expected numerical values independently of the
calculation being checked; formula agreement alone does not establish
engineering correctness.

## Define a report

The starter shows the full pattern:

```python
from typing import Annotated
from cso_python import calculation, section, symbol, text


@calculation(id="rectangle-area", title="Rectangle area")
@section(title="Rectangle", root=True)
def calculate(
    width: Annotated[float, symbol(glyph="w_{rect}", description="Rectangle width", unit="m")] = 2.0,
    height: Annotated[float, symbol(glyph="h_{rect}", description="Rectangle height", unit="m")] = 3.0,
):
    text(id="assumptions", content="Assume perpendicular sides and positive dimensions. The qualifier rect means rectangle.")
    text(id="reference", content="Area equals width multiplied by height; see brief.md for the project scope.")
    area: Annotated[float, symbol(glyph="A_{rect}", description="Rectangle area", unit="m^2")] = width * height
    return {"area": area}
```

Each runnable function needs `@calculation`, `@section`, documented numeric
parameters and a final dictionary of public results. Put arithmetic in
annotated assignments before the return. The return selects existing
quantities; it does not replace their documented formula rows. Source order
sets report order, while return order sets the public output order. Intermediate
annotated quantities remain in the report even when they are not returned.

Use descriptive Python names such as `total_area`, not one-letter identifiers.
Give every quantity a glyph, description and unit. Qualify variable glyphs,
including diagram labels: `A_{rect}`, `w_{pan}` and `\rho_{mat}` distinguish
their meanings. Explain qualifiers in the report. Standard unit symbols such as
`m` and `kg` need no qualifier. Use raw strings for backslash Greek names,
for example `r"\rho_{mat}"`. The notation parser is not a LaTeX engine:
`\mathrm` and `\frac` are unsupported. When reproducing an identified
external calculation, its original glyphs may be retained with a recorded
source URL and explanation of any repeated notation.

Signature metadata creates an input row, including when the parameter is not
used in a formula. A plain `float` or `int` parameter instead needs one
annotated `given(parameter)` assignment; do not document the same parameter
both ways. Give inputs finite literal defaults. Declare `float` when division
or another operation can produce a fractional value. An `int` declaration
requires an actual Python integer; a `float` declaration accepts finite
Python integers and floats. Exact integers must fit within ±(2**53 - 1);
finite Python floats may use the binary64 range. Booleans are not numeric
inputs or results. Execution preserves the actual numeric kind and does not
coerce values to satisfy an annotation.

Numeric input validation checks types and finite values. Documented physical
ranges, such as positive lengths or a maximum temperature, are assumptions;
declaring them in the brief does not enforce them in the API or browser.
Test valid boundary cases and report any physical limits that remain unenforced.
Record required range enforcement in the brief as an implementation requirement.

## Supported formulas and content

Supported expressions include finite numeric literals, earlier documented
quantities, unary minus, `+`, `-`, `*`, `/`, `**`, `sqrt`, `math.pi`, `ceil`,
`floor`, `exp`, `log`, `abs`, `min`, `max`, `round`, trigonometric functions,
`atan2` and `hypot`. Import math functions from `math` or call them through
`math`. Trigonometric functions use radians; declare angle units explicitly.
`log(value)` is natural logarithm. `round` follows Python's ties-to-even
behavior for represented binary64 values. Invalid domains and non-finite
results fail verification.

Numeric conditional expressions can use `<`, `<=`, `>`, `>=`, `==`, `!=`,
comparison chains and `and` / `or` between comparisons. Only the chosen
numeric branch executes. Bare numeric conditions, boolean quantities,
`value or fallback`, iterable or keyword forms of `min` / `max` / `hypot`,
and arbitrary Python statements are outside the supported source subset.
Run the calculation to detect unsupported syntax; a valid Python expression
is not necessarily a supported documented formula. This is trusted local
authoring, not a sandbox for untrusted Python.

Place literal `text(id=..., content=...)` calls beside the formulas they
explain. Document assumptions, limits and reference clauses in the report,
not only in comments. `figure(...)` accepts a module-relative PNG, JPEG or
SVG path, caption and alt text. Keep the asset inside the calculation
directory, for example `calculations/assets/section.svg`:

```python
from cso_python import figure

figure(
    id="section-diagram",
    path="assets/section.svg",
    media_type="image/svg+xml",
    caption="Section dimensions and axes",
    alt="Dimensioned section with x and y axes",
)
```

Missing or invalid assets fail instead of silently disappearing. A
`with document_section(id="...", title="..."):` block can group one level
of symbols, text and figures. Nested groups, calculation calls and returns
do not belong inside that block.

## Reuse calculations

Keep common `Annotated` metadata or `TypeAlias` declarations in a local
Python module, then use the same alias for a quantity passed between
calculations. Generate typed handles before importing another `.cso.py`
function:

```sh
./.venv/bin/python -m cso_python bindings calculations
./.venv/bin/python -m cso_python bindings calculations --check
```

In PowerShell 5.1 or 7, use the project's interpreter directly:

<!-- docs:project-bindings:start -->
```powershell
$env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
& $env:PYTHON -I -X utf8 -m cso_python bindings calculations
if ($LASTEXITCODE -ne 0) { throw 'Binding generation failed.' }
& $env:PYTHON -I -X utf8 -m cso_python bindings calculations --check
if ($LASTEXITCODE -ne 0) { throw 'Bindings are stale.' }
```
<!-- docs:project-bindings:end -->

For a file `calculations/geometry.cso.py` with a public function
`rectangle`, a parent in that directory can import and call it:

```python
from _cso_bindings.geometry import rectangle

first_panel = rectangle(width=width, height=first_panel_height)
second_panel = rectangle(width=width, height=second_panel_height)
total_area: TotalPanelArea = first_panel["area"] + second_panel["area"]
```

`TotalPanelArea` must be declared in the shared metadata module. Calls take
named arguments. Each call adds a child section at its source location;
documented intermediate results stay visible even if the child does not
select them as public outputs. Forwarded quantities retain their identity,
description, glyph and unit. Callee units must match exactly; write an
explicit annotated conversion when needed. Equal numeric values do not make
two quantities identical.

Generate bindings from a directory containing the parent and its local
dependencies. Source paths below it must use Python identifiers, such as
`steel_sections/calculate.cso.py`. Imports follow those paths. The generated
`_cso_bindings/` directory must exist at runtime; do not edit its files.
Regenerate after changing parameters, numeric declarations, defaults,
metadata or public output selections. Formula-only edits may leave the
interface current. Generation validates definitions but does not execute
formulas. A missing or stale handle will not regenerate itself.

Save authored Python as UTF-8 with LF line endings. The project's `.gitattributes`
keeps Python and stub files at LF on Git checkout. Generated bindings already
use UTF-8/LF. Source hashes cover exact bytes, so an editor's encoding or newline
change can invalidate a reference even when the formula is unchanged.

Each distinct quantity needs distinct displayed notation. Repeated child
calls qualify child glyphs using their call names. When a reference
deliberately reuses a glyph in separate contexts, set a meaningful
`notation_scope` in `symbol(...)` and explain that scope in a description or
section title. Collisions within one scope fail.

## Check the result

Add each top-level runnable function to [reports.json](reports.json) with its
ID, title, source path and function name, then restart `npm run dev`. The
browser derives editable inputs from the Python definition and calls the
verified local API. Recalculate with representative and boundary inputs.
Review every input, unit, intermediate formula, explanation, figure and
returned result in the report. Check that the displayed substitutions and
outputs match the intended engineering method.

From the project root, verify one execution and generate checked HTML with the
project's Python interpreter. In a POSIX shell:

```sh
PYTHON="$PWD/.venv/bin/python" npx --no-install cso verify calculations/report.cso.py \
  --function calculate --format json
mkdir -p output
PYTHON="$PWD/.venv/bin/python" npx --no-install cso html calculations/report.cso.py \
  --function calculate --out output/report.html --check-layout --format json
```

For the unchanged rectangle starter, these PowerShell 5.1 and 7 commands verify
width 2 and height 3, then write checked HTML and a PDF:

<!-- docs:project-report:start -->
```powershell
$env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
$cso = Join-Path $PWD 'node_modules\.bin\cso.cmd'
$source = Join-Path $PWD 'calculations\report.cso.py'
& $cso verify $source --function calculate --input width=2 --input height=3 --format json
if ($LASTEXITCODE -ne 0) { throw 'Calculation verification failed.' }
New-Item -ItemType Directory -Force (Join-Path $PWD 'output') | Out-Null
& $cso html $source --function calculate --input width=2 --input height=3 --out (Join-Path $PWD 'output\report.html') --check-layout --format json
if ($LASTEXITCODE -ne 0) { throw 'Checked HTML generation failed.' }
& $cso pdf $source --function calculate --input width=2 --input height=3 --out (Join-Path $PWD 'output\report.pdf') --format json
if ($LASTEXITCODE -ne 0) { throw 'PDF generation failed.' }
```
<!-- docs:project-report:end -->

Use `&` when invoking an executable stored in a variable. These commands use the
project's installed CLI and managed interpreter, including when the project
path contains spaces. Setup installs the matching Chromium used by both report
commands. The [reference recipe](references/README.md#bind-an-independent-case)
shows how to save structured JSON as UTF-8 without a BOM in either PowerShell.

Repeat verification with `--input name=value` for representative and boundary
cases. Check each command's exit status and report diagnostics. Open the HTML
and inspect its content; automated layout checks leave visual inspection pending.
Use `npm run dev` to test browser input edits and `npm run build` to check the
frontend. A frontend build alone does not verify the calculation.

Keep three judgments separate: source-to-document consistency, agreement
with independently established numerical cases, and human engineering
approval. A pending reference check is not a passing reference check.
For a bound reference file and browser registration, follow the
[worked reference recipe](references/README.md#bind-an-independent-case).
Formula or text edits change captured source identity and can invalidate
reference bindings; review and explicitly rebind them while preserving
independently established expected values. Never obtain expected values by
copying the execution being tested.

When delivering a PDF, download and inspect every page at normal size for
missing steps, unreadable notation, clipped content and pagination. The browser
and PDF need the same run and inputs. HTML-only work can finish with checked
HTML and visual inspection. Report what passed, failed or was not checked;
successful generation does not establish human engineering approval.
See [README.md](README.md) for local setup, report registration and UI customization.
