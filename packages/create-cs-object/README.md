# Create a local calculation project

Use Node.js 24 or newer and Python 3.11 or newer. After the versioned npm and
Python dependencies are published:

```sh
npm create cs-object my-report
cd my-report
npm run dev
```

In PowerShell 5.1 or 7, select Python 3.11+ and run the setup steps explicitly:

```powershell
$env:PYTHON = (Get-Command python -CommandType Application).Source
& $env:PYTHON --version
```

<!-- docs:project-create:start -->
```powershell
npm.cmd create cs-object my-report -- --skip-install
if ($LASTEXITCODE -ne 0) { throw 'Project creation failed.' }
Set-Location my-report
```
<!-- docs:project-create:end -->

<!-- docs:project-setup:start -->
```powershell
npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw 'Project setup failed.' }
```
<!-- docs:project-setup:end -->

<!-- docs:project-dev:start -->
```powershell
npm.cmd run dev -- --port 4173
if ($LASTEXITCODE -ne 0) { throw 'The development server failed.' }
```
<!-- docs:project-dev:end -->

Use an absolute Python executable path for `PYTHON` if the interpreter is not
on PATH. A launcher-only installation can supply that path with
`$env:PYTHON = py -3.11 -c 'import sys; print(sys.executable)'`.
`PYTHON` is an executable path, not a command such as `py -3.11`.
The project uses its own `.venv`; activation and execution-policy changes are
unnecessary. See the generated project's `README.md` for browser and API usage.

The initializer creates an owned project template, installs its exact CLI
dependency, prepares `.venv`, and installs Chromium. It preserves generated
files after setup failure; run `npm run setup` in the project to retry.
Existing destinations are never overwritten.

Use `--skip-install` to create files without installing dependencies.
The generated project contains a synthetic rectangle calculation, an editable
brief, reference storage, and agent-neutral authoring guidance. Its editable
React and TypeScript page uses Vite, Tailwind and the selected shadcn preset.
`npm run dev` starts that page and the CLI calculation and report API on localhost.
The initializer contains no calculation server implementation.
The page's navbar report menu reads `reports.json`; each configured report runs
through its own local CLI process.

Package tests execute a real npm archive in a temporary consumer. Full runtime
acceptance belongs to the repository's installed integration checks.
Before a registry release, use the repository's
[local archive workflow](../../docs/development.md#local-package-consumers).
An initializer archive alone still installs the dependency versions named by
its template; it does not select sibling archives automatically.
