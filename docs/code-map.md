# Code map

Python captures source and runtime observations. Core validates that evidence
and evaluates the formulas independently. The CLI passes one verified execution
to React for document preparation, then publishes HTML or PDF and evidence.

## Follow a calculation

| Step | Implementation | Behavior checks |
| --- | --- | --- |
| Capture source bytes and resolve local dependencies | [Capture](../packages/cso-python/src/cso_python/source.py) | [execution tests](../packages/cso-python/tests/test_execution.py) |
| Interpret parameters, defaults and public outputs once for generation and planning | [Definitions](../packages/cso-python/src/cso_python/definitions.py), [annotations](../packages/cso-python/src/cso_python/annotations.py) | [definition tests](../packages/cso-python/tests/test_definitions.py) |
| Plan formulas, inherited inputs and document order | [Planner](../packages/cso-python/src/cso_python/planner.py), [annotations](../packages/cso-python/src/cso_python/annotations.py) | [authoring tests](../packages/cso-python/tests/test_authoring_v2.py) |
| Declare supported Python calls, imports and argument counts | [Function calls](../packages/cso-python/src/cso_python/function_calls.py) | [call preflight tests](../packages/cso-python/tests/test_function_calls.py), [function support contract](../tests/integration/function-support.test.ts) |
| Observe assignments and public returns from captured code | [Execution](../packages/cso-python/src/cso_python/execution.py) | [authoring protocol integration](../tests/integration/authoring-v2.test.ts) |
| Generate editor types without executing calculations | [bindings](../packages/cso-python/src/cso_python/bindings.py), [handles](../packages/cso-python/src/cso_python/handles.py) | [authoring tests](../packages/cso-python/tests/test_authoring_v2.py) |
| Parse cross-language evidence | [execution schema](../packages/cso-core/src/contracts/execution.ts), [authoring schema](../packages/cso-core/src/contracts/authoring.ts) | [execution contract tests](../packages/cso-core/tests/execution-contract.test.ts) |
| Validate numeric evidence and retain input kinds in artifact bindings | [numeric contracts](../packages/cso-core/src/contracts/numbers.ts), [input evidence](../packages/cso-core/src/contracts/common.ts), `executionBindingFrom` in [execution contracts](../packages/cso-core/src/contracts/execution.ts) | [numeric contract tests](../packages/cso-core/tests/numeric-evidence-contract.test.ts), [cross-package evidence](../tests/integration/numeric-evidence.test.ts) |
| Parse notation and validate scoped Symbol display identity across documents | [notation parser](../packages/cso-core/src/notation/parse.ts), [Symbol display module](../packages/cso-core/src/contracts/glyphs.ts) | [display contract tests](../packages/cso-core/tests/symbol-display-contract.test.ts), [notation conformance](../tests/integration/notation-conformance.test.ts) |
| Validate whole Value tree structure and compare formulas, observations, outputs and references | [verifyExecution](../packages/cso-core/src/verification/verify.ts), [evaluator](../packages/cso-core/src/verification/evaluate.ts), [operation roles and numeric policy](../packages/cso-core/src/verification/numeric.ts) | [verifier cases](../tests/fixtures/verifier-cases/check.mjs), [numeric tests](../packages/cso-core/tests/verifier-numeric.test.ts) |
| Prepare ordered content bound to that execution | [prepareExecutionDocument](../packages/cso-react/src/prepare-document.ts), [document schemas](../packages/cso-core/src/contracts/document.ts) | [prepared-document tests](../tests/integration/react/prepared-document.test.ts) |
| Select engineering context, operand details and retained-source pointers | [context preparation](../packages/cso-react/src/prepare-context.ts) | [context tests](../packages/cso-react/tests/prepared-context.test.ts) |
| Capture assets, render and publish HTML/PDF | [document coordinator](../apps/cso-cli/src/document.ts), [shared HTML](../apps/cso-cli/src/prepared-html.ts), [browser inspection](../apps/cso-cli/src/pdf-rendering.ts), [evidence](../apps/cso-cli/src/evidence.ts) | [HTML and layout checks](../tests/integration/html-report.test.ts), [installed PDF cases](../tests/integration/installed/pdf-consumer.mjs), [evidence tests](../apps/cso-cli/tests/evidence.test.ts) |

The [CLI entry point](../apps/cso-cli/src/cli.ts) separates verified commands
from `dev-export` and `dev-render`. The [legacy exporter](../packages/cso-python/src/cso_python/exporter.py)
still serves older single-file sources. Development output is not verification.

## Ownership

- Python owns source parsing, execution, generated handles and authoring rules.
- Core owns public schemas, reference identity, notation parsing, formula evaluation and conversion.
  It needs no Python, React, browser or filesystem access to verify supplied data.
- React owns preparation, MathML rendering and engineering presentation.
  It receives captured assets; it does not execute calculations or fetch files.
- CLI owns process and filesystem access, reports, asset policy and HTML/PDF publication.
- Demo consumes packages and explicit data directories through its
  [workspace launcher](../scripts/demo.ts). Root [example preparation](../scripts/prepare-demo-examples.ts)
  reuses CLI verification and asset capture to supply the canonical prepared document.
  It also supplies the Python files in a companion bundle. The demo's
  [source loader](../apps/demo/src/examples/python-source.ts) validates file
  hashes and the document's execution binding before exposing the code to React.

See [ADR 0001](adr/0001-package-ownership-and-cso-handoff.md) for the dependency
decision and [ADR 0002](adr/0002-evidence-and-engineering-presentation.md) for
the distinction between evidence and the displayed calculation.

## Other entry points

- [Core exports](../packages/cso-core/src/index.ts) and
  [React exports](../packages/cso-react/src/index.ts) define the public APIs.
- [Rendering](rendering.md) maps JSON adapters, sheet schemas and notation to code.
- [Authoring](authoring.md) defines the rules for new `.cso.py` calculations.
- [Integration checks](../tests/integration/README.md) own canonical examples,
  synthetic fixtures and tests across installed packages.

Keep schema fields, function lists and option defaults in their implementations.
Update this map when responsibility or execution order changes.
