# Verifier acceptance fixtures

Run the copied runner after installing the core package and copying this
directory next to `contract-cases`.

```sh
node verifier-cases/check.mjs
```

The runner imports both installed ESM and CJS exports. It parses every produced
verification report with `VerificationReportSchema`.

`arithmetic-reference-cases.json` contains hand-derived protocol records for
`(2 + 4) * 3 / 2 = 9`, `(-2 + 2) * 7 / 5 = 0`, and `sqrt(81) = 9`. Each case
lists every intermediate and final calculated symbol, its unit, its revision,
the source hash, and the full source-closure hash.

These records are synthetic. They do not contain a `.cso.py` file or captured
Python execution. Each entry source hash is the SHA-256 of its exact
`basis.sourceDescription` text. That text says it is a synthetic arithmetic
protocol fixture with no captured Python execution. The runner verifies that
hash and the canonical one-module closure hash before it asks the verifier to
compare values.

The runner reuses the public protocol fixtures from `../contract-cases` for
single, repeated, nested, two-panel and defaulted-invocation cases. It creates
small in-memory mutations for evaluator and boundary failures so the existing
contract fixtures remain unchanged.
