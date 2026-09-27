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
new calculations. When reproducing an identified external calculation, preserve its
reference glyphs and record the reference URL in calculation metadata. Standard units such as `m` and `kg` remain unchanged.

Keep qualifiers compact and explain them in the document. `rect`, `fp` and `sp`
can mean rectangle, first panel and second panel. Inspect glyphs at normal PDF
page size within the existing symbol column. Use braced subscripts/superscripts
and raw Python strings for backslash Greek names. The [notation parser](rendering.md#notation)
is not a LaTeX engine; commands such as `\mathrm` and `\frac` are unsupported.

## Inputs and reusable calculations

### Reuse a calculation

Start with the [two-panel walkthrough](../examples/two-panel/README.md).
Its `geometry.cso.py` defines `rectangle(width, height)` and returns named
`area` and `perimeter` outputs. `quantities.py` supplies shared input metadata.
Generate the directory's bindings before importing the calculation:

```sh
python -m cso_python bindings examples/two-panel
```

The generator creates `_cso_bindings/geometry.py` and `geometry.pyi`. A caller
in that example directory imports the handle and supplies keyword arguments:

```python
from _cso_bindings.geometry import rectangle

# Inside an annotated parent calculation:
first_panel = rectangle(width=width, height=first_panel_height)
second_panel = rectangle(width=width, height=second_panel_height)
total_area: TotalPanelArea = first_panel["area"] + second_panel["area"]
```

`TotalPanelArea` is the shared metadata alias used by the canonical
[parent](../examples/two-panel/estimate.cso.py). That parent forwards the total
to a material calculation and returns area, volume and mass. Both rectangle
perimeters still appear in the document: public outputs select what a caller
can access; they do not hide documented intermediate work.

Every call gets its own invocation and places its child section at the call
site. Forwarded quantities retain their identity and metadata. Distinct results
get [qualified notation](#repeated-symbols), even when calls receive equal values.
See the [section-property comparisons](../examples/section-properties/README.md#reuse-in-a-comparison)
for the same workflow with larger calculations.

### Parameters and public outputs

Keep reusable metadata in shared `Annotated` / `TypeAlias` declarations.
Each selected function has `@calculation`, `@section`, numeric parameters and a
final public-output dictionary. Parameters accept `float`, `int` or metadata
aliases, with finite literal defaults. Standalone inputs, including unused
parameters and defaults, need signature metadata or a legacy annotated
`given(parameter)` row. Combining both for one parameter is ambiguous.

Numeric declarations are runtime promises. An `int` parameter, documented
assignment or public output must contain a Python `int`; floats such as `1.0`
are rejected. A `float` declaration accepts Python `int` and `float` values
within the supported numeric range: exact integers fit ±(2**53 - 1), while
Python floats may use the full finite binary64 range. Execution records actual
`numericKind` separately from the declared annotation. Older captures without
kind evidence retain the conservative integer-valued range limit. See
[the numeric evidence decision](adr/0005-python-numeric-kind-evidence.md).
Input-kind evidence accompanies resolved input values in captures and their
reference, document and report bindings. Older safe-input references remain
valid; large floating-point reference inputs require explicit kind evidence.
Execution preserves values without coercion
and rejects booleans. Use `float` when a formula can produce a fractional value,
including Python division. See [the decision](adr/0003-runtime-numeric-declarations.md).

During composition, a documented caller quantity keeps its identity, glyph,
description and unit. Forward it without repeating an input declaration.
Declared callee units must match exactly; conversions belong in explicit
annotated calculations. Equal numeric values do not make two quantities identical.
Standalone values, supplied literals and defaults create input rows.

### Binding generation and project layout

Generate handles with `python -m cso_python bindings <directory>` or
`cso bindings <directory>`. Use `--check` to detect missing/stale bindings without
writing files. Generated `_cso_bindings` modules provide named arguments and
typed public result keys. Generate bindings in a temporary consumer when tests
mutate sources. Dynamic Python callers can use `load_calculation` directly.

Choose the generation root that contains the parent calculation and all its
dependencies. Every source path below that root must use Python identifiers:
use `hot_formed_i_sections/calculate.cso.py`, not hyphenated directory names.
Imports mirror those relative paths, for example
`from _cso_bindings.hot_formed_i_sections.calculate import calculate`.
For ordinary Python imports, run the consumer from that root or put the root
on its import path. The generation root's own directory name need not be a
Python identifier.

`_cso_bindings/` is generated, Git-ignored output in this repository. Never edit
it. Generate after a fresh checkout and after interface changes. These include
parameter names, numeric declarations, defaults, quantity metadata and which
quantity a public output selects. Formula-only edits can leave bindings current.
Generation is explicit; importing a missing or stale handle does not refresh it.
The [setup guide](development.md#setup) generates the maintained examples.

Build and CI consumers must generate bindings before importing calculations;
`--check` alone cannot bootstrap a fresh checkout. A distributable calculation
bundle needs its `.cso.py` sources, local dependencies and matching bindings, or
a documented generation step using the intended `cso-python` version. Ignoring
bindings in Git does not make their runtime files optional at execution time.

Generation validates calculation definitions before writing generated files.
Parameters, defaults and public output selections follow the same static rules
in generation and execution planning. Successful generation establishes valid
public declarations; formula support, document content and requirements that
depend on a particular invocation are checked during planning. Generation does
not run authored calculations.

Use `python -m cso_python describe <file.cso.py> --function <name>` to read
the same static interface as a versioned JSON definition. It includes input
names, numeric declarations, defaults, glyphs, descriptions, units and selected
public outputs. It captures source identity but does not execute formulas or
establish numerical verification. Core's `CalculationDefinitionResponseSchema`
validates this handoff for consumers that build forms and input validators.

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
`+`, `-`, `*`, `/`, `**`, `sqrt` / `math.sqrt`, `math.pi` (or imported `pi`),
`ceil` / `math.ceil`, `floor` / `math.floor`, `exp` / `math.exp`,
`log` / `math.log`, and the built-in `abs`.
`log(value)` is the natural logarithm; `log(value, base)` accepts a positive base
other than one. Values must be positive. `exp` rejects non-finite results.

`abs(value)` preserves the input's actual numeric kind and changes negative zero
to positive zero. `floor(value)` returns the greatest integer less than or equal
to the value. Both functions accept one argument. Results remain subject to the
finite-float and safe-int contracts.

`min` and `max` take two or more positional numeric arguments. They retain the
first selected operand on ties, including its actual numeric kind and signed zero.
All arguments evaluate in source order and must satisfy the finite-number and
numeric-range rules, including operands that are not selected. Iterable, keyword
and starred argument forms are not supported.

`round(value)` uses ties to even and returns an integer. `round(value, digits)`
requires integer `digits`, supports positive and negative digit counts, and
preserves the input's actual numeric kind. Floating-point rounding operates on
the represented binary64 value, so `round(2.675, 2)` is `2.67`. A float rounded
to zero retains its sign. Results remain subject to the finite-float and safe-int
contracts. See [Python's round semantics](https://docs.python.org/3/library/functions.html#round).

`noop` and `stub` are FormulaSheet grouping and placeholder nodes used by
rendering and Python export. They are not Python authoring functions and are
outside numerical verification, including when they contain a numeric operand.

Trigonometry supports `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`,
`tanh`, `radians` and `degrees`. Use `math.<name>(value)` after `import math`, or
`<name>(value)` after `from math import <name>`. Each takes one positional numeric
argument and returns a float, including when the input is an integer.
Direct trig functions take radians; inverse trig functions return radians.
`asin` and `acos` require an input in [-1, 1]. Hyperbolic functions take a
dimensionless argument. `radians` converts degrees to radians; `degrees` does
the reverse. Declare units explicitly; function calls do not infer or check
units from symbol metadata. For example, `math.sin(math.radians(angle_degrees))`
accepts an angle expressed in degrees. Non-finite inputs and results are rejected.
Floating-point `tan(math.pi / 2)` follows Python's finite approximation rather
than treating the input as the exact mathematical pole. See
[Python's math semantics](https://docs.python.org/3/library/math.html#trigonometric-functions).

Both `atan2(y, x)` and `math.atan2(y, x)` take two positional numeric arguments
and return a float angle in radians with Python's quadrant and signed-zero
behavior. Both `hypot()` and `math.hypot()` accept any number of positional
numeric coordinates and return their Euclidean norm as a float. The empty call
returns `0.0`.
Iterable and keyword forms are not supported. Non-finite results are rejected.

Conditional expressions
`value_if_true if comparison else value_if_false` support numeric
comparisons `<`, `<=`, `>`, `>=`, `==`, and `!=`, including nested conditionals.
Join comparisons with `and` / `or`, or use comparison chains such as
`lower < quantity <= upper`. Evaluation proceeds left to right and stops when
the result is decided; a chain evaluates its shared numeric operand once.
Only the selected conditional branch is evaluated.

`and` / `or` are supported only between comparisons in conditional tests.
Numeric selection expressions such as `quantity or fallback`, mixed numeric and
comparison operands, Boolean quantities and bare numeric conditional tests are
rejected. Core checks every Value tree node, including
dormant and disconnected nodes, for supported operations, operand roles,
numeric literals, references and cycles before evaluation.
Every captured literal must satisfy the numeric kind and range contract, even
in a dormant branch. Lazy evaluation skips arithmetic such as an unselected
division by zero; it does not permit invalid captured data.
Comparisons cannot be returned as numeric quantities. Legacy `given`, `calculation_call` and
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

For a reference that deliberately reuses notation in distinct contexts, declare
`symbol(..., notation_scope="x-axis")` and `notation_scope="y-axis"`. This preserves
the authored glyph and records the context as `notationScope` in CSO and sheet
symbols. Explain each scope in descriptions or section titles. Duplicate glyphs
within the same scope still fail; an unscoped symbol belongs to the default scope.

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

Run [verified CLI commands](../packages/cso-cli/README.md) for the selected function
and inputs. Keep numerical consistency, independent agreement, content retention
and page inspection separate. Before delivering a PDF, inspect every page for
missing steps, unreadable notation, clipping and pagination. Account for every
input, unit, formula, explanation, figure and result in the generated document.
