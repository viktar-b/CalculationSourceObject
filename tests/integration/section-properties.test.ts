import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ExecutionResponseSchema,
  createSheetFromCalculationSourceObject,
  verifyExecution,
} from '@cs-object/core';
import { afterEach, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function capture(path: string, inputs = {}) {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      execFileSync(
        process.env.PYTHON ?? 'python3',
        [
          '-I',
          '-m',
          'cso_python',
          'execute',
          path,
          '--function',
          'calculate',
          '--inputs-json',
          JSON.stringify(inputs),
        ],
        { encoding: 'utf8' },
      ),
    ),
  );
  if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
  return response.execution;
}
function symbols(execution: ReturnType<typeof capture>) {
  return execution.cso.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol' ? [item.symbol] : [],
    ),
  );
}

it.each([
  ['hot-formed-I-sections', 8, 38, 'X', 18.11502650020568],
  ['unequal-tapered-i-beam', 9, 90, 'Z_x', 38690.717308022955],
])(
  'verifies every quantity in the %s reference transcription',
  (slug, inputs, formulas, localId, expected) => {
    const execution = capture(
      new URL(
        `../../examples/section-properties/${slug}/calculate.cso.py`,
        import.meta.url,
      ).pathname,
    );
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(
      execution.observations.filter((o) => o.kind === 'input'),
    ).toHaveLength(inputs);
    expect(
      execution.observations.filter((o) => o.kind === 'formula'),
    ).toHaveLength(formulas);
    expect(execution.authoring?.outputs).toHaveLength(formulas);
    const observation = execution.observations.find(
      (o) => JSON.parse(o.symbolId)[2] === localId,
    );
    expect(observation?.value).toBeCloseTo(expected, 8);
    expect(
      createSheetFromCalculationSourceObject(execution.cso, {
        id: 'reference',
        label: 'Reference',
      }).sheet.symbols,
    ).toHaveLength(inputs + formulas);
    expect(report.checks.independentReferenceAgreement.status).toBe(
      'not_applicable',
    );
  },
);

it('preserves the tapered reference’s two Z_web quantities with axis scopes', () => {
  const execution = capture(
    new URL(
      '../../examples/section-properties/unequal-tapered-i-beam/calculate.cso.py',
      import.meta.url,
    ).pathname,
  );
  const sheet = createSheetFromCalculationSourceObject(execution.cso, {
    id: 'reference',
    label: 'Reference',
  }).sheet;
  const webTerms = sheet.symbols.filter((s) => s.glyph === 'Z_{web}');
  expect(webTerms.map((s) => s.notationScope)).toEqual(['x-axis', 'y-axis']);
  webTerms[1].notationScope = 'x-axis';
  const authored = symbols(execution).filter((s) => s.glyph === 'Z_{web}');
  authored[1].notationScope = 'x-axis';
  expect(
    verifyExecution({ execution }).diagnostics.some(
      (d) => d.code === 'DUPLICATE_GLYPH',
    ),
  ).toBe(true);
});

function conditionalSource(comparison: string) {
  const directory = mkdtempSync(join(tmpdir(), 'cso-conditional-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'conditional.cso.py');
  writeFileSync(
    path,
    `import math\nfrom typing import Annotated\nfrom cso_python import calculation, section, symbol\n@calculation(id="conditional", title="Conditional")\n@section(id="main", title="Main", root=True)\ndef calculate(discriminant: Annotated[float, symbol(glyph="D", description="Discriminant", unit="")] = -4.0):\n    root: Annotated[float, symbol(glyph="R", description="Root", unit="")] = math.sqrt(discriminant) if discriminant ${comparison} 0 else (-1 if discriminant < 0 else 0)\n    return {"root": root}\n`,
  );
  return path;
}
it.each(['>', '>='])(
  'evaluates nested %s conditionals lazily in both directions',
  (comparison) => {
    const path = conditionalSource(comparison);
    for (const [discriminant, expected] of [
      [-4, -1],
      [0, 0],
      [4, 2],
    ]) {
      const execution = capture(path, { discriminant });
      const report = verifyExecution({ execution });
      expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
      expect(execution.authoring?.outputs[0].value).toBe(expected);
    }
  },
);

it('checks dormant branch structure without evaluating its invalid square root', () => {
  for (const change of ['unsupported', 'cycle']) {
    const execution = capture(conditionalSource('>'));
    const root = symbols(execution).find((s) => s.description === 'Root');
    if (!root) throw new Error('Missing root');
    const squareRoot = root.valueTree.nodes.find(
      (n) => n.funcSpec?.id === 'fg.sqrt',
    );
    if (!squareRoot) throw new Error('Missing guarded sqrt');
    if (change === 'unsupported') squareRoot.funcSpec = { id: 'fg.log' };
    else squareRoot.funcArgs = [{ key: root.valueTree.rootKey }];
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some(
        (d) =>
          d.code ===
          (change === 'cycle' ? 'FORMULA_CYCLE' : 'UNSUPPORTED_FUNCTION'),
      ),
    ).toBe(true);
  }
});

it('verifies the torsional index with documented large float products', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cso-torsion-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'torsion.cso.py');
  writeFileSync(
    path,
    `import math\nfrom typing import Annotated\nfrom cso_python import calculation, section, symbol\n@calculation(id="torsion", title="Torsional index")\n@section(id="main", title="Main", root=True)\ndef calculate():\n    numerator: Annotated[float, symbol(glyph="N", description="Numerator", unit="")] = math.pi ** 2 * 210000 * 74372.56661176919 * 82245693793741.34\n    denominator: Annotated[float, symbol(glyph="D", description="Denominator", unit="")] = 20 * 80769.23076923077 * 71538737.67695615 * 334310344.8301791\n    index: Annotated[float, symbol(glyph="X", description="Torsional index", unit="")] = math.sqrt(numerator / denominator)\n    return {"numerator": numerator, "denominator": denominator, "index": index}\n`,
  );
  const execution = capture(path);
  expect(execution.observations.map((o) => o.numericKind)).toEqual([
    'float',
    'float',
    'float',
  ]);
  expect(execution.observations[0].value).toBe(1.2677831577428895e25);
  expect(execution.observations[1].value).toBe(3.863376471472904e22);
  expect(execution.observations[2].value).toBeCloseTo(18.11502650020568, 12);
  const report = verifyExecution({ execution });
  expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
  execution.observations[0].value *= 1.1;
  expect(verifyExecution({ execution }).checks.formulaConsistency.status).toBe(
    'failed',
  );
});
