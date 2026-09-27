import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CalculationDefinitionResponseSchema,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import { expect, test } from 'vitest';

test('the installed static definition describes the composed execution interface', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cso definition consumer '));
  const python = process.env.PYTHON ?? 'python3';
  try {
    cpSync(new URL('../../examples/two-panel/', import.meta.url), directory, {
      recursive: true,
    });
    execFileSync(python, ['-I', '-m', 'cso_python', 'bindings', directory]);
    const source = join(directory, 'estimate.cso.py');
    const definitionResponse = CalculationDefinitionResponseSchema.parse(
      JSON.parse(
        execFileSync(
          python,
          [
            '-I',
            '-m',
            'cso_python',
            'describe',
            source,
            '--function',
            'estimate',
          ],
          { encoding: 'utf8' },
        ),
      ),
    );
    expect(definitionResponse.ok).toBe(true);
    if (!definitionResponse.ok) throw new Error('Definition failed');
    const definition = definitionResponse.definition;
    expect(
      definition.inputs.map(({ name, default: value, unit }) => ({
        name,
        value,
        unit,
      })),
    ).toEqual([
      { name: 'width', value: 2, unit: 'm' },
      { name: 'first_panel_height', value: 3, unit: 'm' },
      { name: 'second_panel_height', value: 4, unit: 'm' },
      { name: 'thickness', value: 0.1, unit: 'm' },
      { name: 'density', value: 500, unit: 'kg/m^3' },
    ]);
    expect(
      definition.outputs.map(({ name, unit }) => ({ name, unit })),
    ).toEqual([
      { name: 'area', unit: 'm^2' },
      { name: 'volume', unit: 'm^3' },
      { name: 'mass', unit: 'kg' },
    ]);
    const response = ExecutionResponseSchema.parse(
      JSON.parse(
        execFileSync(
          python,
          [
            '-I',
            '-m',
            'cso_python',
            'execute',
            source,
            '--function',
            'estimate',
            '--inputs-json',
            '{"width":1}',
          ],
          { encoding: 'utf8' },
        ),
      ),
    );
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('Execution failed');
    expect(response.execution.sourceClosureHash).toBe(
      definition.sourceClosureHash,
    );
    expect(response.execution.entry.moduleId).toBe(definition.entryModuleId);
    expect(response.execution.entry.sourceHash).toBe(definition.entrySourceHash);
    expect(verifyExecution({ execution: response.execution }).ok).toBe(true);
    const outputs = Object.fromEntries(
      response.execution.authoring?.outputs
        .filter(({ invocationId }) => invocationId === 'root')
        .map(({ name, value }) => [name, value]) ?? [],
    );
    expect(outputs.area).toBe(7);
    expect(outputs.volume).toBeCloseTo(0.7, 12);
    expect(outputs.mass).toBeCloseTo(350, 10);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
