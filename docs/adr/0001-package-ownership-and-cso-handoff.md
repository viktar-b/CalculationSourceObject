---
status: accepted
---

# Package ownership and the CSO handoff

Accepted with the user on 2026-09-06. Keep one repository with Python
authoring/export, TypeScript calculation core and React rendering libraries,
plus Node CLI and Next.js demo applications.

Python owns annotated-source parsing and execution and remains usable alone.
Core owns authoritative CSO/execution validation and independent formula evaluation.
CSO JSON and captured execution evidence connect the languages. The CLI owns the
Python process adapter and verification/PDF coordination. React renders supplied data.

Reusing core's validator and function vocabulary avoids competing cross-language
validators. Complete verification requires Node alongside Python; PDF generation
also needs Chromium. The user accepted this prototype installation cost.

Packages/apps own their files, declared dependencies, configuration and behavior
tests. Apps may depend on packages. Shared examples and cross-package checks
belong in root integration tests. Generic explicit user data paths remain supported.
Local npm archives and a Python wheel prove installation without a registry release.

[The code map](../code-map.md) points to the current boundaries and tests.
[ADR 0002](0002-evidence-and-engineering-presentation.md) records verification
and document-preservation decisions beyond package installation.
