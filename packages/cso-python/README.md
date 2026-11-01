# cs-object

Author constrained `.cso.py` calculations with Python 3.11+. Runtime dependencies
are the standard library only. Read [authoring](../../docs/authoring.md) before
writing calculations and use [two-panel](../../examples/two-panel/README.md) for
shared metadata and composed calls.

## Install and run

Install from PyPI with `python -m pip install cs-object`. The import package and
module command remain `cso_python`.

Follow [workspace setup](../../docs/development.md#setup) to build and install a
wheel. Distribution metadata lives in [pyproject.toml](pyproject.toml).
Use the interpreter containing that wheel:

```sh
python -m cso_python bindings examples/two-panel
python -m cso_python execute examples/two-panel/estimate.cso.py \
  --function estimate --input width=2
```

`bindings --check` checks generated interfaces without writing or executing
calculations. `execute` returns a versioned execution response; `export` returns
CSO JSON. Inspect `python -m cso_python --help` and each subcommand's `--help`
for options. Paths resolve from the invoking directory. Authored output and
operational messages go to stderr so stdout contains one JSON response.

## Generated calculation bindings

`cso bindings` derives an importable `_cso_bindings` package from your `.cso.py`
definitions. Each generated `.py` module creates callable handles containing a
relative source path, function name and interface fingerprint. Its `.pyi` stub
provides keyword-only signatures and typed dictionaries of public results.
Generation parses definitions without executing the authored calculations.

Importing a handle does not run the calculation. Calling it captures dependencies,
plans the invocation and records its execution. This keeps composed calculations
in the document and execution evidence. The generation and planning paths share
the same definition parser. An outdated interface raises `STALE_BINDINGS`.

After workspace setup, run this ordinary Python consumer from the repository root:

```sh
"$PYTHON" -m cso_python bindings examples/two-panel
(cd examples/two-panel && "$PYTHON" - <<'PY'
from _cso_bindings.geometry import rectangle

result = rectangle(width=2, height=3)
print(result["area"])       # 6
print(result["perimeter"])  # 10
PY
)
```

This uses the same calculation as the composed report. Successful execution
alone does not establish source-to-document consistency; run `cso verify` or
`cso pdf` for that check. See [authoring](../../docs/authoring.md#binding-generation-and-project-layout)
for generation roots, source-control policy and regeneration rules.

The generation workflow resembles [Convex's generated function references](https://docs.convex.dev/generated-api/api):
application functions determine the generated interface that callers import.
CSO handles invoke local calculations through its capture and execution pipeline.
This analogy does not prescribe a Git policy. [Convex recommends committing its generated code](https://docs.convex.dev/understanding/best-practices/other-recommendations#check-generated-code-into-version-control)
so a checkout can type-check immediately; this repository regenerates ignored
bindings during setup and consumer preparation.

A generated handle reuses its captured plan and compiled code while its supplied
input names, source bytes and assets remain unchanged. Calls through one handle
run serially because each call updates that handle's execution trace.

Successful execution supplies observations; it does not establish formula
consistency. Use [the verified CLI](../../packages/cso-cli/README.md) for that check.
The captured path preflights local source and executes captured UTF-8 bytes.
Older single-file exports retain the development exporter. This is trusted local
calculation authoring, not isolation for hostile Python.

## External adapters

`external_function` declares a single-file ordinary Python adapter with ordered
numeric inputs, named outputs, defaults and a reusable method explanation.
Generate its typed handle with the usual bindings command and import it from
`_cso_bindings._external.<declaration_module>`. Static tools capture the adapter
without importing it or requiring its scientific dependencies.

Use the handle inside a top-level generated calculation. It executes once per
authored call and captures every output, including unused diagnostics. Callers
select named outputs from the returned handle. External handles alone require
an active calculation context. Direct Python can also call the ordinary helper.

Adapters return native finite Python numbers, or a plain dictionary with exactly
the declared output keys. Convert library scalars explicitly and raise when the
algorithm fails. Adapter state is shared within a run and starts fresh in the
next run; installed dependency state is not a process sandbox. See the
[canonical examples](../../examples/external-functions/README.md).

The Python command-line consumer must explicitly advertise support with
`--supported-execution-protocol 4` before executing an external calculation.
The coordinated CSO CLI sends that capability automatically. `export` rejects
external calculations because standalone CSO cannot retain their call evidence.
Use full captured execution or prepared HTML/PDF instead.

## Code and checks

[Public helpers](src/cso_python/__init__.py), [capture](src/cso_python/source.py),
[definitions](src/cso_python/definitions.py), [planner](src/cso_python/planner.py),
[execution](src/cso_python/execution.py) and [bindings](src/cso_python/bindings.py)
implement the pipeline described in [the code map](../../docs/code-map.md).

With the wheel installed, run `python -m pip install -r tests/requirements.txt`
and `python -I tests/run.py` from this package directory. The test-only mypy pin
checks positive and negative consumers of freshly generated bindings, including
keyword arguments and typed public result keys. Runtime dependencies stay empty.
The tests use package-owned synthetic fixtures and temporary bindings; no root
examples or Node are required. [Workspace integration](../../tests/integration/README.md)
owns actual example, installed cross-package and PDF acceptance.
