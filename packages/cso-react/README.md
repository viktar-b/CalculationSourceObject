# @cs-object/react

React renders supplied calculation data as mathematical sheets or complete
engineering documents. It does not execute Python or evaluate formulas.

Import the stylesheet once. For a validated mathematical sheet:

```tsx
import '@cs-object/react/style.css';
import { FormulaSheet } from '@cs-object/react';
import { SheetDocumentSchema } from '@cs-object/core';

export function CalculationSheet({ source }: { source: unknown }) {
  return <FormulaSheet sheet={SheetDocumentSchema.parse(source)} />;
}
```

The stylesheet uses Tailwind CSS 4 and requires Safari 16.4+, Chrome 111+,
or Firefox 128+. These are the [Tailwind browser requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements).

For prose, figures and ordered content, use `prepareExecutionDocument` followed
by `PreparedFormulaSheet`. Supply the execution and captured `ResolvedAsset`
records. Preparation validates their binding without filesystem access or
calculation execution. It can throw `DocumentPreparationError` with diagnostics.

[Data and rendering](../../docs/rendering.md) explains contract selection,
notation, metadata presentation and printing. [Public exports](src/index.ts)
define the API; [package.json](package.json) defines dependencies, build/test
commands and packaged ESM, CommonJS, declarations and CSS.

Call `printFormulaSheet` from a browser event handler for browser printing.
Its boolean return means the request was accepted; use `onError` for deferred
failures. For verified output use [the CLI](../../apps/cso-cli/README.md).
Neither printing nor document preparation proves numerical agreement.

Install local core and React archives together using [consumer setup](../../docs/development.md#local-package-consumers).
Package tests cover renderer behavior. [Integration tests](../../tests/integration/README.md)
own example comparisons and installed rendering checks.
