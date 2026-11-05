import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BoundPreparedDocumentSchema,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { writeBooleanTableProject } from './fixtures/boolean-table-project.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-boolean-tables-'));
const python = process.env.PYTHON ?? 'python3';
function run(...args: string[]): string {
  const result = spawnSync(
    python,
    ['-I', '-X', 'utf8', '-m', 'cso_python', ...args],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout;
}
beforeAll(() => {
  writeBooleanTableProject(directory);
  run('bindings', directory);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function capture(axis = 'columns', selection = 'all') {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      run(
        'execute',
        join(directory, `${axis}_${selection}.cso.py`),
        '--function',
        'compare',
        '--supported-execution-protocol',
        '5',
      ),
    ),
  );
  if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
  return response;
}
function prepare(axis = 'columns', selection = 'all') {
  const response = capture(axis, selection);
  const document = prepareExecutionDocument({
    execution: response.execution,
    assets: [],
  });
  const table = document.sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === 'table');
  if (table?.kind !== 'table') throw new Error('Missing prepared comparison');
  return { response, document, table };
}

for (const axis of ['columns', 'rows']) {
  test(`${axis}: typed values, nested engineering verdicts and selected rules align with retained cases`, () => {
    const { response, document, table } = prepare(axis);
    expect(response.protocolVersion).toBe('5');
    expect(document.documentVersion).toBe('5');
    expect(verifyExecution({ execution: response.execution }).ok).toBe(true);
    expect(table.casesAxis).toBe(axis);
    expect(table.groups).toEqual([]);
    const rows = table.outcomeRows ?? [];
    expect(rows.filter((row) => row.kind === 'boolean')).toHaveLength(4);
    expect(
      rows.every(
        (row) =>
          row.cells.map((cell) => cell.heading).join() ===
          'Zero,Positive,Negative',
      ),
    ).toBe(true);
    const positive = rows.find((row) => row.label === 'Positive width');
    expect(
      positive?.cells.map((cell) => cell.results.map((result) => result.value)),
    ).toEqual([[false], [true], [false]]);
    expect(
      rows.find((row) => row.label === 'False flag')?.cells[0]?.results[0]
        ?.value,
    ).toBe(false);
    expect(
      rows.find((row) => row.label === 'True flag')?.cells[0]?.results[0]
        ?.value,
    ).toBe(true);
    const helperCheck = rows.find(
      (row) =>
        row.kind === 'check' && row.label === 'Width does not exceed 2 m',
    );
    expect(
      helperCheck?.cells.map((cell) =>
        cell.results.map((result) => result.value),
      ),
    ).toEqual([
      [true, true],
      [false, false],
      [true, true],
    ]);
    expect(
      helperCheck?.cells[0]?.results.map((result) => result.callPath),
    ).toEqual(['first', 'second']);
    expect(
      helperCheck?.cells[2]?.results.map((result) =>
        'reasons' in result ? result.reasons : undefined,
      ),
    ).toEqual([['Width is nonnegative'], ['Width is nonnegative']]);
    const combined = rows.find(
      (row) => row.kind === 'check' && row.label.startsWith('Combined'),
    );
    expect(combined?.cells[2]?.results[0]).toMatchObject({
      value: true,
      reasons: ['Width is nonnegative'],
    });
    expect(
      rows.find((row) => row.kind === 'applicability')?.cells[2]?.results,
    ).toHaveLength(2);
    const ceiling = rows.find(
      (row) =>
        row.kind === 'applicability' && row.label === 'Width is below 10 m',
    );
    expect(ceiling?.cells[2]?.results[0]).toMatchObject({
      value: true,
      reasons: ['Width is nonnegative'],
    });

    expect(rows.filter((row) => row.kind === 'branch')).toHaveLength(1);
    expect(
      rows
        .find((row) => row.kind === 'branch')
        ?.cells.map((cell) => cell.results.map((result) => result.value)),
    ).toHaveLength(3);
    const output = response.execution.authoring?.outputs.find(
      (item) => item.invocationId === 'root/first' && item.name === 'result',
    );
    expect(output).toMatchObject({ value: 0, numericKind: 'int' });
    expect(typeof output?.value).toBe('number');
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: response.execution,
        document,
      }).success,
    ).toBe(true);
  });

  test(`${axis}: numeric and Boolean cells retain separate value kinds and qualifications`, () => {
    const { table } = prepare(axis, 'mixed');
    expect(table.groups.map((group) => group.role)).toEqual([
      'input',
      'output',
    ]);
    const outputs = table.groups.find((group) => group.role === 'output')
      ?.rows[0]?.cells;
    expect(outputs?.map((cell) => cell.value)).toEqual([0, 6, -2]);
    expect(outputs?.map((cell) => cell.numericKind)).toEqual([
      'int',
      'float',
      'int',
    ]);
    expect(outputs?.[2]?.applicability).toEqual({
      state: 'not-applicable',
      reasons: ['Width is nonnegative'],
    });
    expect(
      table.outcomeRows?.find((row) => row.label === 'False flag')?.cells[0]
        ?.results[0]?.value,
    ).toBe(false);
  });

  test(`${axis}: Boolean selection preserves required outcomes and captured values`, () => {
    const selected = prepare(axis, 'selected');
    expect(
      selected.table.outcomeRows
        ?.filter((row) => row.kind === 'boolean')
        .map((row) => row.label),
    ).toEqual(['False flag']);
    const hidden = prepare(axis, 'hidden');
    expect(
      hidden.table.outcomeRows?.some((row) => row.kind === 'boolean'),
    ).toBe(false);
    expect(
      hidden.table.outcomeRows?.filter((row) => row.kind === 'check'),
    ).toHaveLength(2);
    expect(hidden.response.execution.booleanOutcomes).toHaveLength(12);
    const empty = prepare(axis, 'empty');
    expect(empty.table.emptyState).toBe('No cases evaluated');
    expect(
      empty.table.outcomeRows?.every((row) => row.cells.length === 0),
    ).toBe(true);
    expect(empty.response.execution.booleanOutcomes).toBeUndefined();
  });
}

test('capture validation rejects Boolean tampering, numerical masquerading, missing and duplicate evidence', () => {
  const response = capture();
  for (const mutate of [
    (value: typeof response) => {
      const item = value.execution.booleanOutcomes?.[0];
      if (item) item.value = !item.value;
    },
    (value: typeof response) => {
      value.execution.booleanOutcomes?.pop();
    },
    (value: typeof response) => {
      const item = value.execution.booleanOutcomes?.[0];
      if (item) value.execution.booleanOutcomes?.push(item);
    },
    (value: typeof response) => {
      value.execution.cso.schemaVersion = '1.1.0';
      value.protocolVersion = '3';
    },
  ]) {
    const changed = structuredClone(response);
    mutate(changed);
    expect(ExecutionResponseSchema.safeParse(changed).success).toBe(false);
  }
  const raw: unknown = JSON.parse(
    JSON.stringify(response).replace('"value":false', '"value":0'),
  );
  expect(ExecutionResponseSchema.safeParse(raw).success).toBe(false);
});

test('prepared outcome values, order and omitted required rows remain bound to the capture', () => {
  const { response, document } = prepare();
  for (const mutation of ['value', 'order', 'remove']) {
    const changed = structuredClone(document);
    const table = changed.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'table');
    if (table?.kind !== 'table' || !table.outcomeRows)
      throw new Error('Missing outcomes');
    if (mutation === 'value') {
      const result = table.outcomeRows.find((row) => row.kind === 'boolean')
        ?.cells[0]?.results[0];
      if (result && typeof result.value === 'boolean')
        result.value = !result.value;
    } else if (mutation === 'order') table.outcomeRows[0]?.cells.reverse();
    else table.outcomeRows.splice(0, 1);
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: response.execution,
        document: changed,
      }).success,
    ).toBe(false);
  }
});

test('CLI negotiates protocol 5 and independently verifies the Boolean project', () => {
  const cli = join(import.meta.dirname, '../../packages/cso-cli/dist/cli.js');
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'verify',
      join(directory, 'columns_mixed.cso.py'),
      '--function',
      'compare',
      '--format',
      'json',
    ],
    { encoding: 'utf8', env: { ...process.env, PYTHON: python } },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const report: unknown = JSON.parse(result.stdout);
  expect(report).toMatchObject({ ok: true, command: 'verify' });
});
