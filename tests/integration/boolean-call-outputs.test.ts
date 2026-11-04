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
import { writeBooleanCallOutputProject } from './fixtures/boolean-call-output-project.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-boolean-call-outputs-'));
function run(...args: string[]): string {
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-m', 'cso_python', ...args],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout;
}
beforeAll(() => {
  writeBooleanCallOutputProject(directory);
  run('bindings', directory);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function capture(calculation = 'wrapper', axis = 'columns') {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      run(
        'execute',
        join(directory, `compare_${calculation}_${axis}.cso.py`),
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
for (const calculation of ['wrapper', 'nested', 'external_wrapper']) {
  for (const axis of ['columns', 'rows']) {
    test(`${calculation}, ${axis}: bind output facts, lazy operands and qualifications to each captured call`, () => {
      const response = capture(calculation, axis);
      const execution = response.execution;
      expect(verifyExecution({ execution }).ok).toBe(true);
      const document = prepareExecutionDocument({ execution, assets: [] });
      expect(
        BoundPreparedDocumentSchema.safeParse({ execution, document }).success,
      ).toBe(true);
      const table = document.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'table');
      if (table?.kind !== 'table') throw new Error('Missing comparison');
      const rows = table.outcomeRows ?? [];
      const fact = rows.find(
        (row) =>
          row.kind === 'boolean' &&
          row.label ===
            (calculation === 'nested'
              ? 'Forwarded result is positive'
              : 'Child result is positive'),
      );
      expect(
        fact?.cells.map((cell) => cell.results.map((result) => result.value)),
      ).toEqual([[false], [false], [true]]);
      const direct = rows.find(
        (row) =>
          row.kind === 'check' && row.label === 'Child result is nonnegative',
      );
      const lazy = rows.find(
        (row) =>
          row.kind === 'check' &&
          row.label === 'Child reciprocal or nonpositive width',
      );
      const directResult = direct?.cells[0]?.results[0];
      expect(directResult).toMatchObject({ value: false });
      if (calculation !== 'external_wrapper')
        expect(directResult).toMatchObject({
          reasons: ['Child width must be nonnegative'],
        });
      expect(lazy?.cells[0]?.results[0]).toMatchObject({ value: true });
      expect(lazy?.cells[0]?.results[0]).not.toHaveProperty('reasons');
      const owner = execution.methods?.[0];
      const plan =
        calculation === 'nested'
          ? owner?.helpers.find((helper) => helper.function === 'wrapper')
          : owner;
      const condition = plan?.booleans?.find((item) => item.id === 'lazy');
      if (condition?.expression.kind !== 'predicate')
        throw new Error('Missing lazy predicate');
      const outputKey = condition.expression.nodes.find(
        (node) => node.ref?.kind === 'output',
      )?.key;
      const skipped = execution.booleanOutcomes?.find(
        (item) =>
          item.methodId === plan?.id &&
          item.booleanId === 'lazy' &&
          item.invocationId.includes('/negative'),
      );
      expect(skipped?.value).toBe(true);
      expect(skipped?.usedKeys).not.toContain(outputKey);
      if (calculation === 'external_wrapper')
        expect(execution.externalCalls).toHaveLength(3);
    });
  }
}

test('unresolved Boolean call/output references are rejected even when their branch was untaken', () => {
  for (const calculation of ['wrapper', 'nested', 'external_wrapper']) {
    const response = capture(calculation, 'untaken');
    for (const field of ['call', 'output'] as const) {
      const changed = structuredClone(response);
      const method = changed.execution.methods?.[0];
      const owner =
        calculation === 'nested'
          ? method?.helpers.find((helper) => helper.function === 'wrapper')
          : method;
      const condition = owner?.booleans?.find((item) => item.id === 'lazy');
      if (condition?.expression.kind !== 'predicate')
        throw new Error('Missing lazy predicate');
      const reference = condition.expression.nodes.find(
        (node) => node.ref?.kind === 'output',
      )?.ref;
      if (!reference) throw new Error('Missing output reference');
      reference[field] = 'missing';
      const parsed = ExecutionResponseSchema.safeParse(changed);
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(
          parsed.error.issues.some((issue) =>
            issue.message.includes('unresolved reference'),
          ),
        ).toBe(true);
    }
  }
});

test('retained output predicate values and used keys cannot be altered', () => {
  const response = capture();
  for (const field of ['value', 'usedKeys']) {
    const changed = structuredClone(response);
    const outcome = changed.execution.booleanOutcomes?.find(
      (item) => item.booleanId === 'direct',
    );
    if (!outcome) throw new Error('Missing direct predicate');
    if (field === 'value') outcome.value = !outcome.value;
    else outcome.usedKeys.pop();
    expect(ExecutionResponseSchema.safeParse(changed).success).toBe(false);
  }
});
