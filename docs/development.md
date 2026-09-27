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
"$PYTHON" -m cso_python bindings examples/two-panel
"$PYTHON" -m cso_python bindings examples/section-properties
npx playwright install chromium
```

Rebuild and reinstall the wheel after Python source changes. Exporting `PYTHON`
selects the installed interpreter for the CLI and test runners. A source/editable
install does not prove wheel contents or behavior outside the checkout.

The binding commands prepare imports and editor types in the source checkout.
Repeat them after changing calculation interfaces. Generated bindings stay
Git-ignored; see [generation and project layout](authoring.md#binding-generation-and-project-layout).
The demo and installed-consumer tests generate their own copies, so those runs
do not replace this source-checkout setup step.

Use `npm run dev` for the demo. The [launcher](../scripts/demo.ts) prepares the
maintained two-panel width-2 example from a verified execution. Demo generation
needs the installed Python wheel but does not render a PDF or need Chromium.
The [demo guide](../apps/demo/README.md) owns data-directory configuration,
empty states and standalone builds.
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

[PR title validation](../.github/workflows/pr-title.yml) adds the required
`pr-title` check. It validates the format in [CONTRIBUTING.md](../CONTRIBUTING.md)
on PR creation, title edits and updates, without installing dependencies. Run
`npm run test:pr-title` for its accepted/rejected title cases, also run by the
`quality` job. These tests execute the inline workflow validator. The title job
uses the runner's Node runtime without checking out or executing repository code.
Like other `pull_request` workflows, changes to the workflow itself require review.

For pull requests that change only `.md` files, CI's `changes` job skips the
three build/test jobs. Their check names remain present as skipped checks, which
GitHub accepts for required jobs. Mixed changes and all other file types run the
full suite. Pushes to `main`, manual runs, empty diffs and file-detection failures
also run the full suite. `npm run test:ci` tests the workflow's detector against
temporary Git repositories. PR title validation, dependency review and
GitHub-managed CodeQL keep their own triggers.

Keep all five check names stable and required in the `Protect main` ruleset.
Do not add workflow-level path filters or allow failures on required checks. PR code runs with
read-only repository permissions in these workflows. External actions use full
commit SHAs, enforced by the repository's Actions policy. Review any future
reusable workflow references separately; that policy still permits tags for them.

GitHub-managed CodeQL default setup scans JavaScript/TypeScript, Python and
GitHub Actions on changes and weekly. Verify successful analysis and language
coverage in the code-scanning tool status. `Protect main` also requires CodeQL
results and blocks new high or critical security findings. This is a separate
code-scanning rule, not a replacement for the five required checks above.

GitHub's code-scanning rule does not cover Dependabot PRs analyzed by default
setup or merge-queue groups, and alert locations must be in the PR diff. Review
baseline findings separately and retain dependency review and the dependency
audit. Verify coverage and enforcement before changing scanner setup or adding
a merge queue. CodeQL publishes security analysis; the existing test workflows
retain their read-only tokens.

The [security policy](../SECURITY.md) defines alert ownership, response targets
and the manual fallback for failed automatic updates.

The workspace and the three projects that use `tsup` pin esbuild to `0.28.2`
through npm overrides. `tsup@8.5.1` still requires `^0.27.0`, which excludes the
security fix in `0.28.1`; Vite's peer range already accepts `0.28.x`. The project
overrides keep isolated builds on the patched version without reading root
configuration. The browser-archive consumer also uses `0.28.2`. Validate changes
to this pin through all required checks, including ESM/CJS builds, declarations,
CLI/PDF acceptance and browser consumers. Remove the overrides when upstream
ranges permit a patched version and fresh workspace/isolated installs confirm it.

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
[ADRs](adr/), and keep local tickets and specs in `.scratch/` as described in
[the issue tracker guide](agents/issue-tracker.md).
Check local links and executable examples after moving or pruning docs.
