# Calculation authoring

Use constrained Python in `<name>.cso.py` files. Start from the maintained
[two-panel example](../examples/two-panel/README.md), with
[shared metadata](../examples/two-panel/quantities.py),
[a reusable calculation](../examples/two-panel/geometry.cso.py) and
[composition](../examples/two-panel/estimate.cso.py).
Install the [Python package](../packages/cso-python/README.md) first.

## Names and notation

Use descriptive Python names for parameters, intermediates, outputs and calls,
such as `first_panel`, `second_panel` and `total_area`. One-letter identifiers
and arbitrary abbreviations do not identify a quantity.

Define displayed notation separately with `symbol(glyph=...)`. Use qualified
glyphs such as `r"A_{rect}"`, `r"w_{pan}"` and `r"\rho_{mat}"` for variables,
including diagram labels. Bare one-letter variable glyphs are not acceptable in
new calculations. Standard units such as `m` and `kg` remain unchanged.

Keep qualifiers compact and explain them in the document. `rect`, `fp` and `sp`
can mean rectangle, first panel and second panel. Inspect glyphs at normal PDF
page size within the existing symbol column. Use braced subscripts/superscripts
and raw Python strings for backslash Greek names. The [notation parser](rendering.md#notation)
is not a LaTeX engine; commands such as `\mathrm` and `\frac` are unsupported.

## Inputs and reusable calculations

Keep reusable metadata in shared `Annotated` / `TypeAlias` declarations.
Each selected function has `@calculation`, `@section`, numeric parameters and a
final public-output dictionary. Parameters accept `float`, `int` or metadata
aliases, with finite literal defaults. Standalone inputs, including unused
parameters and defaults, need signature metadata or a legacy annotated
`given(parameter)` row. Combining both for one parameter is ambiguous.

Numeric declarations are runtime promises. An `int` parameter, documented
assignment or public output must contain a Python `int`; floats such as `1.0`
are rejected. A `float` declaration accepts Python `int` and `float` values
within the supported numeric range. Execution preserves values without coercion
and rejects booleans. Use `float` when a formula can produce a fractional value,
including Python division. See [the decision](adr/0003-runtime-numeric-declarations.md).

During composition, a documented caller quantity keeps its identity, glyph,
description and unit. Forward it without repeating an input declaration.
Declared callee units must match exactly; conversions belong in explicit
annotated calculations. Equal numeric values do not make two quantities identical.
Standalone values, supplied literals and defaults create input rows.

Generate handles with `python -m cso_python bindings <directory>` or
`cso bindings <directory>`. Use `--check` to detect missing/stale bindings without
writing files. Generated `_cso_bindings` modules provide named arguments and
typed public result keys. Generate bindings in a temporary consumer when tests
mutate sources. Dynamic Python callers can use `load_calculation` directly.

Generation validates calculation definitions before writing generated files.
Parameters, defaults and public output selections follow the same static rules
in generation and execution planning. Successful generation establishes valid
public declarations; formula support, document content and requirements that
depend on a particular invocation are checked during planning. Generation does
not run authored calculations.

Calls accept finite literals, earlier documented quantities or earlier public
outputs. Paths resolve relative to the calling module and stay inside the entry
directory, including through symlinks. Calls occupy separate source lines.
Missing/private outputs, argument errors, dependency cycles, escaping paths and
stale generated interfaces fail before authored execution.

The ordinary return dictionary selects documented local quantities, inherited
parameters or earlier child outputs. Keys are unique, nonempty literal strings.
Put arithmetic in annotated assignments before returning it. Return order defines
the public interface; source order defines the document. Hidden annotated
intermediates remain documented, observed and verified.

The shared definition rules live in [Definitions](../packages/cso-python/src/cso_python/definitions.py).
[Planner](../packages/cso-python/src/cso_python/planner.py) consumes those definitions
for each invocation. See the
[authoring tests](../packages/cso-python/tests/test_authoring_v2.py).

## Supported source and document content

Supported formulas include numeric literals, references, unary minus, arithmetic
`+`, `-`, `*`, `/`, `**` and `sqrt`. Legacy `given`, `calculation_call` and
`documented_result` remain readable. `documented_result` is an explicitly
unverified result and blocks verified PDF generation.

Module imports and metadata are constrained. Local metadata modules contain
literal declarations and aliases; they cannot introduce arbitrary module effects.
Metadata uses JSON-native dictionaries with string keys, lists and finite scalar
values. Integer-valued numbers must fit ±(2**53 - 1). The parser rejects unsupported
imports, decorators, defaults, statements and formulas before execution. Consult
[source preflight](../packages/cso-python/src/cso_python/source.py) and
[negative execution cases](../packages/cso-python/tests/test_execution.py) for
the exact supported syntax. This is trusted local authoring, not a Python sandbox.

Place literal `text(...)` and `figure(...)` calls in source order.
`document_section(...)` permits one child level containing symbols, text and
figures, without nested groups, calls or returns. Following statements restore
the function section. A calculation call places its child section at that call.
Figures require module-relative PNG/JPEG/SVG paths, captions and alt text.
Missing or invalid assets fail; they must not silently disappear from a PDF.

## Repeated symbols

Every distinct quantity needs distinct notation. Inherited quantities retain
the caller's symbol. Reusing a glyph across invocations qualifies child glyphs
with their call-binding paths: `first_panel` and `second_panel` produce
`A_{rect,fp}` and `A_{rect,sp}`. Nested paths retain every scope. Duplicate glyphs
inside one invocation and unresolved collisions fail, including colliding initials.

[Python glyph qualification](../packages/cso-python/src/cso_python/glyphs.py) and
[core glyph validation](../packages/cso-core/src/contracts/glyphs.ts) define the
normalization and evidence rules. Use meaningful call names and explain the
resulting abbreviations instead of widening the PDF column.

## Verification and source changes

Captured execution uses original UTF-8 source bytes. Assignment observations
and public outputs are separate from parsed formulas and cached results.
Instrumentation operates on a copied AST; source hashes and locations describe
the original files. Source columns are UTF-8 byte offsets. New captures use
protocol v2; v1 remains readable without invented public-output evidence.

Formula-only edits can leave generated editor types current while invalidating
numerical reference bindings. Interface edits require regenerating handles.
Review changed formulas, source hashes and reference coverage before explicitly
rebinding a reference; preserve independently established expected numbers.
Never generate those expected numbers from the execution being checked.

Run [verified CLI commands](../apps/cso-cli/README.md) for the selected function
and inputs. Keep numerical consistency, independent agreement, content retention
and page inspection separate. Before delivering a PDF, inspect every page for
missing steps, unreadable notation, clipping and pagination. Account for every
input, unit, formula, explanation, figure and result in the generated document.
