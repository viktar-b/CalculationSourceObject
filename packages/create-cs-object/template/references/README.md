# Calculation references

Keep source documents or links here. Record the relevant page or clause, edition,
and the assumptions each source supports. The starter uses the elementary
rectangle area relation and has no external engineering reference case.

## Bind an independent case

A CLI reference file contains `referenceVersion: "1"` and a `cases` array.
Each case records an ID, revision, independent basis, source/input binding,
and expected values for every calculated symbol, including intermediates.
Each expected entry needs the captured symbol ID, independently established
value and matching unit. A comparison of only public outputs is a separate
numerical check; it does not provide complete CLI reference coverage.

This recipe is for the unchanged rectangle starter. Establish its expected
area independently first: a 2 m by 3 m rectangle has area 6 m². The verification
report supplies only source hashes, function and input metadata for binding;
the expected value below is the hand-derived 6, not a captured result.

From the project root:

```sh
PYTHON="$PWD/.venv/bin/python" npx --no-install cso verify calculations/report.cso.py \
  --function calculate --input width=2 --input height=3 --format json \
  > references/rectangle-check.json
```

Create `references/rectangle-reference.json` with the full case shape:

```sh
./.venv/bin/python - <<'PY'
import json
from pathlib import Path

report = json.loads(Path("references/rectangle-check.json").read_text())
if not report["ok"]:
    raise SystemExit("Resolve verification diagnostics before binding a case")
fields = (
    "entryModuleId", "entrySourceHash", "sourceClosureHash", "function",
    "resolvedInputs", "resolvedInputKinds",
)
reference = {
    "referenceVersion": "1",
    "cases": [{
        "id": "rectangle-2-by-3",
        "revision": "1",
        "basis": {
            "method": "Hand-derived rectangle area",
            "derivation": "Perpendicular sides: 2 m times 3 m equals 6 m^2.",
            "sourceDescription": "Elementary geometry for the stated rectangle.",
        },
        "binding": {name: report["provenance"][name] for name in fields},
        "expected": [{
            "symbolId": '["symbol","root","area"]',
            "value": 6,
            "unit": "m^2",
        }],
    }],
}
Path("references/rectangle-reference.json").write_text(
    json.dumps(reference, indent=2) + "\n"
)
PY
PYTHON="$PWD/.venv/bin/python" npx --no-install cso verify calculations/report.cso.py \
  --function calculate --input width=2 --input height=3 \
  --reference references/rectangle-reference.json --format json
```

Check that `checks.independentReferenceAgreement.status` is `passed` with one checked
symbol. To use the case in the browser, add
`"reference": "references/rectangle-reference.json"` to the starter entry in
`reports.json`, restart `npm run dev`, and calculate with width 2 and height 3.
The same `--reference` option works with `cso html` and `cso pdf`.

For a replacement calculation, establish expected values for all calculated
symbols from a cited method or independent implementation. Use the symbol IDs
from its execution evidence, exact documented units, and the binding for that
source, function and input case. Check the reference against that execution.
Different inputs need their own cases; an unmatched case is `not_applicable` in
CLI reports and remains pending in the browser.

Source edits invalidate a binding, including edits to explanation text. After
reviewing a change, explicitly revise the binding and case revision while
preserving independently established expected values. Update expected values
only when their independent derivation changes, and record why. Reference
agreement does not establish human engineering approval.
