# Workspace integration tests

This layer composes built packages, apps, the maintained two-panel calculation
and synthetic fixtures. Package/app behavior tests stay in their owning projects.

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

Automatic PDF generation leaves visual inspection pending. Inspect every page
before delivering a PDF and record findings against its exact hash.
