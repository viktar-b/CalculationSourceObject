# Execution contract fixtures

These are synthetic protocol records, not captured Python execution. Source
hashes identify descriptive fixture strings; `source-hash-vector.json` fixes the
accepted encoding. The two-panel contract fixtures use nine calculated values
and twelve input symbols. They are independent of the authored example.

[check.mjs](check.mjs) parses valid cases and rejects structural violations through
both built ESM and CommonJS core exports. Copy this directory into an installed
consumer and run `node contract-cases/check.mjs`. Numerical mismatch records
intentionally parse; [verifier cases](../verifier-cases/check.mjs) reject their
values. A structurally valid response is not a numerical verification pass.

Cases cover repeated/nested calls, defaults, observation coverage, references,
ordered content and partial failure reports. The one-pixel PNG checks byte
identity, not engineering figure preservation. Inspection fixtures are examples
of artifact-bound records, not evidence that a PDF was generated or inspected.

[Contract schemas](../../../packages/cso-core/src/contracts/) define fields and
[workspace integration](../../integration/README.md) checks actual source capture,
installed verification, content preservation and PDF publication.
