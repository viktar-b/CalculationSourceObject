# Execution protocol v2 fixtures

`valid.json` is a synthetic single-function protocol fixture, not captured Python
proof. `invalid-output.json` is its structurally invalid public-output variant.
`composed.json` is a frozen protocol capture: two calls, shared width/height
quantities, exported inherited width and hidden perimeters. It preserves
protocol evidence. Package authoring tests use small synthetic cases instead of
those panel sources.

v2 adds `execution.authoring` with `version: "2"`:

- `parameters`: invocation-local names, numeric type, exact unit, canonical
  symbol, original parameter span and immediate source (`local`, `symbol`,
  `parameter` or earlier `output`). Actual values remain in `resolvedInputs`.
- `uses`: invocation/parameter to formula operand addresses and original spans.
- `outputDeclarations`: public keys, canonical quantities, selected sources and
  return-expression spans, independent of runtime return values.
- `outputs`: matching declarations plus actual runtime values.

Assignment/input observations retain the existing execution observation shape.
The presentation CSO schema stays at 1.0.0. New producers emit protocol 2; core
continues to read protocol 1 without inventing public-output evidence.

`tests/integration/authoring-v2.test.ts` checks these fixtures and adversarial mutations.
Formula, output and reference checks remain separate. Regenerating a fixture is
not an independent numerical reference review.
