# Development

Use Node 24 LTS, selected by [`.nvmrc`](../.nvmrc), and Python 3.11+.
[Root scripts](../package.json) orchestrate the
workspace; each package/app owns its build, dependencies and behavior tests.
The [code map](code-map.md) explains responsibility and execution order.

## Setup

From the repository root in a POSIX shell:

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip wheel --no-deps ./packages/cso-python --wheel-dir artifacts
.venv/bin/python -m pip install --no-index --find-links artifacts --force-reinstall cs-object
export PYTHON="$PWD/.venv/bin/python"
npm run build:cli
"$PYTHON" -m cso_python bindings examples/two-panel
"$PYTHON" -m cso_python bindings examples/section-properties
npx playwright install chromium
```

For Windows 11 x64, use Node 24 and Python 3.11+ with PowerShell 5.1 or 7.
The following commands select an installed Python executable, then use a
repository virtualenv. If `python` is not on PATH, replace the first assignment
with your interpreter's absolute executable path. For a launcher-only install,
use `$env:PYTHON = py -3.11 -c 'import json, sys; print(json.dumps(sys.executable))' | ConvertFrom-Json`.
The JSON capture preserves Unicode executable paths under legacy console encodings.

<!-- docs:repository-setup:start -->
```powershell
$env:PYTHON = Get-Command python -CommandType Application | Select-Object -First 1 -ExpandProperty Source
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $env:PYTHON -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
$env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
& $env:PYTHON -m pip wheel --no-deps ./packages/cso-python --wheel-dir artifacts
if ($LASTEXITCODE -ne 0) { throw 'Python wheel build failed.' }
& $env:PYTHON -m pip install --no-index --find-links artifacts --force-reinstall cs-object
if ($LASTEXITCODE -ne 0) { throw 'Python wheel installation failed.' }
npm.cmd run build:cli
if ($LASTEXITCODE -ne 0) { throw 'CLI build failed.' }
& $env:PYTHON -I -X utf8 -m cso_python bindings examples/two-panel
if ($LASTEXITCODE -ne 0) { throw 'Two-panel binding generation failed.' }
& $env:PYTHON -I -X utf8 -m cso_python bindings examples/section-properties
if ($LASTEXITCODE -ne 0) { throw 'Section binding generation failed.' }
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
```
<!-- docs:repository-setup:end -->

`PYTHON` contains one executable path, not `py -3.11` or other command arguments.
The call operator `&` handles paths with spaces. No environment activation or
global execution-policy change is needed. Use `npm.cmd` and `npx.cmd` in these
PowerShell recipes so PowerShell selects the command wrappers explicitly.

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

In PowerShell, start the demo with `npm.cmd run dev` or build it with
`npm.cmd run build:demo`. For calculation verification and checked HTML/PDF, use the
[PowerShell CLI examples](../packages/cso-cli/README.md#powershell-51-and-7).

Native automated checks use Windows Server 2025. They provide evidence for the
commands under test. Windows 11 foreground Ctrl+C/restart and human inspection
of delivered reports remain separate qualification steps.

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
with Node 24 and Python 3.11 on Ubuntu and Windows Server 2025. It keeps these
required Ubuntu job names,
with PR execution selected by the changed files:

- `quality`: dependency audit, lint, typechecking, workspace tests and demo build.
- `isolation`: independent builds and tests for all projects.
- `installed-packages`: npm archives, Python wheel, CLI/PDF acceptance and library
  type/export/browser consumers. Both archive commands are required when this
  job runs. Full installed consumers run on main, manual runs and before release.

The `windows-installed` matrix runs the maintained
[installed-user workflow](../tests/integration/installed/windows-user-workflow.ps1)
in PowerShell 5.1 and 7. It checks actual npm archives and the Python wheel in
external paths with spaces and Unicode, including browser/API behavior, checked
HTML/PDF, and owned process teardown and restart. Its two check names,
`windows-installed (powershell-5.1)` and `windows-installed (pwsh-7)`, are not
currently required protection contexts.

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

CI's `changes` job selects PR checks:

| Changed files | `quality` | `isolation` | `installed-packages` | `windows-installed` |
| --- | --- | --- | --- | --- |
| Only Windows workflow guides listed below | Skip | Skip | Skip | Run |
| Only other `.md` files | Skip | Skip | Skip | Skip |
| Only examples or integration tests, optionally with Markdown | Run | Skip | Skip | Run |
| Package/app files or recognized dependency/build configuration | Run | Run | Skip | Run |
| CI tooling, workflows or unrecognized paths | Run | Run | Run | Run |

Windows guide selection covers `docs/development.md`, `docs/authoring.md`,
`docs/rendering.md`, package README files and initializer template Markdown.
The `run_windows` output selects both native shells, including for these
Markdown-only changes.

The workflow defines the recognized paths. Mixed PRs run every job required by
any changed path. Rename detection is disabled so both old and new paths count,
including deletions. Pushes to `main`, manual runs, reusable release calls, empty
diffs and file-detection failures run the full suite. A detector job failure
runs all checks; a missing output runs its affected job. Cancellation prevents
these fallback jobs.

Skipped job names remain present, which GitHub accepts for required jobs. This
keeps branch protection unchanged. Routine PRs retain behavior, numerical,
verification and document tests in `quality`; isolation still checks package/app
independence. Packaging defects can reach main and require repair before release.
For earlier installed-consumer feedback, manually run CI on the PR branch.
Release publishing still depends on the full reusable CI workflow.

`npm run test:ci` exercises the classifier in temporary Git repositories and
checks the actual job conditions, fallback behavior and release dependencies.
It also [compares the ten published PowerShell blocks](../scripts/check-windows-powershell-docs.test.ts)
with the executed Windows workflow, allowing only line-ending and common
indentation differences.
PR title validation, dependency review and GitHub-managed CodeQL keep their own
triggers.

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

Isolation, installed-package and Windows jobs retain logs and evidence for 14 days,
including generated PDFs and their hashes. Passing automated PDF checks leaves
visual inspection pending. Use the [rendering guide](rendering.md#choose-verification-by-change)
to select HTML or PDF checks and apply its delivery requirements.

Each Windows artifact set retains host versions, command statuses, archive and
binding hashes, reference agreement, HTML/PDF and browser-download evidence,
and port/restart receipts. Evidence is uploaded after success or failure unless
the job is cancelled. Automated termination uses `taskkill /T /F`; Windows 11
foreground Ctrl+C and human PDF inspection remain separate qualifications.

## Test data

Keep the suite concentrated on public behavior and important failures. Package
tests own numerical rules, parsing and rendering details. Integration tests own
capture-to-verification-to-document/export workflows; keep one representative
case per supported operation and selected transport or evaluation-order failures.
Do not repeat each package's full case table through the whole pipeline.

Prefer representative cases over every combination of equivalent inputs. Add
an edge case for a concrete failure or a distinct requirement. Avoid tests of
test-only helpers, exact example counts and incidental markup. Preserve
independent numerical references, document content, publication recovery and
installed-package checks when consolidating tests. Fewer tests should mean less
duplicated setup and fewer maintained cases, not moving the same cases into loops.

Generated test data belongs in disposable directories. Keep one canonical source
for each engineering example; integration tests copy it when mutation is needed.
Package fixtures use small synthetic behavior cases.

## Local package consumers

After building, pack the required npm workspaces into `artifacts/` with
`npm pack --workspace <name> --pack-destination artifacts`. Install the actual
archive paths together in the consumer. Install the Python wheel into its chosen
interpreter. Use the package manifests for versions and peer dependencies.
These commands do not publish to npm or PyPI.

In PowerShell 5.1 or 7, after repository setup, pack the libraries and CLI and
install their archives into a new temporary consumer:

<!-- docs:archive-consumer:start -->
```powershell
$artifacts = Join-Path $PWD 'artifacts'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$packedText = npm.cmd pack --workspace '@cs-object/core' --workspace '@cs-object/react' --workspace '@cs-object/cli' --pack-destination $artifacts --ignore-scripts --json
if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed.' }
$packed = ($packedText -join "`n") | ConvertFrom-Json
$archives = @($packed | ForEach-Object { Join-Path $artifacts $_.filename })
$consumer = Join-Path ([System.IO.Path]::GetTempPath()) ('cso-consumer-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $consumer | Out-Null
Push-Location $consumer
try {
    npm.cmd init -y
    if ($LASTEXITCODE -ne 0) { throw 'Consumer initialization failed.' }
    npm.cmd install -- $archives
    if ($LASTEXITCODE -ne 0) { throw 'Archive installation failed.' }
    & $env:PYTHON -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Consumer Python environment creation failed.' }
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    & $env:PYTHON -m pip install --no-index --find-links $artifacts cs-object
    if ($LASTEXITCODE -ne 0) { throw 'Consumer wheel installation failed.' }
    & (Join-Path $PWD 'node_modules\.bin\cso.cmd') --help
    if ($LASTEXITCODE -ne 0) { throw 'Installed CLI launch failed.' }
} finally {
    Pop-Location
}
```
<!-- docs:archive-consumer:end -->

The archives use the builds produced during repository setup. Skipping the pack
lifecycle scripts keeps the captured output valid JSON. The consumer remains at
`$consumer`; select that directory to use its local CLI. Select the repository
interpreter again when returning to repository work.
This route needs no registry release for the CSO packages. It still downloads
third-party npm dependencies. The [initializer guide](../packages/create-cs-object/README.md)
owns project creation, which uses its declared dependency versions.

## Registry releases

[Release packages](../.github/workflows/release.yml) is a manual GitHub Actions
workflow. Run it from `main` and select `all`, `npm` or `python`. It runs the full
CI workflow before publishing. Versions come from each package manifest;
already published versions are skipped, allowing a partially completed release
to be retried. Bump versions and update internal dependency pins, the initializer's
Python requirement and the lockfile before running it.

Both registries authenticate with GitHub OIDC. No npm or PyPI upload secrets are
needed. Configure a GitHub Actions trusted publisher on each npm package
(`@cs-object/core`, `@cs-object/react`, `@cs-object/cli`, `create-cs-object`) and
the PyPI project `cs-object`, using these exact values:

| Field | Value |
| --- | --- |
| Owner | `viktar-b` |
| Repository | `CalculationSourceObject` |
| Workflow filename | `release.yml` |
| Environment | Leave blank |

On npm, enable direct `npm publish` for each connection. Stage-only permission
would require approval for every release. PyPI uses the same workflow filename
for its trusted publisher. Registry-side setup is separate from checking in the
workflow; a passing local check does not confirm OIDC authentication. Confirm the
first release run in GitHub Actions and verify its versions in each registry.

## Documentation changes

Keep requirements and non-obvious reasons in one owning guide. Link to schemas,
public exports, `--help` and behavior tests for details they already define.
Update [the code map](code-map.md) only when responsibility or flow changes.
Keep domain terms in [CONTEXT.md](../CONTEXT.md), accepted decisions in
[ADRs](adr/), and keep local tickets and specs in `.scratch/` as described in
[the issue tracker guide](agents/issue-tracker.md).
Check local links and executable examples after moving or pruning docs.
