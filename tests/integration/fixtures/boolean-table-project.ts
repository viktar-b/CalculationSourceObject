import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Synthetic public-API project exercising all four table evidence roles. */
export function writeBooleanTableProject(directory: string): void {
  writeFileSync(
    join(directory, 'limit.cso.py'),
    `from typing import Annotated, TypeAlias
from cso_python import applicable, calculation, check, section, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{limit}", description="Width", unit="m")]
@calculation(id="limit", title="Width criterion")
@section(title="Width criterion", root=True)
def limit(width: Width):
    result: Annotated[float, symbol(glyph="r_{limit}", description="Retained width", unit="m")] = width + 0
    check(id="limit", targets=("result",), explanation="Width does not exceed 2 m", predicate=result <= 2)
    applicable(id="domain", targets=("width",), explanation="Width is nonnegative", predicate=width >= 0)
    applicable(id="ceiling", targets=("result",), explanation="Width is below 10 m", predicate=result < 10)
    return {"result": result}
`,
  );
  writeFileSync(
    join(directory, 'case.cso.py'),
    `from typing import Annotated, TypeAlias
from cso_python import boolean, calculation, check, section, symbol
from _cso_bindings.limit import limit
Width: TypeAlias = Annotated[float, symbol(glyph="w_{case}", description="Case width", unit="m")]
@calculation(id="case", title="Case")
@section(title="Case", root=True)
def case(width: Width):
    first = limit(width=width)
    second = limit(width=width)
    result: Annotated[float, symbol(glyph="r_{case}", description="Combined width", unit="m")] = first["result"] + second["result"]
    chosen: Annotated[float, symbol(glyph="s_{case}", description="Selected width", unit="m")] = width if width > 1 else 2
    boolean(id="positive", description="Positive width", predicate=width > 0)
    boolean(id="false-flag", description="False flag", predicate=False)
    boolean(id="true-flag", description="True flag", predicate=True)
    boolean(id="lazy", description="Positive reciprocal", predicate=width == 0 or 1 / width > 0)
    check(id="combined", targets=("result",), explanation="Combined width does not exceed 4 m", predicate=result <= 4)
    return {"result": result, "chosen": chosen}
`,
  );
  for (const axis of ['columns', 'rows']) {
    for (const selection of ['all', 'selected', 'hidden', 'empty', 'mixed']) {
      const cases =
        selection === 'empty'
          ? '{}'
          : '{"Zero": first, "Positive": second, "Negative": third}';
      const booleans =
        selection === 'selected'
          ? ', booleans=("false-flag",)'
          : selection === 'hidden'
            ? ', booleans=()'
            : '';
      const calls =
        selection === 'empty'
          ? ''
          : '    first = case(width=0)\n    second = case(width=3.0)\n    third = case(width=-1)\n';
      writeFileSync(
        join(directory, `${axis}_${selection}.cso.py`),
        `from typing import Annotated
from cso_python import calculation, method, section, symbol, table
from _cso_bindings.case import case
@calculation(id="compare", title="Boolean comparison")
@section(title="Comparison", root=True)
def compare():
    method(id="case", calculation=case, title="Width procedure")
${calls}    table(id="cases", method="case", title="Width comparison", cases=${cases}, cases_axis="${axis}", inputs=${selection === 'mixed' ? '("width",)' : '()'}, outputs=${selection === 'mixed' ? '("result",)' : '()'}${booleans})
    ready: Annotated[int, symbol(glyph="n_{ready}", description="Ready", unit="")] = 0
    return {"ready": ready}
`,
      );
    }
  }
}
