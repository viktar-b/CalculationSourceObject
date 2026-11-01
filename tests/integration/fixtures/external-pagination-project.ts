import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeExternalPaginationProject(directory: string) {
  const paragraphs = Array.from(
    { length: 18 },
    (_, index) =>
      `Method paragraph ${String(index + 1).padStart(2, '0')}. The adapter evaluates the supplied dimensions and returns every declared diagnostic. This paragraph records an independent step so that its complete explanation remains readable when the external call crosses a printed page.`,
  );
  const outputs = Array.from({ length: 28 }, (_, index) => ({
    name:
      index === 27
        ? 'diagnostic\n"quoted" [28]'
        : `area_${String(index + 1).padStart(2, '0')}`,
    description: `Diagnostic area ${String(index + 1).padStart(2, '0')}`,
    comment: `Retain unused diagnostic ${String(index + 1).padStart(2, '0')} with its captured value.`,
    value: 6 + index,
  }));
  const callsPath = join(directory, 'adapter-calls.txt');
  writeFileSync(
    join(directory, 'methods.py'),
    `from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Length: TypeAlias = Annotated[float, symbol(glyph="L_{ext}", description="Supplied length", unit="m", comment="Length supplied to the external adapter.")]
Width: TypeAlias = Annotated[float, symbol(glyph="w_{ext}", description="Supplied width", unit="m", comment="Width supplied to the external adapter.")]
${outputs.map((output, index) => `Area${index}: TypeAlias = Annotated[float, symbol(glyph="A_{${index + 1}}", description=${JSON.stringify(output.description)}, unit="m^2", comment=${JSON.stringify(output.comment)})]`).join('\n')}
evaluate = external_function(path="adapter.py", function="evaluate", inputs={"length": Length, "width": Width}, outputs={${outputs.map((output, index) => `${JSON.stringify(output.name)}: Area${index}`).join(', ')}}, description="""${paragraphs.join('\n\n')}""")
`,
  );
  writeFileSync(
    join(directory, 'adapter.py'),
    `def evaluate(*, length, width):
    with open(${JSON.stringify(callsPath)}, "a") as log:
        log.write("called\\n")
    return {${outputs.map((output, index) => `${JSON.stringify(output.name)}: length * width + ${index}.0`).join(', ')}}
`,
  );
  writeFileSync(
    join(directory, 'calculate.cso.py'),
    `from typing import Annotated
from cso_python import calculation, section, symbol
from _cso_bindings._external.methods import evaluate
@calculation(id="pagination", title="External pagination acceptance")
@section(title="External pagination acceptance", root=True)
def calculate():
    evaluated = evaluate(length=3.0, width=2.0)
    doubled: Annotated[float, symbol(glyph="D_{ext}", description="Double first diagnostic area", unit="m^2")] = evaluated["area_01"] * 2.0
    return {"doubled": doubled}
`,
  );
  return { paragraphs, outputs, callsPath };
}
