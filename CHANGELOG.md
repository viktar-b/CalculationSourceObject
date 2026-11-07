# Changelog

## 1.0.0 (2026-11-07)

This coordinated v1 release covers all five packages, published to npm and PyPI.
See the [GitHub release](https://github.com/viktar-b/CalculationSourceObject/releases/tag/v1.0.0).

| Package | Registry | Version | Responsibility |
| --- | --- | --- | --- |
| `@cs-object/core` | npm | `1.0.0` | Schemas, formula verification, conversion and code generation |
| `@cs-object/react` | npm | `1.0.0` | Mathematical sheets and engineering report rendering |
| `@cs-object/cli` | npm | `1.0.0` | Captured execution, verification, HTML/PDF and local report APIs |
| `create-cs-object` | npm | `1.0.0` | Standalone local report projects |
| `cs-object` | PyPI | `1.0.0` | Constrained Python authoring, execution and generated bindings |

### Supported workflow

- Author calculations using the documented Python subset, descriptive names,
  shared quantity metadata and qualified mathematical notation. The installed
  Python package ships the matching authoring contract.
- Compose reusable calculations through generated typed bindings. Reports retain
  inputs, formulas, units, intermediates, public results, prose and figures.
- Explain reusable procedures and compare captured cases in tables, including
  engineering checks, applicability conditions and Boolean facts.
- Call declared external Python adapters while retaining their inputs, method,
  outputs and verification coverage. Scientific dependencies remain optional and
  are installed by the calculation author.
- Verify documented formulas against captured Python results, with optional
  independent reference cases. Generate checked HTML and PDF with verification
  records tied to the delivered artifact.
- Create a local report project with editable browser inputs and HTML/PDF
  downloads. Project creation requires Node 24+ and Python 3.11+.

The [authoring contract](packages/cso-python/src/cso_python/authoring.md),
[CLI guide](packages/cso-cli/README.md) and
[data contracts](docs/rendering.md) define the supported behavior and limits.
The [compatibility policy](CONTRIBUTING.md#compatibility-and-versioning) defines
versioning from v1; the [security policy](SECURITY.md#supported-versions) defines
which published versions receive fixes.

### Verification limits

V1 retains the distinction between source-to-document consistency, independent
numerical agreement and human engineering approval. Formula checks do not
establish that the engineering inputs, units, assumptions or method are
appropriate. External algorithms remain outside formula verification; uncovered
external outputs remain pending. Automated layout checks do not replace visual
inspection of delivered pages.

Execution, prepared-document and other format versions are independent of
package version `1.0.0`. Readers accept their documented formats, and older
captures retain their original evidence and verification claims.
External calculations require full execution evidence or prepared HTML/PDF;
exports that would discard their external-call evidence are rejected.
