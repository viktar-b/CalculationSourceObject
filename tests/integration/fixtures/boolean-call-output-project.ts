import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeBooleanCallOutputProject(directory: string): void {
  writeFileSync(
    join(directory, 'scalar.cso.py'),
    `from typing import Annotated, TypeAlias
from cso_python import applicable, calculation, section, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{scalar}", description="Width", unit="m")]
@calculation(id="scalar", title="Scalar")
@section(title="Scalar", root=True)
def scalar(width: Width):
    result: Annotated[float, symbol(glyph="r_{scalar}", description="Retained width", unit="m")] = width + 0
    applicable(id="domain", targets=("result",), explanation="Child width must be nonnegative", predicate=result >= 0)
    return {"result": result}
`,
  );
  writeFileSync(
    join(directory, 'external_methods.py'),
    `from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{external}", description="Width", unit="m")]
scalar = external_function(path="adapter.py", function="scalar", inputs={"width": Width}, outputs={"result": Width}, description="Retain the supplied width.")
`,
  );
  writeFileSync(
    join(directory, 'adapter.py'),
    'def scalar(*, width):\n    return width\n',
  );
  const wrapper = `from typing import Annotated, TypeAlias
from cso_python import applicable, boolean, calculation, check, section, symbol
from _cso_bindings.scalar import scalar
Width: TypeAlias = Annotated[float, symbol(glyph="w_{wrapper}", description="Width", unit="m")]
@calculation(id="wrapper", title="Wrapper")
@section(title="Wrapper", root=True)
def wrapper(width: Width):
    child = scalar(width=width)
    boolean(id="direct", description="Child result is positive", predicate=child["result"] > 0)
    boolean(id="lazy", description="Positive child reciprocal", predicate=width <= 0 or 1 / child["result"] > 0)
    boolean(id="conditional", description="Selected child result is positive", predicate=(child["result"] if width >= 0 else 1) > 0)
    check(id="direct", targets=("width",), explanation="Child result is nonnegative", predicate=child["result"] >= 0)
    check(id="lazy", targets=("width",), explanation="Child reciprocal or nonpositive width", predicate=width <= 0 or 1 / child["result"] > 0)
    applicable(id="direct", targets=("width",), explanation="Child result exceeds minus ten", predicate=child["result"] > -10)
    return {"result": child["result"]}
`;
  writeFileSync(join(directory, 'wrapper.cso.py'), wrapper);
  writeFileSync(
    join(directory, 'external_wrapper.cso.py'),
    wrapper
      .replace(
        'from _cso_bindings.scalar import scalar',
        'from _cso_bindings._external.external_methods import scalar',
      )
      .replace('def wrapper(', 'def external_wrapper('),
  );
  writeFileSync(
    join(directory, 'nested.cso.py'),
    `from typing import Annotated, TypeAlias
from cso_python import boolean, calculation, section, symbol
from _cso_bindings.wrapper import wrapper
Width: TypeAlias = Annotated[float, symbol(glyph="w_{nested}", description="Width", unit="m")]
@calculation(id="nested", title="Nested")
@section(title="Nested", root=True)
def nested(width: Width):
    wrapped = wrapper(width=width)
    boolean(id="forwarded", description="Forwarded result is positive", predicate=wrapped["result"] > 0)
    return {"result": wrapped["result"]}
`,
  );
  for (const calculation of ['wrapper', 'nested', 'external_wrapper']) {
    for (const axis of ['columns', 'rows', 'untaken']) {
      writeFileSync(
        join(directory, `compare_${calculation}_${axis}.cso.py`),
        `from cso_python import calculation, method, section, table
from _cso_bindings.${calculation} import ${calculation}
@calculation(id="compare", title="Compare")
@section(title="Compare", root=True)
def compare():
    method(id="procedure", calculation=${calculation}, title="Procedure")
    negative = ${calculation}(width=-1)
${
  axis === 'untaken'
    ? ''
    : `    zero = ${calculation}(width=0)
    positive = ${calculation}(width=2)
`
}    table(id="cases", method="procedure", title="Cases", cases=${axis === 'untaken' ? '{"Negative": negative}' : '{"Negative": negative, "Zero": zero, "Positive": positive}'}, cases_axis="${axis === 'untaken' ? 'columns' : axis}")
    return {"result": ${axis === 'untaken' ? 'negative' : 'positive'}["result"]}
`,
      );
    }
  }
}
