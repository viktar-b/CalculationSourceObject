import {
  execFileSync,
  type SpawnSyncReturns,
  spawnSync,
} from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPythonFromSheetDocument,
  createSheetFromCalculationSourceObject,
  ExecutionResponseSchema,
  getFunctionSpec,
  sheetFunctionSpecs,
  verifyExecution,
} from '@cs-object/core';
import {
  PreparedFormulaSheet,
  prepareExecutionDocument,
} from '@cs-object/react';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

Object.assign(globalThis, { React });
const python = process.env.PYTHON ?? 'python3';
const declarationSchema = z
  .object({
    name: z.string(),
    function_id: z.string(),
    min_arity: z.number().int().nonnegative(),
    max_arity: z.number().int().nonnegative().nullable(),
    module: z.enum(['math', 'builtins']),
    spellings: z.array(z.string()).nonempty(),
  })
  .superRefine((call, context) => {
    if (call.max_arity !== null && call.max_arity < call.min_arity) {
      context.addIssue({
        code: 'custom',
        message: 'max_arity must be greater than or equal to min_arity',
        path: ['max_arity'],
      });
    }
  });
const declarations = z.array(declarationSchema).parse(
  JSON.parse(
    execFileSync(
      python,
      [
        '-I',
        '-c',
        `
import json
from dataclasses import asdict
from cso_python.function_calls import FUNCTION_CALLS
print(json.dumps([dict(asdict(call), spellings=call.spellings) for call in FUNCTION_CALLS]))
`,
      ],
      { encoding: 'utf8' },
    ),
  ),
);

// Expected values are analytic identities or existing builtin semantics, not capture outputs.
const referenceCases: Record<
  string,
  { args: number[]; expected: number; kind: 'float' | 'int' }
> = {
  abs: { args: [-3.5], expected: 3.5, kind: 'float' },
  sqrt: { args: [9], expected: 3, kind: 'float' },
  ceil: { args: [1.2], expected: 2, kind: 'int' },
  floor: { args: [-1.2], expected: -2, kind: 'int' },
  round: { args: [2.5], expected: 2, kind: 'int' },
  max: { args: [2, 1], expected: 2, kind: 'float' },
  min: { args: [2, 1], expected: 1, kind: 'float' },
  exp: { args: [0], expected: 1, kind: 'float' },
  log: { args: [1], expected: 0, kind: 'float' },
  radians: { args: [180], expected: Math.PI, kind: 'float' },
  degrees: { args: [Math.PI], expected: 180, kind: 'float' },
  sin: { args: [Math.PI / 6], expected: 0.5, kind: 'float' },
  cos: { args: [Math.PI / 3], expected: 0.5, kind: 'float' },
  tan: { args: [Math.PI / 4], expected: 1, kind: 'float' },
  asin: { args: [0.5], expected: Math.PI / 6, kind: 'float' },
  acos: { args: [0.5], expected: Math.PI / 3, kind: 'float' },
  atan: { args: [1], expected: Math.PI / 4, kind: 'float' },
  atan2: { args: [1, 1], expected: Math.PI / 4, kind: 'float' },
  hypot: { args: [], expected: 0, kind: 'float' },
  sinh: { args: [Math.LN2], expected: 0.75, kind: 'float' },
  cosh: { args: [Math.LN2], expected: 1.25, kind: 'float' },
  tanh: { args: [Math.LN2], expected: 0.6, kind: 'float' },
};

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const floatLiteral = (value: number): string => {
  if (Object.is(value, -0)) return '-0.0';
  const token = String(value);
  return /[.e]/i.test(token) ? token : `${token}.0`;
};

function parseCaptureResponse(run: SpawnSyncReturns<string>) {
  try {
    if (run.error) throw run.error;
    return ExecutionResponseSchema.parse(JSON.parse(run.stdout));
  } catch (cause) {
    throw new Error(
      `Python capture did not produce a valid response (status=${run.status}, signal=${run.signal}): ${cause instanceof Error ? cause.message : String(cause)}\nstderr: ${run.stderr || '(empty)'}`,
      { cause },
    );
  }
}

function capture(expression: string, input = '0.5', imports = 'import math') {
  const directory = mkdtempSync(join(tmpdir(), 'cso-function-support-'));
  directories.push(directory);
  const path = join(directory, 'functions.cso.py');
  writeFileSync(
    path,
    `${imports}
from typing import Annotated
from cso_python import calculation, section, symbol
@calculation(id="functions", title="Function support")
@section(id="main", title="Functions", root=True)
def calculate(quantity: Annotated[float, symbol(glyph="q_{in}", description="Input", unit="")] = ${input}):
    result: Annotated[float, symbol(glyph="q_{out}", description="Result", unit="")] = ${expression}
    return {"result": result}
`,
  );
  const run = spawnSync(
    python,
    ['-I', '-m', 'cso_python', 'execute', path, '--function', 'calculate'],
    { encoding: 'utf8' },
  );
  return parseCaptureResponse(run);
}

function successfulCapture(
  expression: string,
  input?: string,
  imports?: string,
) {
  const response = capture(expression, input, imports);
  if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
  const output = response.execution.authoring?.outputs[0];
  if (!output) throw new Error('Expected a captured output');
  return { execution: response.execution, output };
}

function exportReplay(
  execution: ReturnType<typeof successfulCapture>['execution'],
  symbolId: string,
) {
  const { sheet } = createSheetFromCalculationSourceObject(execution.cso, {
    id: 'functions',
    label: 'Functions',
  });
  const code = createPythonFromSheetDocument(sheet, { functionName: 'replay' });
  const result = z
    .object({ value: z.number(), kind: z.enum(['int', 'float']) })
    .parse(
      JSON.parse(
        execFileSync(
          python,
          [
            '-I',
            '-c',
            `${code}
import json
result = replay()[${JSON.stringify(symbolId)}]
print(json.dumps({"value": result, "kind": type(result).__name__}))
`,
          ],
          { encoding: 'utf8' },
        ),
      ),
    );
  return { code, result };
}

it.each([
  ['(-0.0) ** 3', -0, 'float'],
  ['(-2.0) ** 2', 4, 'float'],
  ['(-2) ** (-2)', 0.25, 'float'],
  ['((-2) ** 2) ** 3', 64, 'int'],
] as const)(
  '%s replays as %s with numeric kind %s in Python',
  (expression, expected, kind) => {
    const { execution, output } = successfulCapture(expression);
    expect(output.value).toBe(expected);
    expect(output.numericKind).toBe(kind);
    expect(verifyExecution({ execution }).ok).toBe(true);
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value: expected,
      kind,
    });
  },
);

it('has independent reference cases for every declared call, without duplicate names, spellings or IDs', () => {
  expect(declarations.map((call) => call.name).sort()).toEqual(
    Object.keys(referenceCases).sort(),
  );
  for (const values of [
    declarations.map((call) => call.function_id),
    declarations.flatMap((call) => call.spellings),
  ]) {
    expect(new Set(values).size).toBe(values.length);
  }
});

it.each(declarations)(
  '$name lowers every spelling and completes verification, display and export',
  (call) => {
    const sample = referenceCases[call.name];
    if (!sample) throw new Error(`Missing reference case for ${call.name}`);
    expect(sample.args).toHaveLength(call.min_arity);
    const spec = getFunctionSpec(call.function_id);
    expect(spec).toBeDefined();
    for (const spelling of call.spellings) {
      const imports =
        call.module === 'builtins'
          ? ''
          : spelling.startsWith('math.')
            ? 'import math'
            : `from ${call.module} import ${call.name}`;
      const args = sample.args.map((value, index) =>
        index === 0 ? 'quantity' : floatLiteral(value),
      );
      const { execution, output } = successfulCapture(
        `${spelling}(${args.join(', ')})`,
        sample.args[0] === undefined ? undefined : floatLiteral(sample.args[0]),
        imports,
      );
      expect(output.numericKind).toBe(sample.kind);
      expect(output.value).toBeCloseTo(sample.expected, 14);
      const nodes = execution.cso.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
        ),
      );
      const callNode = nodes.find(
        (node) => node.funcSpec?.id === call.function_id,
      );
      expect(callNode?.funcArgs).toHaveLength(call.min_arity);

      // Every spelling must lower correctly; the downstream pipeline receives
      // the same function ID and needs only one run per declared function.
      if (spelling !== call.spellings[0]) continue;
      const report = verifyExecution({ execution });
      expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
      const document = prepareExecutionDocument({ execution, assets: [] });
      const html = renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document }),
      );
      expect(html).not.toContain('>?</');
      expect(html).toContain(
        call.name === 'sqrt'
          ? '<msqrt>'
          : call.name === 'abs'
            ? 'stretchy="true">|</mo>'
            : call.name === 'atan2'
              ? '<mi>atan</mi><mn>2</mn>'
              : `>${spec?.glyph}</`,
      );
      const { code, result } = exportReplay(execution, output.symbolId);
      expect(code).toContain(
        `${call.module === 'math' ? 'math.' : ''}${call.name}(`,
      );
      expect(result.kind).toBe(sample.kind);
      expect(result.value).toBe(output.value);
    }
  },
);

it('rejects malformed atan2 arity in a dormant branch', () => {
  const { execution } = successfulCapture(
    'math.atan2(quantity, 1) if quantity < 0 else 1.0',
  );
  const atan2 = execution.cso.sections
    .flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
      ),
    )
    .find((node) => node.funcSpec?.id === 'fg.atan2');
  if (!atan2?.funcArgs?.[0]) throw new Error('Missing dormant atan2 call');
  atan2.funcArgs = [atan2.funcArgs[0]];

  const report = verifyExecution({ execution });
  expect(report.ok).toBe(false);
  expect(
    report.diagnostics.some(
      (diagnostic) => diagnostic.code === 'INVALID_FUNCTION_ARITY',
    ),
  ).toBe(true);
});

it.each([
  ['math.sin(math.radians(quantity))', '30.0', 0.5],
  ['math.sin(quantity) ** 2 + math.cos(quantity) ** 2', '1.2', 1],
] as const)(
  'composes %s with existing formula operations',
  (expression, input, expected) => {
    const { execution, output } = successfulCapture(expression, input);
    expect(verifyExecution({ execution }).ok).toBe(true);
    expect(output.value).toBeCloseTo(expected, 12);
  },
);

it.each([
  ['sin', '1e308'],
  ['sinh', '710.0'],
] as const)(
  'independently verifies %s(%s) across runtime implementations',
  (name, input) => {
    const { execution, output } = successfulCapture(
      `math.${name}(quantity)`,
      input,
    );
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(output.numericKind).toBe('float');
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value: output.value,
      kind: 'float',
    });
  },
);

const syntaxCases = [
  { id: 'fg.add', expression: 'quantity + 2', expected: 2.5, kind: 'float' },
  {
    id: 'fg.subtract',
    expression: 'quantity - 2',
    expected: -1.5,
    kind: 'float',
  },
  { id: 'fg.multiply', expression: 'quantity * 2', expected: 1, kind: 'float' },
  {
    id: 'fg.divide',
    expression: 'quantity / 2',
    expected: 0.25,
    kind: 'float',
  },
  { id: 'fg.pow', expression: 'quantity ** 2', expected: 0.25, kind: 'float' },
  { id: 'fg.uminus', expression: '-quantity', expected: -0.5, kind: 'float' },
  { id: 'fg.pi', expression: 'math.pi', expected: Math.PI, kind: 'float' },
  {
    id: 'fg.cnd',
    expression: '1 if quantity < 1 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.lt',
    expression: '1 if quantity < 1 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.le',
    expression: '1 if quantity <= 0.5 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.gt',
    expression: '1 if quantity > 1 else 2',
    expected: 2,
    kind: 'int',
  },
  {
    id: 'fg.ge',
    expression: '1 if quantity >= 0.5 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.eq',
    expression: '1 if quantity == 0.5 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.ne',
    expression: '1 if quantity != 0.5 else 2',
    expected: 2,
    kind: 'int',
  },
  {
    id: 'fg.and',
    expression: '1 if quantity > 0 and quantity < 1 else 2',
    expected: 1,
    kind: 'int',
  },
  {
    id: 'fg.or',
    expression: '1 if quantity < 0 or quantity > 1 else 2',
    expected: 2,
    kind: 'int',
  },
];

const displayOnlyFunctions = ['fg.noop', 'fg.stub'];

it('classifies display-only functions separately from verified Python operations', () => {
  const authored = new Set([
    ...declarations.map((call) => call.function_id),
    ...syntaxCases.map((sample) => sample.id),
  ]);
  expect(
    sheetFunctionSpecs
      .filter((spec) => !authored.has(spec.id))
      .map((spec) => spec.id)
      .sort(),
  ).toEqual(displayOnlyFunctions);
  for (const id of authored) expect(getFunctionSpec(id)).toBeDefined();
});

it.each(displayOnlyFunctions)(
  '%s retains display/export compatibility without numerical verification',
  (id) => {
    const { execution, output } = successfulCapture('quantity + 0');
    const root = execution.cso.sections
      .flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
        ),
      )
      .find((node) => node.funcSpec?.id === 'fg.add');
    if (!root?.funcArgs?.[0]) throw new Error('Missing formula operand');
    root.funcSpec = { id };
    root.funcArgs = [root.funcArgs[0]];
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some(
        (diagnostic) => diagnostic.code === 'UNSUPPORTED_FUNCTION',
      ),
    ).toBe(true);
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, {
        document: prepareExecutionDocument({ execution, assets: [] }),
      }),
    );
    expect(html).not.toContain('>?</');
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value: 0.5,
      kind: 'float',
    });
  },
);

it.each(syntaxCases)(
  '$id works through capture, verification, rendering and replay',
  (sample) => {
    const { execution, output } = successfulCapture(sample.expression);
    expect(output.value).toBe(sample.expected);
    expect(output.numericKind).toBe(sample.kind);
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(JSON.stringify(execution.cso)).toContain(sample.id);
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, {
        document: prepareExecutionDocument({ execution, assets: [] }),
      }),
    );
    expect(html).not.toContain('>?</');
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value: sample.expected,
      kind: sample.kind,
    });
  },
);

// Retain transport-sensitive cases and evaluation order here. Ordinary
// arithmetic and numeric policy belong to the core evaluator tests.
const extendedCases = [
  ['math.hypot(2, 3, 6)', '0.5', 7, 'float'],
  ['math.log(quantity, 2)', '8.0', 3, 'float'],
  ['round(quantity, 2)', '2.675', 2.67, 'float'],
  ['round(quantity, 0)', '-0.1', -0, 'float'],
  ['round(quantity, -2)', '250', 200, 'int'],
  ['(2 if quantity > 0 else 3) if quantity < 1 else 4', '2.0', 4, 'int'],
  ['1 if quantity > 0 and math.log(-1) > 0 else 2', '-1.0', 2, 'int'],
  ['1 if quantity > 0 or math.log(-1) > 0 else 2', '1.0', 1, 'int'],
  ['1 if 0 < quantity <= 2 != 3 else 2', '1.0', 1, 'int'],
  ['1 if 0 < quantity < math.log(-1) else 2', '-1.0', 2, 'int'],
] satisfies [string, string, number, 'int' | 'float'][];

it.each(extendedCases)(
  '%s at %s preserves the expected value and kind',
  (expression, input, value, kind) => {
    const { execution, output } = successfulCapture(expression, input);
    expect(output.value).toBe(value);
    expect(output.numericKind).toBe(kind);
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value,
      kind,
    });
  },
);

it.each([
  ['math.atan2(-0.0, -0.0)', -Math.PI],
  ['math.atan2(-0.0, 0.0)', -0],
] as const)(
  '%s preserves signed-zero quadrant behavior',
  (expression, value) => {
    const { execution, output } = successfulCapture(expression);
    expect(output.value).toBe(value);
    expect(output.numericKind).toBe('float');
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value,
      kind: 'float',
    });
  },
);

it.each([
  ['math.asin(2)', 'TRIG_DOMAIN_ERROR', 'EXECUTION_FAILED'],
  ['math.log(0)', 'LOG_DOMAIN_ERROR', 'EXECUTION_FAILED'],
  ['math.log(2, 1)', 'DIVISION_BY_ZERO', 'EXECUTION_FAILED'],
  ['math.exp(1000)', 'NON_FINITE_NUMBER', 'EXECUTION_FAILED'],
  [
    'math.floor(9007199254740992.0)',
    'UNSUPPORTED_NUMERIC_RANGE',
    'UNSUPPORTED_NUMERIC_RANGE',
  ],
  ['round(quantity, 2.0)', 'INVALID_INTEGER_OPERAND', 'EXECUTION_FAILED'],
])(
  'rejects active %s with %s but permits a dormant branch',
  (expression, code, captureCode) => {
    expect(capture(expression)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: captureCode })],
    });
    const { execution } = successfulCapture(
      `${expression} if quantity < 0 else 1`,
    );
    expect(verifyExecution({ execution }).ok).toBe(true);
    const predicate = execution.cso.sections
      .flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
        ),
      )
      .find((node) => node.funcSpec?.id === 'fg.lt');
    if (!predicate?.funcSpec) throw new Error('Expected a predicate');
    predicate.funcSpec.id = 'fg.gt';
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
  },
);

it.each(['arity', 'role', 'cycle'])(
  'validates dormant logical operands for %s errors before evaluation',
  (change) => {
    const { execution } = successfulCapture(
      '1 if quantity > 0 or math.sqrt(-1) > 0 else 2',
    );
    const nodes = execution.cso.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
      ),
    );
    const dormant = nodes.find((node) => node.funcSpec?.id === 'fg.sqrt');
    if (!dormant?.funcArgs?.[0]) throw new Error('Missing dormant operand');
    if (change === 'arity') dormant.funcArgs = [];
    if (change === 'role') {
      dormant.funcSpec = { id: 'fg.eq' };
      dormant.funcArgs = [dormant.funcArgs[0], dormant.funcArgs[0]];
    }
    if (change === 'cycle') dormant.funcArgs = [{ key: dormant.key }];
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some(
        (d) =>
          d.code ===
          (change === 'arity'
            ? 'INVALID_FUNCTION_ARITY'
            : change === 'cycle'
              ? 'FORMULA_CYCLE'
              : 'NONNUMERIC_FORMULA'),
      ),
    ).toBe(true);
  },
);

it.each(['and', 'or'])(
  'rejects numeric %s operands in externally supplied graphs',
  (operator) => {
    for (const numericOnly of [false, true]) {
      const { execution } = successfulCapture(
        `1 if quantity > 0 ${operator} quantity < 1 else 2`,
      );
      const nodes = execution.cso.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
        ),
      );
      const logical = nodes.find(
        (node) => node.funcSpec?.id === `fg.${operator}`,
      );
      const comparison = nodes.find((node) => node.funcSpec?.id === 'fg.gt');
      if (!logical?.funcArgs || !comparison?.funcArgs?.[0])
        throw new Error('Missing predicate');
      const numericOperand = comparison.funcArgs[0];
      logical.funcArgs = logical.funcArgs.map((argument, index) =>
        numericOnly || index === 0 ? { key: numericOperand.key } : argument,
      );
      const report = verifyExecution({ execution });
      expect(report.ok).toBe(false);
      expect(
        report.diagnostics.some(
          (diagnostic) => diagnostic.code === 'INVALID_CONDITIONAL',
        ),
      ).toBe(true);
    }
  },
);

it.each([
  { expression: 'min(8, -3, -3.0, 5)', value: -3, kind: 'int' },
  { expression: 'min(8, -3.0, -3, 5)', value: -3, kind: 'float' },
  { expression: 'max(-1, -0.0, 0.0, -2)', value: -0, kind: 'float' },
  { expression: 'max(-1, 0.0, -0.0, -2)', value: 0, kind: 'float' },
])(
  'preserves variadic $expression through verification and replay',
  ({ expression, value, kind }) => {
    const { execution, output } = successfulCapture(expression);
    expect(output.value).toBe(value);
    expect(output.numericKind).toBe(kind);
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(exportReplay(execution, output.symbolId).result).toEqual({
      value,
      kind,
    });
  },
);

it.each(['min', 'max'])(
  '%s evaluates later arguments eagerly and in source order',
  (name) => {
    expect(capture(`${name}(0, 1, 1 / 0, math.sqrt(-1))`)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'EXECUTION_FAILED',
          message: expect.stringContaining('ZeroDivisionError'),
        },
      ],
    });
    expect(capture(`${name}(0, 1, math.sqrt(-1), 1 / 0)`)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'EXECUTION_FAILED',
          message: expect.stringContaining('ValueError'),
        },
      ],
    });
    const { execution } = successfulCapture(
      `${name}(0, 1, 1 / 0) if quantity < 0 else 1`,
    );
    expect(verifyExecution({ execution }).ok).toBe(true);
    const nodes = execution.cso.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
      ),
    );
    const predicate = nodes.find((node) => node.funcSpec?.id === 'fg.lt');
    if (!predicate?.funcSpec) throw new Error('Missing predicate');
    predicate.funcSpec.id = 'fg.gt';
    expect(
      verifyExecution({ execution }).diagnostics.some(
        (d) => d.code === 'DIVISION_BY_ZERO',
      ),
    ).toBe(true);
  },
);

it.each(['min', 'max'])(
  '%s checks every dormant operand role and its minimum arity',
  (name) => {
    const { execution } = successfulCapture(
      `${name}(0, 1, 2, 3) if quantity < 0 else 1`,
    );
    const nodes = execution.cso.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? item.symbol.valueTree.nodes : [],
      ),
    );
    const call = nodes.find((node) => node.funcSpec?.id === `fg.${name}`);
    const predicate = nodes.find((node) => node.funcSpec?.id === 'fg.lt');
    if (!call?.funcArgs || !predicate)
      throw new Error('Missing function or predicate');
    const originalArgs = call.funcArgs;
    for (let index = 0; index < originalArgs.length; index += 1) {
      call.funcArgs = originalArgs.map((arg, position) =>
        position === index ? { key: predicate.key } : arg,
      );
      expect(
        verifyExecution({ execution }).diagnostics.some(
          (d) => d.code === 'NONNUMERIC_FORMULA',
        ),
      ).toBe(true);
    }
    call.funcArgs = originalArgs.slice(0, 1);
    expect(
      verifyExecution({ execution }).diagnostics.some(
        (d) => d.code === 'INVALID_FUNCTION_ARITY',
      ),
    ).toBe(true);
  },
);
