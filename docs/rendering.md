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
the execution. The [CLI](../apps/cso-cli/src/assets.ts) owns file containment,
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
define layout. The numeric verifier supports a smaller arithmetic subset.
When adding a function, update the owning implementations and their behavior
tests; rendering support alone is not numerical support.

## Printing and inspection

Import `@cs-object/react/style.css` once. Browser `printFormulaSheet` accepts
a sheet target and waits for cloned images. Its boolean result means the request
was accepted; `onError` reports deferred failures. See the [print implementation](../packages/cso-react/src/formula-sheet/print.ts)
and [browser tests](../tests/integration/formula-sheet-print-browser.test.ts).

Verified PDF generation runs through [the CLI](../apps/cso-cli/README.md).
Content retention tests, rendering success and every-page inspection are separate.
[Prepared-document tests](../tests/integration/react/prepared-document.test.ts)
check retained fields and engineering presentation using synthetic inputs.
Extracted text or a page count cannot establish visual acceptance.
