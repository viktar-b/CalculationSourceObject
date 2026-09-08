# cso-python

Author constrained `.cso.py` calculations with Python 3.11+. Runtime dependencies
are the standard library only. Read [authoring](../../docs/authoring.md) before
writing calculations and use [two-panel](../../examples/two-panel/README.md) for
shared metadata and composed calls.

## Install and run

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

Successful execution supplies observations; it does not establish formula
consistency. Use [the verified CLI](../../apps/cso-cli/README.md) for that check.
The captured path preflights local source and executes captured UTF-8 bytes.
Older single-file exports retain the development exporter. This is trusted local
calculation authoring, not isolation for hostile Python.

## Code and checks

[Public helpers](src/cso_python/__init__.py), [capture](src/cso_python/source.py),
[definitions](src/cso_python/definitions.py), [planner](src/cso_python/planner.py),
[execution](src/cso_python/execution.py) and [bindings](src/cso_python/bindings.py)
implement the pipeline described in [the code map](../../docs/code-map.md).

With the wheel installed, run `python -I tests/run.py` from this package directory.
The tests use package-owned synthetic fixtures and temporary bindings; no root
examples or Node are required. [Workspace integration](../../tests/integration/README.md)
owns actual example, installed cross-package and PDF acceptance.
