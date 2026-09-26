# Function support

Use this workflow for a new function/operator or a change to its numerical
semantics. The [authoring guide](../../docs/authoring.md) defines user syntax;
the [rendering guide](../../docs/rendering.md#notation) owns extension points.

1. Specify accepted syntax, argument roles/count, result kind, domain failures
   and evaluation order. For a conditional or Boolean operator, identify which
   operands are evaluated lazily. Done when an authored example and its edge
   cases have explicit expected behavior.
2. Locate the owner through the [code map](../../docs/code-map.md). Ordinary
   calls belong in the [Python declarations](../../packages/cso-python/src/cso_python/function_calls.py).
   Operators and control flow also need AST lowering. Core's
   [operation registry](../../packages/cso-core/src/verification/numeric.ts)
   owns independent evaluation and operand roles. Done when each change has
   an owning module and no caller needs a parallel list of rules.
3. Check React rendering and Python export separately. Their vocabulary can be
   broader than verified authoring support. For React, inspect the core
   [function spec](../../packages/cso-core/src/sheet-model/functions.ts) and
   [value-tree renderer](../../packages/cso-react/src/mathml/symbol-value/ValueTreeMathmlRenderer.tsx).
   Reuse generic named-call rendering when its notation is sufficient; extend
   the [special MathML renderers](../../packages/cso-react/src/mathml/function-renderers.tsx)
   when the function needs mathematical structure, such as absolute-value bars.
   A new function may need no TSX change, but still needs rendering verification.
   Done when the operation works through each intended public interface and
   the React change or reuse decision is supported by rendered output.
   Display-only or export-only support does not require admission to verified
   authoring.
4. Extend the existing [function support contract](../../tests/integration/function-support.test.ts)
   for calls, or the relevant graph integration cases for operators. Keep
   independently authored expected values. Cover numeric kinds, signed zero,
   domain edges, wrong arity/roles and dormant graph structure where applicable.
   For notation changes, add [React regressions](../../packages/cso-react/tests/formula-sheet-render.test.ts)
   using schema-parsed `SheetDocument` fixtures. Check supported argument counts,
   operand order and separators, grouping of negative or compound operands, and
   symbolic and substituted forms. Shared grouping changes must preserve empty
   named-call parentheses and constant/placeholder notation. Done when targeted
   tests catch missing support, changed semantics and incorrect formula structure.
5. Follow [verification](verification.md) and inspect the affected formula
   output using [execution evidence](execution-evidence.md). Update the owning
   guide when supported syntax or behavior changes.

When a rule recurs across contracts, inspect the shared owner before adding a
local check: [numeric evidence](../../packages/cso-core/src/contracts/numbers.ts),
[Symbol display identity](../../packages/cso-core/src/contracts/glyphs.ts), or
the operation registry. The [numeric-kind decision](../../docs/adr/0005-python-numeric-kind-evidence.md)
explains why Python execution and core evaluation stay independent.
