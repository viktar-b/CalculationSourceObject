# CSO demo

This Next.js app explains constrained Python authoring, the
CalculationSourceObject and its FormulaSheet / prepared-document presentations.
Source-to-document consistency, independent numerical agreement, document
preservation and visual inspection are separate checks. Rendering and printing
do not establish human engineering approval. See the [domain terms](../../CONTEXT.md)
and [rendering guide](../../docs/rendering.md) for the owning definitions.

The app consumes public exports from `@viktar-b/cso-core` and
`@viktar-b/cso-react`. It builds and tests with its own files and declared
dependencies. Install the local package archives together using
[consumer setup](../../docs/development.md#local-package-consumers), then run
these commands from this app directory:

```sh
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

Supply optional data directories when starting or building the app:

- `CSO_GALLERY_DIRECTORY`: CSO `.json` files. Files beginning with `_` or `.`
  are auxiliary files and are ignored. Every selected document is validated.
- `CSO_EXAMPLES_DIRECTORY`: validated `.prepared.json` files for Examples.

An explicit `CSO_GALLERY_DIRECTORY` selects the mathematical viewer for Examples,
including when it is an empty string. Otherwise Examples reads prepared documents
from `CSO_EXAMPLES_DIRECTORY`.

Without these inputs the gallery and prepared-document viewer show empty states.
The statically generated pages read these directories at build time; rebuild
after changing production data. The loaders accept any supplied directory and
reject invalid documents. The app owns no engineering catalog and its source,
configuration and tests contain no paths into the workspace examples or fixtures.

From the repository root, `npm run dev` and `npm run build:demo` use the
[launcher](../../scripts/demo.ts). Examples defaults to the maintained
[two-panel calculation](../../examples/two-panel/README.md) at a shared width of
2 m. Root [preparation](../../scripts/prepare-demo-examples.ts) copies the source
to a temporary directory and generates its bindings. It reuses CLI execution,
reference verification and asset capture, then prepares the document from that
same execution. Source consistency and matching independent reference agreement
must pass. Stale references stop generation and are never silently rebound.

This path needs the installed Python wheel selected by `PYTHON`. Follow
[development setup](../../docs/development.md#setup). It does not produce a PDF
or require Chromium. Generated data and receipts stay in temporary directories
and are removed when the launcher exits. `generated/` directories are ignored;
there is no committed snapshot or refresh command. Each build regenerates from
the current source. Restart development after changing the example.

[Vercel configuration](../../vercel.json) installs the current Python package
into a virtual environment before building. The hosted build therefore has the
same generation prerequisite as local development.

The launcher preserves explicit directory overrides; empty values select empty
states. An explicit Examples or CSO gallery directory skips canonical generation.

Prepared documents display ordered formulas, prose and figures. An explicit CSO
gallery is a mathematical projection and omits figures and standalone prose.
Both viewers offer development browser printing through `printFormulaSheet`.
For verified PDF publication and evidence, use [cso pdf](../cso-cli/README.md).
It verifies one captured execution and prepares the document from that same
execution. Independent references are optional; inspecting every PDF page is a
separate check. Core Python sheet-to-code generation is also available, but
does not execute or verify the generated source. C# / TypeScript export and
package-manager hosting remain planned.
