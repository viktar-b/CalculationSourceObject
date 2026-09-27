import { prepareExecutionDocument } from '@cs-object/react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ExecutionResponseSchema,
  PreparedDocumentSchema,
  SheetDocumentSchema,
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
  ['hot_formed_i_sections', 8, 38, 'X', 18.11502650020568],
  ['unequal_tapered_i_beam', 9, 91, 'Z_x', 38690.717308022955],
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
      '../../examples/section-properties/unequal_tapered_i_beam/calculate.cso.py',
      import.meta.url,
    ).pathname,
  );
  const sheet = createSheetFromCalculationSourceObject(execution.cso, {
    id: 'reference',
    label: 'Reference',
  }).sheet;
  const webTerms = sheet.symbols.filter((s) => s.glyph === 'Z_{web}');
  expect(webTerms.map((s) => s.notationScope)).toEqual(['x-axis', 'y-axis']);
  const document = prepareExecutionDocument({ execution, assets: [] });
  expect(
    PreparedDocumentSchema.safeParse(JSON.parse(JSON.stringify(document)))
      .success,
  ).toBe(true);
  const displayed = document.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol' && item.symbol.glyph === 'Z_{web}'
        ? [item.symbol]
        : [],
    ),
  );
  expect(displayed.map((symbol) => symbol.notationScope)).toEqual([
    'x-axis',
    'y-axis',
  ]);
  displayed[1].notationScope = 'x-axis';
  expect(PreparedDocumentSchema.safeParse(document).success).toBe(false);
  webTerms[1].notationScope = 'x-axis';
  expect(SheetDocumentSchema.safeParse(sheet).success).toBe(false);
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
    if (change === 'unsupported') squareRoot.funcSpec = { id: 'fg.unknown' };
    else squareRoot.funcArgs = [{ key: root.valueTree.rootKey }];
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some(
        (d) =>
          d.code === (change === 'cycle' ? 'FORMULA_CYCLE' : 'SCHEMA_CUSTOM'),
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

it.each([
  ['nested predicate', 'INVALID_CONDITIONAL'],
  ['numeric branch', 'NONNUMERIC_FORMULA'],
  ['shared comparison operand', 'NONNUMERIC_FORMULA'],
  ['shared comparison operand reversed', 'NONNUMERIC_FORMULA'],
  ['string literal', 'NONNUMERIC_LITERAL'],
  ['arity', 'INVALID_FUNCTION_ARITY'],
  ['detached operation', 'SCHEMA_CUSTOM'],
  ['detached arity', 'INVALID_FUNCTION_ARITY'],
  ['detached cycle', 'FORMULA_CYCLE'],
])('rejects invalid %s throughout the Value tree', (change, code) => {
  const execution = capture(conditionalSource('>'), { discriminant: 4 });
  const root = symbols(execution).find(
    (symbol) => symbol.description === 'Root',
  );
  if (!root) throw new Error('Missing root');
  const nodes = root.valueTree.nodes;
  const outer = nodes.find((node) => node.key === root.valueTree.rootKey);
  const nested = nodes.find(
    (node) => node.funcSpec?.id === 'fg.cnd' && node !== outer,
  );
  const predicate = nodes.find((node) => node.funcSpec?.id === 'fg.lt');
  const squareRoot = nodes.find((node) => node.funcSpec?.id === 'fg.sqrt');
  if (
    !outer?.funcArgs ||
    !nested?.funcArgs ||
    !predicate?.funcArgs ||
    !squareRoot
  )
    throw new Error('Missing conditional graph');
  if (change === 'nested predicate') predicate.funcSpec = { id: 'fg.add' };
  if (change === 'numeric branch') nested.funcArgs[1] = { key: predicate.key };
  if (change.startsWith('shared comparison operand')) {
    const literal = nodes.find((node) => node.key === nested.funcArgs?.[1].key);
    if (!literal) throw new Error('Missing negative branch');
    literal.mode = 'FUNCTION';
    literal.funcSpec = { id: 'fg.uminus' };
    delete literal.literal;
    literal.funcArgs = [{ key: predicate.key }];
    if (change.endsWith('reversed')) nodes.reverse();
  }
  if (change === 'string literal') {
    const literal = nodes.find(
      (node) =>
        node.mode === 'LITERAL' &&
        node.literal?.kind === 'number' &&
        node.literal.value === -1,
    );
    if (!literal) throw new Error('Missing dormant literal');
    literal.literal = { kind: 'string', value: 'one' };
  }
  if (change === 'arity') predicate.funcArgs = [];
  if (change.startsWith('detached ')) {
    const detached = structuredClone(squareRoot);
    detached.key = 'detached';
    if (change === 'detached operation')
      detached.funcSpec = { id: 'fg.unknown' };
    else if (change === 'detached arity') detached.funcArgs = [];
    else detached.funcArgs = [{ key: detached.key }];
    nodes.push(detached);
  }
  const report = verifyExecution({ execution });
  expect(report.ok, JSON.stringify(report.diagnostics)).toBe(false);
  expect(
    report.diagnostics.some((item) => item.code === code),
    JSON.stringify(report.diagnostics),
  ).toBe(true);
});

it.each([
  [Number.MAX_SAFE_INTEGER + 1, 'UNSUPPORTED_NUMERIC_RANGE'],
  [1.5, 'NUMERIC_KIND_MISMATCH'],
])(
  'rejects invalid dormant literal %s at the capture contract',
  (value, code) => {
    const execution = capture(conditionalSource('>'), { discriminant: 4 });
    expect(verifyExecution({ execution }).ok).toBe(true);
    const root = symbols(execution).find(
      (symbol) => symbol.description === 'Root',
    );
    const literal = root?.valueTree.nodes.find(
      (node) => node.literal?.kind === 'number' && node.literal.value === -1,
    );
    if (!literal) throw new Error('Missing dormant literal');
    literal.literal = { kind: 'number', value, numericKind: 'int' };
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, stage: 'contract' }),
      ]),
    );
  },
);

it('checks dormant division structurally and reports division by zero only when selected', () => {
  const path = conditionalSource('>');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(
      'math.sqrt(discriminant)',
      '1.0 / discriminant',
    ),
  );
  const execution = capture(path, { discriminant: 0 });
  expect(verifyExecution({ execution }).ok).toBe(true);
  const root = symbols(execution).find(
    (symbol) => symbol.description === 'Root',
  );
  const comparison = root?.valueTree.nodes.find(
    (node) => node.funcSpec?.id === 'fg.gt',
  );
  if (!comparison) throw new Error('Missing comparison');
  comparison.funcSpec = { id: 'fg.ge' };
  const report = verifyExecution({ execution });
  expect(report.ok).toBe(false);
  expect(
    report.diagnostics.some((item) => item.code === 'DIVISION_BY_ZERO'),
  ).toBe(true);
});
