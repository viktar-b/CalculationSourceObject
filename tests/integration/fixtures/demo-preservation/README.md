# Synthetic document presentation fixtures

These prepared documents exercise the demo viewer and rendering tests.
`two-panel-success.prepared.json` and `two-panel-width-1.prepared.json` are
presentations of synthetic [protocol records](../../../fixtures/contract-cases/README.md).
Their source hashes and execution-shaped metadata describe fixtures, not
captured Python execution. `synthetic-pagination.prepared.json` adds text,
repeated placements and a long formula to exercise pagination.

The two panel presentations retain their custom text, figure, assets and
historical review while source-owned symbols are rebound from the matching
protocol records. The integration fixture test validates every prepared
document and checks those symbol and execution bindings.

The files are independent of the maintained [two-panel example](../../../../examples/two-panel/README.md).
They do not establish source-to-document consistency for that example,
independent numerical agreement, PDF inspection or human engineering approval.
The [workspace launcher](../../../../scripts/demo.ts) supplies them as
development rendering data; the demo app owns no paths to these fixtures.
