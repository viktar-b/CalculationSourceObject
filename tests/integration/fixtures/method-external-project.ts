import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const externalMethods = `from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Length: TypeAlias = Annotated[float, symbol(glyph="L_{in}", description="Supplied length", unit="m")]
Area: TypeAlias = Annotated[float, symbol(glyph="A_{ext}", description="External area", unit="m^2")]
Count: TypeAlias = Annotated[int, symbol(glyph="n_{diag}", description="Unused diagnostic count", unit="", comment="Keep this diagnostic even when the comparison omits it.")]
square = external_function(path="external_adapter.py", function="square", inputs={"length": Length}, outputs={"area": Area, "count": Count}, description="""Square the supplied length.

Return the diagnostic call count as a separate output.""")
`;
const externalCase = `from typing import Annotated
from cso_python import applicable, calculation, check, section, symbol, text
from external_methods import Length
from _cso_bindings._external.external_methods import square
@calculation(id="external-case", title="External case")
@section(title="External case", root=True)
def external_case(length: Length):
    limited: Annotated[float, symbol(glyph="L_{lim}", description="Qualified length", unit="m")] = length
    applicable(id="positive", targets=("limited",), explanation="Length must be positive.", predicate=length > 0)
    text(id="before-call", content="Use the qualified length at the external boundary.")
    searched = square(length=limited)
    doubled: Annotated[float, symbol(glyph="D_{out}", description="Double area", unit="m^2")] = searched["area"] * 2.0
    selected: Annotated[float, symbol(glyph="S_{out}", description="Branch-selected area", unit="m^2")] = searched["area"] if length > 0 else 42.0
    check(id="small", targets=("doubled",), explanation="Double area must be below one square metre.", predicate=doubled < 1)
    return {"doubled": doubled, "selected": selected}
`;
const externalOuter = `from cso_python import calculation, section
from external_methods import Length
from _cso_bindings.external_case import external_case
@calculation(id="outer", title="Composed external case")
@section(title="Composed external case", root=True)
def outer(length: Length):
    inner_case = external_case(length=length)
    return {"doubled": inner_case["doubled"], "selected": inner_case["selected"]}
`;
const externalAdapter = `calls = 0
def square(*, length):
    global calls
    calls += 1
    return {"area": length * length, "count": calls}
`;
const externalCompare = (
  axis: 'columns' | 'rows',
  empty = false,
  firstLength = 3,
  target = 'external_case',
) => `from typing import Annotated
from cso_python import calculation, section, method, symbol, table
from _cso_bindings.${target} import ${target}
@calculation(id="compare", title="External comparison")
@section(title="External comparison", root=True)
def compare():
    method(id="external-method", calculation=${target}, title="How the external calculation is used")
${empty ? '' : `    first_case = ${target}(length=${firstLength}.0)\n    second_case = ${target}(length=3.0)\n`}    table(id="external-table", method="external-method", title="Selected external results", cases=${empty ? '{}' : '{"First": first_case, "Second": second_case}'}, inputs=(), outputs=("selected",), cases_axis="${axis}")
    ready: Annotated[int, symbol(glyph="r_{ok}", description="Ready", unit="")] = 1
    return {"ready": ready}
`;
export function writeExternalMethodProject(
  directory: string,
  axis: 'columns' | 'rows',
  empty = false,
  firstLength = 3,
  target = 'external_case',
) {
  writeFileSync(join(directory, 'external_methods.py'), externalMethods);
  writeFileSync(join(directory, 'external_adapter.py'), externalAdapter);
  writeFileSync(join(directory, 'external_case.cso.py'), externalCase);
  writeFileSync(join(directory, 'outer.cso.py'), externalOuter);
  writeFileSync(
    join(directory, 'external_compare.cso.py'),
    externalCompare(axis, empty, firstLength, target),
  );
}
