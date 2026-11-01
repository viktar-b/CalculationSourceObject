# ADR-0008: Declare external functions separately from their implementations

**Status**: Accepted
**Date**: 2026-10-01
**Authors**: viktar-b, Codex

## Context

CSO needs to use ordinary Python solvers and scientific libraries while keeping
their inputs, method descriptions and returned quantities inspectable. Existing
calculation definitions and generated bindings are read statically. Importing an
external implementation to discover its interface could execute arbitrary module
code during description or binding generation.

The user chose reusable declarations with named outputs and accepted local
adapters for scientific libraries. The design must preserve the distinction
between documenting a captured result and independently evaluating a formula.

## Decision

Keep an external function's static declaration alongside quantity metadata,
separate from its ordinary Python implementation. The declaration identifies the
helper file and callable and describes the numeric inputs, named outputs and
method. Static discovery must not import the external implementation.

An implementation may return a native Python number for one declared output or
a plain dictionary of named native numbers. Adapters extract nested values and
convert scientific-library objects before returning across this boundary.

The declaration owns the external interface's metadata, finite numeric defaults
and reusable method explanation. Forwarded quantities keep the existing CSO
identity and metadata rules. Case-specific explanation uses surrounding document
text. Calls use generated typed handles in the existing bindings workflow, with
generated files separate from authored declarations.

Use `external_function(path=..., function=..., inputs=..., outputs=...,
defaults=..., description=...)`, with optional literal numeric defaults. Resolve
the helper path relative to the declaration module within the local source
boundary. Generate handles under `_cso_bindings._external.<declaration_module>`;
reserve that generated namespace and reject conflicting calculation paths.

The existing bindings command discovers declaration modules through calculation
dependencies and can bootstrap generated imports on a fresh checkout. Standalone
external-library discovery is outside the first version. Semantic changes to the
callable target, interface, defaults, metadata or method explanation require
regeneration. Helper implementation-only changes affect captured source identity
and fresh execution without alone requiring regenerated editor bindings.

Call arguments follow the existing calculation-call model: finite literals,
previously documented quantities and earlier public outputs. Authors document
argument arithmetic in annotated assignments before the call.

Generated external handles require an active top-level CSO execution in v1.
Calling one alone raises a clear context error. Ordinary Python callers can use
an existing generated calculation handle whose calculation contains external
calls, or call the ordinary helper directly. Standalone external handles do not
create a synthetic calculation or report.

Each authored external call executes once when reached in a calculation run.
Reading several outputs shares that invocation. Separate calls remain separate
even with identical inputs; CSO does not implicitly memoize them. ADR-0012 owns
module lifetime and dependency-state limits between runs.

## Consequences

### Positive

- Ordinary helpers remain independent of CSO's authoring declarations.
- Static discovery and execution keep distinct responsibilities.
- Multiple outputs share a captured invocation without value-based deduplication.
- Existing scalar quantities and documented argument formulas remain the boundary.

### Negative / Trade-offs

- Input and output names appear in both the declaration and implementation;
  mismatches require clear validation errors.
- Adapters must convert library-specific scalars and select values from richer
  return objects.
- The generator needs external-declaration discovery and a reserved namespace
  beyond its current calculation-only behavior.

## Alternatives Considered

### Attach CSO declarations to the ordinary implementation

This keeps signatures and documentation together but requires static discovery
to interpret declarations within unrestricted Python modules. The user selected
the separate declaration to fit the existing static metadata model and keep the
implementation independent of CSO.

### Reuse independent calls with identical arguments

This could reduce work but would merge authored invocation contexts and assume
determinism. Authors instead retain one call result and select its named outputs.

## Related

- [Package ownership and the CSO handoff](0001-package-ownership-and-cso-handoff.md)
- [Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Numeric declarations](0003-runtime-numeric-declarations.md)
- [External execution lifetime](0012-external-execution-lifetime.md)
- [Domain glossary](../../CONTEXT.md)
- [Introduce imported black box calculation functions](https://github.com/viktar-b/CalculationSourceObject/issues/54)

This records accepted design intent, not implemented support. The related
external-result, execution, document and compatibility ADRs complete the contract.
