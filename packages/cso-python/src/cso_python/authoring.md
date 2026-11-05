# Calculation authoring

This is the `.cso.py` language contract shipped by `cs-object`. Read the guide
from your installed interpreter with `python -m cso_python authoring`, or save
it with `python -m cso_python authoring --out authoring-contract.md`.
The exported header identifies the installed package version. Export again after
upgrading Python packages. Generated projects do this during `npm run setup`.

Write trusted local calculations in `<name>.cso.py` files. Python 3.11+ captures
source and observations; the matching CSO CLI and core verify formulas and render
reports. Python execution alone does not establish numerical consistency.

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
and raw Python strings for backslash Greek names. The notation parser
is not a LaTeX engine; commands such as `\mathrm` and `\frac` are unsupported.

## Inputs and reusable calculations

### Report components and prose

Calculation reports use eight fixed components. Compose these components rather
than adding a new visual style for an individual calculation.

| Component | Use |
| --- | --- |
| Report header | Calculation title and essential identification |
| Section | Heading and content in authored order |
| Reusable calculation | Named procedure with its own left rule, including nested functions |
| Quantity row | Index, description, variable, value, unit and comment |
| Derivation row | Formula and, where evaluated, its numerical substitution |
| Text note | Engineering assumptions, reasoning, references and qualifications |
| Figure | Authored engineering image with caption and alternative text |
| Table | Compared quantities or external inputs, procedure and outputs |

Use titles a reader can understand without programming knowledge. Prefer
"Calculation procedure" to "method" in report prose. The source declaration
remains `method(...)`. Keep meaningful engineering names and qualified notation.

Each reusable calculation definition, including a nested calculation, has its
own left rule. External-function tables use their grid without a separate rule,
both within reusable definitions and for evaluated calls.
Definition quantity rows retain the value column and display × where no case
value is defined. Each function explains
this briefly: "Reusable function for downstream use. Values are not defined yet."
The explanation also applies when no downstream cases have run. Zero is a value,
and an inapplicable computed number retains its separate qualification.

Write prose for engineering assumptions, derivations, choices and limitations.
Use fixed headings, rows and cells to explain report structure. Omit tautological
sentences such as "The method defines the calculation" or instructions announcing
that inputs and results follow. Keep the brief absent-value explanation with its
reusable function. Use the existing figure component for engineering images.

Use checked HTML for content changes. Check PDF when print layout changes or a
PDF is being delivered. Inspect every delivered page at normal size.

### Reuse a calculation

Generate handles before importing another `.cso.py` function:

```sh
python -m cso_python bindings calculations
python -m cso_python bindings calculations --check
```

The complete [composed report recipe](#author-a-composed-report) below defines
shared metadata, a reusable calculation, a caller and a figure using only local
files. Every call gets its own invocation and places its child section at the
call site. Forwarded quantities retain their identity and metadata. Distinct
results get [qualified notation](#repeated-symbols), even with equal inputs.
Public outputs select what a caller can access; they do not hide documented
intermediate work.

### Explain one method and compare its cases

Declare `method(id=..., calculation=..., title=...)` before the calls it
explains, then `table(...)` after those calls. The method and every case share
one symbolic plan from that source revision. A table does not rerun the
calculation or invent a second reading of the formulas.

Core resolves the method's formulas through each case's parameter and helper-call
bindings and checks their structure against the captured formulas. Changing an
operation, constant or referenced quantity fails verification even when the
numbers happen to agree. This check uses the captured cases; an empty table does
not execute a representative calculation.

`cases` maps a heading to an earlier call result. Each call belongs to one
table. `cases_axis="columns"` is the default and places cases in columns.
`cases_axis="rows"` places cases in rows. Use the same choice in HTML and PDF.
`column_cap` is an optional positive integer that limits how many data columns
share one print part; measured fit still decides the split. Orientation and
the cap do not change cell identity, case order or numerical evidence.

`inputs` and `outputs` select table rows by quantity name. Omit either tuple
to include every parameter or public output. Selection does not remove
formulas, nested calls, text or figures from the method. For a smaller comparison,
extract a reusable calculation with the required scope and call it from both the
comparison and the full calculation. The tapered section example shares its area
and x-axis inertia formulas this way.

A composed method may return a helper's public output directly. Its table cell
keeps that output's captured symbol identity; no copied assignment is required.
Method quantities use the ordinary formula-row layout without case substitutions.
Select all inputs needed to review the cases, including shared dimensions.
Cases in columns usually fit a few cases with many quantities; rows suit many
cases with fewer quantities.

`check(id=..., targets=(...), explanation=..., predicate=...)` records an
engineering criterion. Each case shows Pass or Fail with the explanation while
keeping the calculated number. Nested helper outcomes identify their call path
and remain visible when their quantities are omitted from the table.
Write the explanation as the criterion, since it appears with both outcomes.
`applicable(...)` uses the same arguments to record when a
result may be used. An inapplicable result displays "Not applicable" and the
originating explanation; the computed number stays in the execution.
Inapplicability follows dependencies that the calculation actually used. A
failed check does not make a valid number inapplicable. Python errors still
stop the run.

Captures that contain method or table evidence use protocol version 3 and CSO
schema `1.1.0`. Prepared documents that contain those items use document
version 3. Protocol 2 and prepared document version 2 remain valid when the
source has no method or table. Rebuild a prepared document from the retained
execution with `prepareExecutionDocument`. Do not rebind an older execution to
a new numerical run in order to add a method.

### Boolean values and table outcomes

Use `boolean(...)` for a True/False fact that a table should show. For example,
inside a reusable calculation:

```python
boolean(id="cubic-spring", description="Cubic spring included", predicate=cubic_coefficient > 0)
```

The predicate accepts the supported numeric comparisons with `and`/`or`, or a
literal `True` or `False`. Give the declaration a meaningful description.
This declaration does not create a numerical parameter or public numeric output.
Numeric parameters, outputs and external adapter results retain their existing
`int`/`float` requirements and reject Python booleans.

`table(..., booleans=("cubic-spring",))` selects Boolean declarations by ID from
its reusable calculation. Omit `booleans` to include all of them, or use `()` to
hide optional root Boolean rows. Boolean facts from nested reusable functions
remain visible for each case, along with their complete definitions. Required
checks, applicability and selected rules remain visible regardless of row selection.

Boolean facts require grouped table cases. A Boolean-declaring calculation may
be used as a table case or inside its reusable functions; an ungrouped invocation
fails before execution with `BOOLEAN_REQUIRES_TABLE`. Static procedures and empty
comparisons remain supported. This prevents silently discarding report facts.

| Table cell | Meaning and display |
| --- | --- |
| Number | Recorded number with its declared unit; retain it beside any qualification |
| Undefined reusable value | × with the brief reason in that function's scope |
| Boolean | True or False, without implying acceptance |
| Engineering check | Pass or Fail against the authored criterion; Not applicable when qualified |
| Applicability | Applicable or Not applicable, with its condition and originating reason |
| Selected rule | The chosen expression and the condition's recorded True/False outcome |

Use readable case headings, indexed quantity labels, qualified variables and
units. Keep descriptions and predicates together. Wrap prose at normal report
size; keep each formula legible. Align numeric cells by value and outcome cells
consistently. Use explicit status words so meaning survives grayscale printing.
Every cell remains bound to its case and call, including repeated helper calls.
Both table orientations retain these roles and repeat identifying headings in
printed continuations. No cases means "No cases evaluated", not a successful
verdict.

Boolean declarations use execution protocol 5, CSO schema `1.3.0` and prepared
document version 5. Update Python, core, React and CLI together before using this
feature. Older captures retain their existing versions and meaning. A consumer
that supports only protocol 4 rejects Boolean captures before numerical execution.
Math-only CSO export rejects Boolean report evidence rather than dropping it.

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
kind evidence retain the conservative integer-valued range limit.
Input-kind evidence accompanies resolved input values in captures and their
reference, document and report bindings. Older safe-input references remain
valid; large floating-point reference inputs require explicit kind evidence.
Execution preserves values without coercion
and rejects booleans. Use `float` when a formula can produce a fractional value,
including Python division.

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

`_cso_bindings/` is generated output. Never edit
it. Generate after a fresh checkout and after interface changes. These include
parameter names, numeric declarations, defaults, quantity metadata and which
quantity a public output selects. Formula-only edits can leave bindings current.
Generation is explicit; importing a missing or stale handle does not refresh it.


Build and CI consumers must generate bindings before importing calculations;
`--check` alone cannot bootstrap a fresh checkout. A distributable calculation
bundle needs its `.cso.py` sources, local dependencies and matching bindings, or
a documented generation step using the intended `cs-object` version. Ignoring
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


## Supported source and document content

### External functions

Declare an ordinary single-file Python adapter in a local metadata module with
`external_function(path=..., function=..., inputs=..., outputs=...,
description=..., defaults=...)`. Inputs map Python parameter names and outputs
map nonempty public string keys to shared numeric metadata aliases. Defaults are
optional finite numeric literals. The method
description must be nonempty. Adapter paths resolve relative to the declaration
module and remain within the calculation project.

For example, a declaration named `square` in `methods.py` generates
`from _cso_bindings._external.methods import square`. Generate bindings with the
existing bindings command, then use it inside an annotated calculation:

```python
first = square(length=length)
doubled: DoubledArea = 2.0 * first["area"]
```

The adapter returns a native Python number for one declared output, or a plain
dictionary containing exactly every declared output. Booleans, library scalar
objects, containers, nonfinite values and unsafe integers fail. Adapters convert
library-specific objects and raise on numerical failure or nonconvergence.

Each authored call executes once. Selecting several outputs shares that call;
equal-input calls remain separate. Adapter state is shared within a run and
starts fresh for the next run. CSO executes captured adapter bytes and records
their identity, actual inputs, all outputs, warnings and bounded environment
provenance. Static description and binding generation do not import adapters.
Project-local imports inside an adapter are unsupported; install a dependency
as a package or keep the implementation in one file.

Generated external handles require an active top-level CSO execution. Ordinary
Python can call a generated calculation containing external calls. Calling an
external handle alone raises a context error. Changes to the declaration require
regenerating bindings; adapter-only edits require a fresh capture.

The report preserves the complete input/method/output block, including
unused outputs. External-result consistency and formula checks have separate
counts. The external algorithm is excluded from formula verification. Preserve
full execution evidence or prepared HTML/PDF; standalone CSO and math-only exports
reject external calculations before dropping evidence.

An annotated wrapper containing external calls can be used by `method` and
`table`. The shared method explains the opaque boundary without importing or
running the adapter, including when there are zero cases. Grouped cases retain
their complete external blocks with case/call labels, even when table rows omit
some results. Every supplied quantity contributes applicability dependencies to
every external output; downstream formulas continue to follow their used branch.
Failed engineering checks retain their numbers and outcomes. Numerical failures
stop execution.

Scoped independent reference cases can check selected external outputs. Their
identity includes source, declarations, adapters, resolved inputs and environment,
without run IDs or returned answers. Uncovered diagnostics remain visible and
pending. Retain the independent basis and the full execution binding with each case.

### Formulas and document content

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

Leading `assert comparison, "Actionable input requirement"` statements enforce
input preconditions before calculation content. Predicates use the numeric
comparison rules below and may reference only parameters. Messages must be
nonempty string literals. Failed assertions stop execution with
`INPUT_PRECONDITION_FAILED`, including under Python optimization. Reports retain
the requirement and condition as text. These input guards are separate from
engineering checks and independently verified numerical formulas.

Conditional expressions
`value_if_true if comparison else value_if_false` support numeric
comparisons `<`, `<=`, `>`, `>=`, `==`, and `!=`, including nested conditionals.
Join comparisons with `and` / `or`, or use comparison chains such as
`lower < quantity <= upper`. Evaluation proceeds left to right and stops when
the result is decided; a chain evaluates its shared numeric operand once.
Only the selected conditional branch is evaluated.

`and` / `or` are supported only between comparisons in conditional tests.
Numeric selection expressions such as `quantity or fallback`, mixed numeric and
comparison operands, Boolean numerical quantities and bare numeric conditional
tests are rejected. Use the separate `boolean(...)` report declaration for table facts. Core checks every Value tree node, including
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
imports, decorators, defaults, statements and formulas before execution. Run the installed planner and verifier to detect unsupported syntax. This is trusted local authoring, not a Python sandbox.

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

Use meaningful call names and explain the
resulting abbreviations instead of widening the PDF column.

## Verification and source changes

Captured execution uses original UTF-8 source bytes. Assignment observations
and public outputs are separate from parsed formulas and cached results.
Instrumentation operates on a copied AST; source hashes and locations describe
the original files. Source columns are UTF-8 byte offsets. Captures without a method or table use protocol v2. Captures that record a
method or table use protocol v3. Protocol v1 remains readable without invented
public-output evidence.

Formula-only edits can leave generated editor types current while invalidating
numerical reference bindings. Interface edits require regenerating handles.
Review changed formulas, source hashes and reference coverage before explicitly
rebinding a reference; preserve independently established expected numbers.
Never generate those expected numbers from the execution being checked.

Run `cso verify`, `cso html --check-layout` or `cso pdf` for the selected
function and inputs. Use `--function <name>` and repeat `--input name=value`.
Select the installed interpreter through `PYTHON`. Use `--help` for command options. Keep numerical consistency, independent agreement, content retention
and page inspection separate. Before delivering a PDF, inspect every page for
missing steps, unreadable notation, clipping and pagination. Account for every
input, unit, formula, explanation, figure and result in the generated document.


## Author a composed report

From a fresh project root, create these UTF-8 files with LF line endings.
`calculations/quantities.py` defines shared metadata:

```python
from typing import Annotated, TypeAlias
from cso_python import symbol

Length: TypeAlias = Annotated[float, symbol(glyph="l_{edge}", description="Edge length", unit="m")]
Width: TypeAlias = Annotated[float, symbol(glyph="w_{rect}", description="Rectangle width", unit="m")]
Area: TypeAlias = Annotated[float, symbol(glyph="A_{rect}", description="Rectangle area", unit="m^2")]
```

`calculations/geometry.cso.py` defines a reusable rectangle:

```python
from cso_python import calculation, section
from quantities import Length, Width, Area

@calculation(id="rectangle", title="Rectangle area")
@section(title="Rectangle procedure", root=True)
def rectangle(length: Length, width: Width):
    area: Area = length * width
    return {"area": area}
```

Generate bindings with `python -m cso_python bindings calculations`, then write
`calculations/composed.cso.py`:

```python
from typing import Annotated
from cso_python import calculation, section, symbol, text, figure
from quantities import Length, Width
from _cso_bindings.geometry import rectangle

@calculation(id="pair", title="Two equal rectangles")
@section(title="Combined area", root=True)
def calculate(length: Length = 3.0, width: Width = 2.0):
    text(id="scope", content="Two equal perpendicular rectangles. edge means edge length, rect means rectangle, and pair means both rectangles.")
    figure(id="pair-sketch", path="assets/pair.svg", media_type="image/svg+xml", caption="Rectangle dimensions", alt="Rectangle labelled l_edge and w_rect")
    single = rectangle(length=length, width=width)
    total_area: Annotated[float, symbol(glyph="A_{pair}", description="Combined area", unit="m^2")] = 2.0 * single["area"]
    return {"total_area": total_area}
```

`calculations/assets/pair.svg` supplies the figure. Use qualified variables in
labels, with the same meanings as the report:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect x="70" y="40" width="180" height="100" fill="none" stroke="black"/>
  <text x="130" y="165">l_edge</text><text x="10" y="95">w_rect</text>
</svg>
```

Generate bindings again after adding the parent. Run from the project root using
its installed Python and CLI, for example in a POSIX shell:

```sh
./.venv/bin/python -m cso_python bindings calculations
PYTHON="$PWD/.venv/bin/python" npx --no-install cso verify calculations/composed.cso.py --function calculate --format json
PYTHON="$PWD/.venv/bin/python" npx --no-install cso html calculations/composed.cso.py --function calculate --out output/composed.html --check-layout --format json
```

Create `output/` first. In PowerShell use `& $env:PYTHON` with the project's
`.venv\Scripts\python.exe`, and `& .\node_modules\.bin\cso.cmd` for the CLI.
The elementary independent basis is 3 m times 2 m equals 6 m² per rectangle;
two rectangles have 12 m² total. Compare both the intermediate and total.
These numbers alone are not a bound reference case. The generated project's
reference recipe explains how to bind independently established expectations.
For browser use, register this source and `calculate` function in `reports.json`.
