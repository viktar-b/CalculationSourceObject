# Run your calculation

Use Node.js 24 or newer and Python 3.11 or newer. The initializer installs the
Node dependencies, creates a private `.venv`, and installs Chromium for PDF output.

```sh
npm run dev
```

Open the localhost address printed in the terminal. Edit numeric inputs in the
browser, calculate, review the report, and download its PDF. Change formulas in
`calculations/report.cso.py`, then calculate again. If you change the declared
inputs, reload the browser page to rebuild its form. Existing report downloads
remain tied to their captured run until that run expires or the server stops.

Customize the page in `src/App.tsx` and its theme in `src/index.css`. The
components in `src/components/ui/` are owned by this project. To add another
shadcn component, run `npx shadcn@latest add <component>` and edit the page to
use it. `components.json` records the chosen Vite, Base UI and Lyra preset.
The input fields still come from the Python definition; page edits do not change
the calculation or API validation. `npm run build` checks and builds the Vite
frontend, but the local API and PDF routes still require `npm run dev`.

To choose a port, run `npm run dev -- --port 4173`. Use port `0` to select an
available port. Stop the server with Ctrl+C and use the same command to restart.

If setup failed or you used `--skip-install`, run `npm run setup`.
Set `PYTHON` to a Python executable if automatic detection cannot find Python
3.11 or newer. Setup can be run again without replacing calculation files.

Before replacing the starter, update [the brief](brief.md), collect
[references](references/README.md), and read [the authoring notes](authoring.md).
Source-to-document consistency checks that the documented formulas agree with
the captured calculation. Independent reference checks and engineering approval
remain separate review steps. No deployment is needed.
