# @viktar-b/cso-core

Core owns calculation schemas, formula verification, conversion and Python code
generation. It does not require Python, React, Next.js or Chromium at runtime.
Generating Python source does not execute it.

Use [public exports](src/index.ts) for the API and [data contracts](../../docs/rendering.md)
for choosing between CSO, compact value-tree JSON, a mathematical sheet and a
prepared engineering document. Parse unknown data at these boundaries.

`verifyExecution` evaluates documented formulas from a captured execution and
compares them with observations, caches and public outputs. Independent references
are optional and checked separately. See [verification](src/verification/verify.ts),
[numeric policy](src/verification/numeric.ts) and [CLI semantics](../../apps/cso-cli/README.md).

The [contracts](src/contracts/) define execution, references, prepared documents
and reports. New Python captures use protocol v2; core also reads v1 without
inventing output observations. CSO presentation data retains its separate schema.

This package provides ESM, CommonJS and TypeScript declarations. Build/test
commands and archive contents are declared in [package.json](package.json).
[Local installation](../../docs/development.md#local-package-consumers) uses npm
archives. Package tests use synthetic cases; cross-package
checks belong in [workspace integration](../../tests/integration/README.md).
