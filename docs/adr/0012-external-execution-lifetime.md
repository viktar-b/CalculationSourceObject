# ADR-0012: Capture single-file adapters with state scoped to each run

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

External functions need a stated relationship between captured source, executed
code and returned values. Ordinary Python imports cache modules; reloading an
adapter does not reset every dependency. A full captured package loader or a
new interpreter for every external call would add machinery beyond the first
scalar-boundary feature.

Saved documents must remain tied to the results actually captured. Identical
source and inputs do not establish that two external executions returned the
same numbers, and independent expectations must not match on observed results.

## Decision

Create a fresh adapter module namespace for each top-level calculation run and
share it among that run's calls to the same adapter. Compile and execute the
captured adapter bytes. Retain the CLI's existing process boundary and add no
subprocess per external call. Direct Python callers retain ordinary imported
library state and must restart their interpreter after package updates. This
establishes fresh adapter state, not complete interpreter isolation.

For v1, adapters are single Python files that may define their own helper
functions/classes and import standard-library or installed packages. Imports
of other project-local files are unsupported. An existing multi-file helper
may need consolidation or installation as a package. Record the adapter hash,
interpreter identity and installed-distribution manifest as bounded provenance.
These records do not identify every imported byte, native dependency, file read,
network response or other mutable state.

Give each completed run its own identity. Bind prepared documents, verification
and saved evidence to a digest of that exact captured execution, preserving
numeric kinds and signed zero. Later source changes or executions cannot alter
an earlier retained report, and rendering does not execute adapters.

Match new external-result reference cases on source and adapter identity,
selected function, resolved inputs and recorded interpreter/package environment
identity. Never match on run IDs or returned values. Conservatively invalidate
those reference bindings when the recorded environment changes. Existing
pure-CSO reference semantics stay unchanged.

Exceptions, invalid or missing outputs, resource failures, nonconvergence and
failure to find an admissible numerical solution stop the run. The adapter must
translate library-specific failure statuses and convergence warnings into
exceptions; CSO cannot infer success from a finite number. Preserve diagnostics
and nonfatal warnings. Never substitute a number or reuse a stale successful
result. A valid numerical result failing an engineering criterion remains a
result with a failed check, as in ADR-0010.

Expose a configurable whole-calculation timeout in CLI dev and one-shot verified
commands. Preserve their current defaults: 30 seconds for dev and no deadline
for one-shot commands. Accept a nonnegative duration in seconds; zero explicitly
disables the deadline. Apply it to the Python calculation process, separately
from browser-rendering limits. A timeout fails the run and preserves a previous
successful artifact. Direct Python callers own cancellation. This adds no
per-call subprocess, memory sandbox or general process-tree guarantee.

## Consequences

### Positive

- Captured adapter bytes identify the entry code actually executed.
- Run-scoped adapter state fits existing Python and CLI execution paths.
- Saved reports distinguish executions even when source and inputs are identical.
- Failure handling preserves the distinction between numerical failure and an
  engineering criterion that a valid result does not satisfy.

### Negative / Trade-offs

- Project-local multi-file adapters are outside v1.
- Direct Python library callers share imported dependency state across runs.
- Environment manifests establish bounded identity, not deterministic replay or
  complete dependency provenance.
- Conservative environment matching may invalidate an external reference after
  an unrelated installed-package change.
- Adapter authors must interpret their library's convergence/failure contract.

## Alternatives Considered

### A fresh interpreter for every external call

This provides stronger call-level separation but repeats startup and library
imports. The user selected one adapter namespace per calculation run instead.

### A general captured local-package loader in v1

This requires package initialization, relative imports, dynamic import paths and
module lifetime rules. The user selected the single-file boundary for the first
version and accepts its restrictions on existing multi-file helpers.

### Bind reports and references only to source and inputs

Two external executions with equal source and inputs can return different
numbers. Reports bind to exact captures; independent references retain separate
source/input/environment matching that does not use the observed answer.

## Related

- [Static external-function declarations](0008-static-external-function-declarations.md)
- [External-result verification](0011-external-result-verification.md)
- [Applicability and numerical execution](0010-applicability-and-numerical-execution.md)
- [Local calculation projects](0006-local-calculation-projects.md)
- [Introduce imported black box calculation functions](https://github.com/viktar-b/CalculationSourceObject/issues/54)

This records accepted design intent. It does not claim implemented isolation,
dependency capture, numerical verification or performance measurements.
