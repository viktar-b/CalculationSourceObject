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
- `CSO_PREPARED_DIRECTORY`: validated `.prepared.json` files.

Without these inputs the gallery and prepared-document viewer show empty states.
The statically generated pages read these directories at build time; rebuild
after changing production data. The loaders accept any supplied directory and
reject invalid documents. The app owns no engineering catalog and its source,
configuration and tests contain no paths into the workspace examples or fixtures.

From the repository root, `npm run dev` uses the [launcher](../../scripts/demo.ts).
It defaults to a temporary gallery containing the CSO from the synthetic
[protocol fixture](../../tests/fixtures/contract-cases/README.md), plus the
[prepared presentation fixtures](../../tests/integration/fixtures/demo-preservation/README.md).
These are not captured Python executions of the maintained two-panel example.
Their titles and metadata identify them as synthetic. The launcher preserves
explicit directory overrides; an empty value selects the corresponding empty state.
The maintained engineering calculation stays in its [own example](../../examples/two-panel/README.md).

The Examples viewer is a mathematical projection and omits figures and standalone
prose. Preservation displays supplied prepared documents with their ordered content.
Both viewers offer development browser printing through `printFormulaSheet`.
For verified PDF publication and evidence, use [cso pdf](../cso-cli/README.md).
It verifies one captured execution and prepares the document from that same
execution. Independent references are optional; inspecting every PDF page is a
separate check. Core Python sheet-to-code generation is also available, but
does not execute or verify the generated source. C# / TypeScript export and
package-manager hosting remain planned.
