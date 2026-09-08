# Calculation CLI

`cso verify` captures one Python execution and independently checks its formulas.
`cso pdf` verifies that same execution before preparing and rendering a document.
`cso bindings` generates typed calculation handles. `dev-export` and `dev-render`
retain the unverified development paths.

## Run

Follow [setup](../../docs/development.md#setup). In the workspace use
`node apps/cso-cli/dist/cli.js`; an installed consumer uses `cso`.
`PYTHON` selects the interpreter with the installed `cso-python` wheel.

```sh
cso verify examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --reference examples/two-panel/reference.json --format json
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
versions and diagnostics; successful PDF reports include output path and hash.
Unknown provenance is not fabricated. See [report schemas](../../packages/cso-core/src/contracts/reports.ts).

## Numerical checks

[verifyExecution](../../packages/cso-core/src/verification/verify.ts) checks inputs,
constants, formulas, caches and v2 public outputs. It evaluates formulas without
using cached results as operands and compares them with actual Python observations.
Hidden documented intermediates remain covered. V1 has no public-output evidence,
so its output check is not applicable.

The [numeric implementation](../../packages/cso-core/src/verification/numeric.ts)
uses finite real numbers with integer-valued inputs, intermediates and results
within the safe integer range. Its fixed comparison is:

```text
abs(actual - expected) <= max(1e-9, 1e-12 * max(abs(actual), abs(expected)))
```

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

## PDF and evidence publication

The [PDF coordinator](src/pdf.ts) uses one execution for verification and
preparation. [Asset capture](src/assets.ts) checks module-relative containment,
actual media, PNG/JPEG decode and passive SVG policy. Symlink escapes and active
or external SVG content fail. The browser uses captured data URLs, waits for
fonts/images and checks mathematical overflow before printing.

For output P, [evidence publication](src/evidence.ts) writes `P.evidence/H/`,
where H hashes the exact manifest bytes. Stderr reports its location/hash.
Payloads retain raw execution and supplied reference bytes, verification,
prepared data with captured assets, and a field/disposition mapping. Generated
JSON preserves negative zero. Source hashes identify captured Python files;
the bundle does not contain their original source bytes.

The manifest binds payloads, PDF and prospective successful stdout bytes. Complete
evidence is published before the final atomic PDF replacement. Verification,
preparation, rendering or evidence-write failure preserves an existing PDF and
cleans owned temporary files. A failed final rename can leave an unused complete
bundle; require an actual successful report and matching PDF before treating it
as a receipt. Stdout failure after PDF replacement cannot roll back that commit.
`--no-evidence` retains verification and atomic PDF replacement but creates no
sibling evidence bundle.

New PDF reports leave visual inspection `pending`. Inspect every delivered page
and bind findings to its exact bytes. Keep source consistency, independent
agreement, content retention, rendering and visual inspection separate.
Generation and historical source reviews do not establish human approval.

## Check the implementation

[App tests](tests/) cover arguments, reports and evidence behavior.
[Installed verification](../../tests/integration/installed/verify-consumer.mjs),
[PDF failures](../../tests/integration/installed/pdf-consumer.mjs) and
[signed-zero cases](../../tests/integration/installed/signed-zero-consumer.mjs)
exercise actual packages. See [integration commands](../../tests/integration/README.md)
for fresh archive/wheel consumers and retained acceptance records.
