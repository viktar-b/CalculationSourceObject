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

## Installed language contract

Setup exports [the installed authoring contract](authoring-contract.md) from the
project's Python wheel. It covers notation, numeric declarations, formulas,
composition, external functions, tables, figures and verification limits. Its
header identifies the installed `cs-object` version. Read it before editing
`.cso.py` sources. The composed-report recipe includes complete local files.

If you used `--skip-install`, run `npm run setup` first. To refresh the guide
after changing Python package versions, run setup again, or export it directly:

```sh
./.venv/bin/python -m cso_python authoring --out authoring-contract.md
```

In PowerShell use `& .\.venv\Scripts\python.exe -I -X utf8 -m cso_python authoring --out authoring-contract.md`.
This file is generated from the installed package. Record project-specific
instructions here, rather than editing the exported contract.

Save authored Python as UTF-8 with LF line endings. The project's `.gitattributes`
keeps source and stub files at LF. Source hashes cover exact bytes, so encoding
or newline changes can invalidate reference bindings.

Numeric input validation checks types and finite values. Physical ranges stated
in the brief are assumptions until explicitly enforced. Test valid boundaries
and record any required range enforcement in the brief.

## Generate calculation bindings

Generate bindings after adding or changing calculation interfaces:

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
