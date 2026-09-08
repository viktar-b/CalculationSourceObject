# CalculationSourceObject

Write engineering calculations in constrained Python and generate documents
showing their inputs, formulas, substitutions, units and results. The verified
CLI compares documented formulas with Python runtime values before producing a
PDF. Independent numerical references and visual inspection are separate checks.

> [!WARNING]
> This project is still a prototype. The `.cso.py` authoring format and API will
> have breaking changes. Existing calculations may need edits after an upgrade.
> Pin the package versions you use and rerun verification after upgrading.

The initial package version is `0.1.0`. The `0.x` series is for initial
development under [Semantic Versioning](https://semver.org/#spec-item-4), with no
guarantee of API compatibility. Data schema and execution protocol versions are
independent of package release versions.

## Why this tech stack

We use Python to write calculations. Its readable syntax helps engineers express
formulas, inspect each step, and reuse calculations. The same Python source
provides the formulas and numerical results for the document.

We use TypeScript for verification and document generation. It lets the
command-line tool and web applications share the same calculation model and
verification code. It also works directly with the browser tools that display
and print calculation sheets.

We use MathML because it is a web standard for mathematical notation. Browsers
display the formulas alongside explanations, tables, and diagrams, then print
the document to PDF. Authors do not need to write TypeScript or maintain a
separate LaTeX document.

## Start here

- **Author a calculation:** [authoring rules](docs/authoring.md) and the maintained
  [two-panel example](examples/two-panel/README.md).
- **Verify or generate a PDF:** [CLI guide](apps/cso-cli/README.md).
- **Use the libraries:** [Python](packages/cso-python/README.md),
  [core](packages/cso-core/README.md), [React](packages/cso-react/README.md).
- **Explore the demo:** [demo guide](apps/demo/README.md). After setup,
  `npm run dev` starts it through the [workspace launcher](scripts/demo.ts).
- **Change this repo:** [setup and checks](docs/development.md),
  [code map](docs/code-map.md), [agent guidance](AGENTS.md).
- **Understand the contracts:** [domain terms](CONTEXT.md),
  [data and rendering](docs/rendering.md), [decisions](docs/adr/).

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

Development uses local npm archives and a Python wheel. Follow
[setup](docs/development.md#setup), then run a verified example from the root:

```sh
node apps/cso-cli/dist/cli.js verify examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --reference examples/two-panel/reference.json --format json
```

Licensed under [Apache-2.0](LICENSE). See [NOTICE](NOTICE) and package third-party
notices for attribution.
