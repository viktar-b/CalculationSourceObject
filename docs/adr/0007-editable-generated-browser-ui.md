# ADR-0007: Give generated projects an editable browser UI

**Status**: Accepted
**Date**: 2026-09-28
**Authors**: viktar-b, Codex

## Context

ADR-0006 established a local calculation server in the CLI. Its built-in page
edits declared inputs, but generated projects need a page that users can change
without editing CLI package code. The requested starter uses the shadcn Vite
preset with Base UI and npm.

## Decision

Generate a React and TypeScript Vite page with project-owned shadcn components.
`npm run dev` starts Vite and `cso dev` on loopback. Vite proxies `/api` to the
CLI. The Python definition remains the source for input fields; the CLI retains
request validation, execution verification, run state and report/PDF routes.
The standalone `cso dev` page remains available to direct CLI users.

The generated project records runnable reports in `reports.json`. Its page
lists those entries and selects a report-specific API route. The launcher starts
one CLI process per report. This extends ADR-0006's initial one-report project
limit without changing the CLI's single-target runtime.

## Consequences

### Positive

- Users edit page layout, theme tokens and components in their own project.
- The generated page and terminal requests use the same verified API.

### Negative / Trade-offs

- Local development starts Vite and at least one CLI process and adds frontend dependencies.
- Each additional runnable report starts another CLI process.
- `npm run build` produces browser assets only. A built page still needs the
  calculation API to run; deployment is a separate decision.

## Alternatives Considered

### Keep the CLI page as the generated project's only UI

That would require editing the installed CLI or adding a separate customization
interface to change the generated app's layout and components.

## Related

- [ADR-0006: Run generated calculation projects on localhost](0006-local-calculation-projects.md)
- [Initializer guide](../../packages/create-cs-object/README.md)
