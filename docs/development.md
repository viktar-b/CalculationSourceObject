# Development

Use Node 24 LTS, selected by [`.nvmrc`](../.nvmrc), and Python 3.11+.
[Root scripts](../package.json) orchestrate the
workspace; each package/app owns its build, dependencies and behavior tests.
The [code map](code-map.md) explains responsibility and execution order.

## Setup

From the repository root:

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip wheel --no-deps ./packages/cso-python --wheel-dir artifacts
.venv/bin/python -m pip install --no-index --find-links artifacts --force-reinstall cso-python
export PYTHON="$PWD/.venv/bin/python"
npm run build:cli
npx playwright install chromium
```

Rebuild and reinstall the wheel after Python source changes. Exporting `PYTHON`
selects the installed interpreter for the CLI and test runners. A source/editable
install does not prove wheel contents or behavior outside the checkout.

Use `npm run dev` for the demo. The [launcher](../scripts/demo.ts) defaults to
synthetic protocol and presentation fixtures, not captured executions of the
maintained engineering example. The [demo guide](../apps/demo/README.md) owns
data-directory configuration, empty states and standalone builds.
Deployment settings live in [vercel.json](../vercel.json); its build context is
the repository root. A local build does not establish a hosted deployment result.

## Checks

Run package behavior tests for the changed project, then the affected
[integration checks](../tests/integration/README.md). `npm run` lists the current
root commands; package manifests define their local commands.

`npm test`, `npm run typecheck` and `npm run lint` cover the workspace.
`npm run test:isolation` builds/tests projects without root fixtures.
`npm run test:packages` installs actual archives and a wheel into fresh external
consumers. These installation checks need build prerequisites and dependency
access. PDF checks also need Chromium and Poppler.

## Continuous integration

[CI](../.github/workflows/ci.yml) runs on every pull request and pushes to `main`
with Node 24 and Python 3.11 on Ubuntu. Its required checks are:

- `quality`: dependency audit, lint, typechecking, workspace tests and demo build.
- `isolation`: independent builds and tests for all five projects.
- `installed-packages`: npm archives, Python wheel, CLI/PDF acceptance and library
  type/export/browser consumers. Both archive commands are required.

[Dependency review](../.github/workflows/dependency-review.yml) adds the required
`dependency-review` check for newly introduced high or critical vulnerabilities,
including development dependencies. The audit in `quality` also checks existing
locked dependencies. [Dependabot](../.github/dependabot.yml) checks npm and action
versions weekly. Repository settings enable vulnerability alerts and security
updates separately from that file.

Keep all four check names stable and required in the `Protect main` ruleset.
Do not add path filters or allow failures on required checks. PR code runs with
read-only repository permissions, and external actions use full commit SHAs.

Isolation and installed-package jobs retain logs and evidence for 14 days,
including generated PDFs and their hashes. Passing automated PDF checks leaves
visual inspection pending; inspect every page before delivering a PDF.

## Test data

Generated test data belongs in disposable directories. Keep one canonical source
for each engineering example; integration tests copy it when mutation is needed.
Package fixtures use small synthetic behavior cases.

## Local package consumers

After building, pack the required npm workspaces into `artifacts/` with
`npm pack --workspace <name> --pack-destination artifacts`. Install the actual
archive paths together in the consumer. Install the Python wheel into its chosen
interpreter. Use the package manifests for versions and peer dependencies.
These commands do not publish to npm or PyPI.

## Documentation changes

Keep requirements and non-obvious reasons in one owning guide. Link to schemas,
public exports, `--help` and behavior tests for details they already define.
Update [the code map](code-map.md) only when responsibility or flow changes.
Keep domain terms in [CONTEXT.md](../CONTEXT.md), accepted decisions in
[ADRs](adr/), and create `docs/backlog.md` only for unresolved multi-session work.
Check local links and executable examples after moving or pruning docs.
