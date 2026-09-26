# ADR-0001: Package ownership and the CSO handoff

**Status**: Accepted
**Date**: 2026-09-06
**Authors**: viktar-b

## Context

The project uses Python for annotated calculation source and TypeScript for
verification and rendering. The languages need a shared evidence contract
without competing authoritative validators. Packages and applications also
need clear ownership so they can build and test independently.

## Decision

Keep Python authoring and export, the TypeScript calculation core and React
renderer, the Node CLI, and the Next.js demo in one repository. Python owns
annotated-source parsing and execution and remains usable alone. Core owns
authoritative CSO and execution validation and independent formula evaluation.
CSO JSON and captured execution evidence connect the languages. The CLI owns
the Python process adapter and local verification and PDF coordination. React
renders supplied data.

Packages and apps own their files, declared dependencies, configuration and
behavior tests. Apps may depend on packages. Shared examples and cross-package
checks belong in root integration tests. Explicit user data paths remain
supported. Local npm archives and a Python wheel demonstrate installation
without a registry release.

## Consequences

### Positive

- Core's validator and formula vocabulary remain authoritative across the
  Python-to-TypeScript handoff.
- Package isolation and root integration checks test both ownership and the
  cross-language contract.
- Python remains usable without the TypeScript packages for authoring and
  execution.

### Negative / Trade-offs

- Complete verification requires Node alongside Python; PDF generation also
  requires Chromium. This installation cost was accepted for the prototype.
- JSON and execution evidence must remain compatible across language boundaries.
- Local archives and a wheel prove installation but do not provide public
  package distribution.

## Alternatives Considered

### Competing Python and TypeScript validators

Duplicating authoritative validation across languages would create two sources
of truth for the CSO contract and formula vocabulary. Core owns those checks;
Python supplies source and runtime observations.

## Related

- [Code map](../code-map.md)
- [ADR-0002: Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
