# Data and rendering

Use the [React package](../packages/cso-react/README.md) for imports and a small
rendering example. `FormulaSheet` displays supplied values; numerical evaluation
belongs to [core verification](../packages/cso-core/src/verification/verify.ts).

## Choose the input contract

| Input | Use | Authoritative code |
| --- | --- | --- |
| `CalculationSourceObject` | Formulas, symbols, source context and ordered content | [object schema](../packages/cso-core/src/calculation-source/object-schema.ts), [parser](../packages/cso-core/src/calculation-source/parse.ts) |
| Value-tree JSON | Compact adapter for mathematical rows | [schema](../packages/cso-core/src/value-tree-json/schema.ts), [conversion](../packages/cso-core/src/value-tree-json/to-sheet.ts) |
| `SheetDocument` | Direct mathematical sheet passed to `FormulaSheet` | [schema](../packages/cso-core/src/sheet-model/schema.ts), [row traversal](../packages/cso-core/src/sheet-model/selectors.ts) |
| `PreparedDocument` | Ordered engineering document with prose, figures and retained evidence | [document contract](../packages/cso-core/src/contracts/document.ts), [preparation](../packages/cso-react/src/prepare-document.ts), [renderer](../packages/cso-react/src/PreparedFormulaSheet.tsx) |

Parse unknown input with the public schema/parser for that contract. Use
`safeParse` when the caller handles validation failures. Read accepted fields
and defaults from the schemas, rather than maintaining another interface here.

Value trees carry a root, references and supplied results. Reference identities
must resolve; glyphs are display labels, not reference keys. Repeated placement
of one symbol retains its identity. A math-only sheet cannot establish complete
preservation of a source containing figures or standalone text.

For Python export, use the [core code generator](../packages/cso-core/src/python/to-python.ts).
It orders assignments by dependency and generates Python without executing it.

## Engineering presentation

Default HTML/PDF shows the engineering narrative: ordered inputs and formulas,
substitutions, units, explanations, diagrams, assumptions, qualifications and
results. Full source/audit data stays in machine-readable evidence. Internal
records and historical reviews do not become an automatic printed appendix.

`PreparedFormulaSheet` accepts `showSourceDetails={false}` to omit the header's
source-status and function/input summary. Its default is `true`. This affects
only the header; input rows and all calculation content remain unchanged.
Examples uses this option beside its Python viewer. CLI/PDF rendering keeps
the default.

[Context preparation](../packages/cso-react/src/prepare-context.ts) selects
which source fields have a presentation role. Preserve unmapped extensions,
own-key identities, empty/falsy values and ordered metadata in evidence. Map
visible content back to retained source data. Historical attribution never
approves a new execution. See [ADR 0002](adr/0002-evidence-and-engineering-presentation.md).

`PreparedDocument` version 2 carries selected context on the document, sections
and item placements. Symbol placements also carry context for active operands
that have no placement of their own. The renderer consumes these fields without
searching historical reviews, selecting metadata or traversing operand context.
Every displayed context value has a JSON pointer to retained current-source
data; the document schema checks that the pointer resolves to the same value.
This checks attribution within the document, not independent numerical agreement.

Current source and section metadata remain in `sourceMetadata` and section
`metadata`. Item `contextSource` retains authored placement metadata, nested
content metadata and unconsumed content fields. Historical records remain
separate retained evidence; changing their order does not change presentation.
Reprepare after changing source context, symbols or placements.

Version 1 prepared JSON is rejected. Regenerate saved documents with
`prepareExecutionDocument` from the captured execution and assets, or with
`prepareLegacyDocument` from the original CSO, asset manifest and captured assets.
Reattach historical reviews through the preparation options. Synthetic documents
constructed directly must provide context arrays and symbol operand arrays.
Update core and React together; source CSO and execution versions are unchanged.

The pure preparer receives captured data URLs and validates their binding to
the execution. The [CLI](../packages/cso-cli/src/assets.ts) owns file containment,
capture, media validation and image decoding. For imported documents, supply a
`LegacyAssetManifest` binding figure IDs and URLs to captured bytes, captions and
alt text. Authored widths remain preferred CSS pixel sizes constrained to the page.

## Notation

Glyphs and units use the pure [core notation parser](../packages/cso-core/src/notation/parse.ts).
Braces form transparent groups for subscripts, superscripts and fractions:
`A_{rect}`, `mm^{2}`, `{height+width}/{2}`. Parentheses and brackets form
visible fenced groups. Greek names may be plain or backslash-prefixed, such as
`rho` and `\rho`. Other backslash commands remain literal tokens; `\frac` and
`\sqrt` are not glyph commands.

The [alias table](../packages/cso-core/src/notation/aliases.ts) lists supported
names. The typed tree preserves identifiers, numbers, operators and quoted text
for the [React MathML adapter](../packages/cso-react/src/ascii-math/NotationMathmlView.tsx).
Unknown unquoted Unicode scalars remain intact as upright literal text. The
explicit Greek and mathematical italic identifier sets avoid differences between
runtime Unicode versions. Malformed nonempty notation is a contract error for
documents and verified output; the interactive view renders `?` as feedback.
Input, node and nesting limits return diagnostics instead of overflowing the
renderer. [Core notation tests](../packages/cso-core/tests/notation.test.ts) and
[React rendering tests](../packages/cso-react/tests/ascii-math-regressions.test.ts)
show the grammar and output roles.
Apply the [authoring naming rules](authoring.md#names-and-notation) to new variables.

Formula structure comes from value-tree functions. [Function specs](../packages/cso-core/src/sheet-model/functions.ts)
define IDs and precedence; [MathML renderers](../packages/cso-react/src/mathml/function-renderers.tsx)
define layout. The 38 calculation operations have constrained Python forms and
independent verification rules. The remaining `noop` and `stub` nodes retain
rendering and Python export support for grouping and placeholders; they are not
Python authoring functions or numerically verified operations. Logical `and` /
`or` are verified only as predicates that join comparisons. The
[authoring guide](authoring.md#supported-source-and-document-content) defines
accepted argument forms and numerical roles.

Declare each authored function once in Python's
[function calls](../packages/cso-python/src/cso_python/function_calls.py) module.
Source preflight and planning derive allowed imports, spellings, argument counts
and operation IDs from those declarations. Core independently owns numerical
behavior in its [operation registry](../packages/cso-core/src/verification/numeric.ts).
When adding a function, add its evaluator, display spec and Python export mapping.
The [function support contract](../tests/integration/function-support.test.ts)
reads every Python declaration from the installed wheel and exercises each
spelling through capture, verification, rendering and export. It classifies
display-only nodes separately and checks their rendering/export compatibility
without requiring Python authoring syntax. Add an independent
reference case there and domain/edge cases in the owning packages. Display-only
or export-only operations do not need an authoring declaration.

## Choose verification by change

Choose the evidence needed for the changed behavior before generating artifacts.

| Change | Primary checks | PDF work |
| --- | --- | --- |
| Bindings, imports, documentation or runtime only | Execution, contracts, types and consumer tests | Only for a requested PDF deliverable |
| Calculation content or composition | Prepared content/identity assertions and affected HTML formulas | A targeted print check if pagination is affected |
| MathML, CSS or document layout | Screen and print-media browser checks; inspect affected HTML rows | Representative final pagination check |
| PDF pipeline or delivery | HTML diagnostics first | Print behavior checks; every-page inspection for a delivered PDF |

Use the actual prepared document renderer and captured assets. A fresh Python
execution, a hand-built HTML approximation or the demo's screen layout does not
establish the layout of the verified report being inspected.

## HTML iteration

After [setup](development.md#setup), generate a standalone report from the
repository root:

```sh
node packages/cso-cli/dist/cli.js bindings examples/two-panel
node packages/cso-cli/dist/cli.js html examples/two-panel/estimate.cso.py \
  --function estimate --input width=2 --out output/panels.html --format json
```

Open the file in a browser. It embeds the shared renderer's CSS and captured image
bytes, uses the 190 mm print content width on screen, and needs no preview server.
Generation verifies one execution and prepares its document without Chromium.
The report records browser rendering as `not_applicable`; it is not a layout pass.

Add `--check-layout` to check the same HTML in Chromium at screen and print media
settings before publication. The shared HTML/PDF check waits for fonts and images,
validates presentation, and checks MathML descendant bounds against the row and
sheet. Overflow diagnostics identify the source placement, selector, measured
bounds, media and overflow in CSS pixels. Inspect that row first; capture a
targeted screenshot when notation or spacing needs visual judgment.

For a failing layout, plain `html` export still produces an inspectable preview.
`html --check-layout` and `pdf` fail without replacing an existing output.
Browser geometry checks do not establish actual PDF pagination, font embedding,
independent numerical agreement or human visual acceptance.

## Printing and inspection

Import `@cs-object/react/style.css` once. Browser `printFormulaSheet` accepts
a sheet target and waits for cloned images. Its boolean result means the request
was accepted; `onError` reports deferred failures. See the [print implementation](../packages/cso-react/src/formula-sheet/print.ts)
and [browser tests](../tests/integration/formula-sheet-print-browser.test.ts).

Verified PDF generation runs through [the CLI](../packages/cso-cli/README.md).
Content retention tests, rendering success and every-page inspection are separate.
[Prepared-document tests](../tests/integration/react/prepared-document.test.ts)
check retained fields and engineering presentation using synthetic inputs.
Extracted text or a page count cannot establish visual acceptance.

Before delivering a PDF, inspect every page for missing content, unreadable
notation, clipping and pagination. Bind findings to the exact final PDF bytes.
Generated test artifacts can remain marked `visualInspection: pending`; running
an automated suite does not create a manual review queue for every test PDF.
For HTML work, inspect affected formulas at their intended width and keep
numerical, browser-layout and visual results separate. On-demand hosted downloads
follow the pending-review policy in [ADR 0004](adr/0004-hosted-verification-and-pdf-review.md).
