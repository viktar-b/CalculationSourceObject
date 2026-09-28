# Work on this calculation

Before changing formulas, read [brief.md](brief.md) and the relevant material in
[references](references/README.md). Ask about missing assumptions that change
the result, units, load case, or acceptance criteria. Record the agreed scope
in the brief and cite the source of each engineering requirement.

Edit formulas in `calculations/report.cso.py`; the browser edits numeric inputs.
Edit page layout in `src/App.tsx`, theme tokens in `src/index.css`, and shared UI
components in `src/components/ui/`. Keep numeric input names and validation
derived from the Python definition. Add shadcn components with
`npx shadcn@latest add <component>`.
Add each runnable report to `reports.json` with a unique ID, title, source path
and entry function. Restart the local server to update the sidebar.
Read [authoring.md](authoring.md) before changing source or notation. Keep inputs,
units, assumptions, intermediate steps, references, and outputs inspectable.

Run the calculation with representative inputs and review its rendered report.
Report source-to-document consistency, independent numerical agreement, and
human engineering approval separately. Establish expected reference values
independently of the execution under test. Inspect every PDF page before delivery.

This project runs on localhost. Deployment is outside its calculation workflow.
