# Calculation CLI

`cso verify` captures one Python execution and independently checks its formulas.
`cso html` and `cso pdf` verify that same execution before preparing a document.
`cso bindings` generates typed calculation handles. `dev-export` and `dev-render`
retain the unverified development paths.

## Run

Follow [setup](../../docs/development.md#setup). In the workspace use
`node packages/cso-cli/dist/cli.js`; an installed consumer uses `cso`.
`PYTHON` selects the interpreter with the installed `cso-python` wheel.

```sh
cso bindings examples/two-panel
cso verify examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --reference examples/two-panel/reference.json --format json
cso html examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --out output/panels.html --check-layout --format json
cso pdf examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --reference examples/two-panel/reference.json \
  --out output/panels.pdf --format json
```

Use `cso <command> --help` for current options. Source, reference and output paths
resolve against the invoking directory. Repeat `--input name=value` for distinct
parameters. Duplicate/unknown inputs and invalid numeric values are usage errors.
The [argument parser](src/verified-arguments.ts) is authoritative for syntax.

Verified commands write one structured JSON report to stdout and operational
messages to stderr. Exit 0 means success, 1 means verification/generation failure,
and 2 means invalid usage. Reports retain known source hashes, function, inputs,
versions and diagnostics; successful HTML/PDF reports include output path and hash.
Unknown provenance is not fabricated. See [report schemas](../../packages/cso-core/src/contracts/reports.ts).

## Numerical checks

[verifyExecution](../../packages/cso-core/src/verification/verify.ts) checks inputs,
constants, formulas, caches and v2 public outputs. It evaluates formulas without
using cached results as operands and compares them with actual Python observations.
Hidden documented intermediates remain covered. V1 has no public-output evidence,
so its output check is not applicable.

The [numeric implementation](../../packages/cso-core/src/verification/numeric.ts)
uses finite binary64 floats and exact Python integers within the safe integer
range. New captures retain actual numeric kinds through literals, bindings,
observations and public outputs. Core propagates kinds independently through
formulas; division and square roots produce floats. Older captures without kind
evidence retain the conservative integer-valued range limit. Conditional formulas
evaluate only their selected branch after checking the complete graph structure.
The [authoring guide](../../docs/authoring.md#supported-source-and-document-content)
lists supported functions. The fixed comparison is:

```text
abs(actual - expected) <= max(1e-9, 1e-12 * max(abs(actual), abs(expected)))
```

An absolute difference outside the finite binary64 range is reported as
`absoluteError: "overflow"` and fails agreement. Reference expected values may
include `numericKind: "float"` for finite values beyond the safe integer range.

Mismatch diagnostics retain compared values, error, tolerances, symbol and
available source location. The absolute tolerance applies in the declared unit.
There is no automatic unit conversion or dimensional/capacity assessment.
Unsupported formulas, invalid intermediate values and `documented_result` cannot
pass verified generation. Rendering supports more notation than this evaluator.

An explicit `--reference` file supplies independently established expected values.
[Reference binding](../../packages/cso-core/src/contracts/reference.ts) uses the
complete source closure, selected function and resolved inputs. Positive and
negative zero have distinct identities; input-key order does not affect identity.
A matching case must cover every calculated symbol and match its declared unit.
No match is `not_applicable`, never a pass. A failed matching reference blocks
success; absence of a match alone does not block an otherwise consistent PDF.

The CLI captures reference bytes once. Source edits, including numerically
equivalent edits, invalidate reference bindings until an explicit reviewed
revision. Never regenerate expected numbers from the execution being verified.

## HTML preview

`cso html` writes a standalone page with embedded CSS and captured images. Open it
directly in a browser. Its screen layout uses the 190 mm print content width and
the same prepared document renderer as PDF. It contains the full calculation
narrative, including formulas, substitutions, units, explanations and results.

Without `--check-layout`, no browser runs. Execution and prepared-document checks
must pass; `rendering` is `not_applicable` and `visualInspection` is `pending`.
This mode permits inspection of a layout that needs repair. Image signatures are checked during capture and
source bindings during document preparation; image decoding, passive SVG policy
and browser presentation checks require `--check-layout`.

`--check-layout` uses Chromium to check assets, presentation and MathML bounds in
screen and print media. Failures report `DOCUMENT_LAYOUT_OVERFLOW` with placement,
selector, bounds, media and overflow distance under `diagnostics[].layout`.
A failed check preserves existing HTML. Both modes retain evidence by default;
`--no-evidence` writes only the page. The evidence manifest uses `html` for the
output binding and records automatic presentation as `not_applicable` when no
browser check ran. Geometry checks do not certify pagination or visual acceptance.

See the [HTML workflow](../../docs/rendering.md#html-iteration) for development
and the [check selection](../../docs/rendering.md#choose-verification-by-change)
for when PDF inspection is needed.

## Document and evidence publication

The [document coordinator](src/document.ts) uses one execution for verification and
preparation. [Asset capture](src/assets.ts) checks module-relative containment,
hashes and media signatures. Browser checks for PDF and checked HTML additionally
require PNG/JPEG decode and passive SVG policy. Symlink escapes and active or
external SVG content fail those checks. The browser uses captured data URLs,
waits for fonts/images and checks mathematical descendants against row and sheet
bounds. [HTML construction](src/prepared-html.ts) and
[browser inspection](src/pdf-rendering.ts) are shared by both commands.

For output P, [evidence publication](src/evidence.ts) writes `P.evidence/H/`,
where H hashes the exact manifest bytes. Stderr reports its location/hash.
Payloads retain raw execution and supplied reference bytes, verification,
prepared data with captured assets, and a field/disposition mapping. Generated
JSON preserves negative zero. Source hashes identify captured Python files;
the bundle does not contain their original source bytes.

The manifest binds payloads, the document and prospective successful stdout bytes. Complete
evidence is published before the final atomic output replacement. Verification,
preparation, rendering or evidence-write failure preserves an existing output and
cleans owned temporary files. A failed final rename can leave an unused complete
bundle; require an actual successful report and matching output before treating it
as a receipt. Stdout failure after replacement cannot roll back that commit.
`--no-evidence` retains verification and atomic replacement but creates no
sibling evidence bundle.

New document reports leave visual inspection `pending`. Use the
[delivery guide](../../docs/rendering.md#printing-and-inspection). Keep source consistency, independent
agreement, content retention, rendering and visual inspection separate.
Generation and historical source reviews do not establish human approval.

## Check the implementation

[App tests](tests/) cover arguments, reports and evidence behavior.
[Installed verification](../../tests/integration/installed/verify-consumer.mjs),
[PDF failures](../../tests/integration/installed/pdf-consumer.mjs) and
[signed-zero cases](../../tests/integration/installed/signed-zero-consumer.mjs)
exercise actual packages. See [integration commands](../../tests/integration/README.md)
for fresh archive/wheel consumers and retained acceptance records.

## Work on a localhost calculation

Start one fixed source path and function with `cso dev calculations/report.cso.py
--function calculate --port 3000`. Port `0` selects an available port. The server
prints its `http://127.0.0.1:<port>` address. It uses the installed interpreter
selected by `PYTHON` and the CLI's Playwright Chromium for PDF output.

The browser builds its input form from the static Python definition. It shows
verified outputs, an embedded report, a curl request and PDF/evidence downloads.
Edit formulas in the source file and calculate again to capture the changes.
Editing browser inputs immediately clears the previous report and download link.
Reload the page after changing input declarations, names, defaults or metadata.

For a rectangle calculation with `width` and `height` inputs:

```sh
curl -sS --fail-with-body http://127.0.0.1:3000/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"inputs":{"width":4,"height":3}}'
```

A successful calculation response contains only named public outputs, such as
`{"area":12}`. Requests contain exactly one `inputs` object. Inputs may omit
parameters with defaults. Unknown fields, duplicate JSON keys, booleans,
nonfinite numbers and invalid integer values fail before execution. Finite
floating-point inputs may use the full binary64 range. Use a decimal or exponent
for floats outside the safe integer range; bare unsafe integer tokens are rejected.
Requests cannot select source paths, functions or server configuration.

`POST /api/runs` accepts the same request and returns an opaque run ID, outputs,
review checks and report/PDF/evidence URLs. Each run captures execution, assets,
the prepared document and HTML once. PDF generation uses that exact HTML, including
its captured CSS, and memoizes the result. Source edits never change an earlier
run's report or PDF. The PDF response includes `X-CSO-PDF-SHA256`. Its evidence JSON
binds the retained execution and document to the HTML/PDF hashes and automated
presentation findings. Browser evidence is an ephemeral download, separate from
the filesystem evidence bundles published by `cso html` and `cso pdf`.

Missing independent references appear as pending in the UI and report. Matching
reference failures block success. Human visual inspection remains pending, and
none of these checks establishes engineering approval. A PDF download succeeds only
after the maintained automatic presentation checks pass.

The server binds only to IPv4 loopback and rejects foreign Host/Origin headers.
It executes trusted local calculation sources. Python requests have a 30-second
deadline and bounded output. Execution is synchronous, so the local server pauses
while Python runs. One PDF renders at a time, with a 90-second deadline. Retention
is limited to 10 runs, 128 MiB of serialized report data, and 30 minutes. Expired or evicted
run URLs return 404. Request bodies are limited to 64 KiB. Stop with Ctrl+C;
restarting creates a new session and releases earlier run URLs.
