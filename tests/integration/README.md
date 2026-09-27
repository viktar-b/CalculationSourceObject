# Workspace integration tests

This layer composes built packages, apps, the maintained two-panel calculation
and section-property examples, and synthetic fixtures. Package/app behavior tests
stay in their owning projects.

- `core/`: conversion, shared contracts and formula verification.
- `react/`: document preparation and content retention.
- `installed/`: actual package archives, wheel installation and CLI/PDF checks.
- [fixtures/demo-preservation/](fixtures/demo-preservation/README.md): synthetic
  protocol presentations and pagination data, independent of the maintained example.

Run from the root with the Python wheel installed in `PYTHON`:

```sh
npm run build:cli
npm run test:integration
npm run test:packages
```

`test:packages` creates fresh npm archives and a Python wheel, installs them into
consumers outside the checkout, and checks those installed packages together.
The package/app isolation gate is `npm run test:isolation`.

The canonical two-panel calculations and metadata stay in `examples/two-panel`.
Tests copy sources into temporary consumers before changing them and generate
their own bindings. Expected numerical values remain independently authored.
Source-to-document consistency and independent agreement are separate checks.

Use the [rendering guide](../../docs/rendering.md#choose-verification-by-change)
to select HTML or PDF checks. Automatic generation leaves visual inspection
pending. Test artifacts require manual review only when they are being delivered
or their visual behavior is part of the change.

The section-property comparisons generate bindings in a temporary consumer,
reuse each canonical reference calculation twice and forward outputs to a shared
comparison. Equal-depth cases check ratios of 1 and preserve every child formula
in the prepared document. Installed acceptance also checks the default comparisons
and ordinary Python imports against fresh archives and a wheel outside the repo.

Automatic PDF generation leaves visual inspection pending. Inspect every page
before delivering a PDF and record findings against its exact hash.

## Measure generated handle calls

Run the repeated-call acceptance check with an interpreter that contains the
wheel under review:

```sh
$PYTHON tests/integration/benchmark-calculation-handle.py
```

The script copies the canonical two-panel sources, generates their bindings,
checks the width-1 and width-2 results, and requires 1,000 calls to finish in
less than one second.
