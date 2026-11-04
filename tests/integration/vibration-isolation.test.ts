import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ExecutionResponseSchema,
  ExternalOutputReferenceCaseSchema,
  externalReferenceBindingFrom,
  verifyExecution,
} from '@cs-object/core';
import { expect, test } from 'vitest';
import {
  prepareExecutionDocument,
  PreparedFormulaSheet,
} from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

for (const [name, roots] of [
  ['compare', [0.01, 0.01, 0.008]],
  ['sweep', [0.01]],
] as const) {
  test(`vibration showcase ${name} retains independent equilibrium agreement and engineering outcomes`, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'cso-vibration-'));
    try {
      const project = join(temporary, 'calculation');
      cpSync(resolve('examples/vibration-isolation'), project, {
        recursive: true,
        filter: (path) =>
          !path.includes('_cso_bindings') && !path.includes('__pycache__'),
      });
      const python = process.env.PYTHON ?? 'python3';
      const generated = spawnSync(
        python,
        ['-I', '-m', 'cso_python', 'bindings', project],
        { encoding: 'utf8' },
      );
      expect(generated.status, generated.stdout + generated.stderr).toBe(0);
      const captured = spawnSync(
        python,
        [
          '-I',
          '-m',
          'cso_python',
          'execute',
          join(project, 'showcase.cso.py'),
          '--function',
          name,
          '--supported-execution-protocol',
          '5',
        ],
        { encoding: 'utf8', maxBuffer: 16000000 },
      );
      expect(captured.status, captured.stdout + captured.stderr).toBe(0);
      const response = ExecutionResponseSchema.parse(
        JSON.parse(captured.stdout),
      );
      if (!response.ok) throw new Error(JSON.stringify(response));
      const execution = response.execution;
      const calls = execution.externalCalls ?? [];
      expect(calls).toHaveLength(roots.length);
      const reference = ExternalOutputReferenceCaseSchema.parse({
        kind: 'externalOutputs',
        id: 'exact-equilibrium',
        revision: '1',
        basis: {
          method: 'Exact polynomial substitution',
          derivation:
            '40000×0.01=400; 20000×0.01+2e8×0.01³=400; 10000×0.008+6.25e8×0.008³=400. Strict positive slope gives unique roots.',
          sourceDescription:
            'Expected roots independently specified algebraically.',
        },
        binding: externalReferenceBindingFrom(execution),
        expected: calls.map((call, index) => ({
          externalCallId: call.id,
          outputName: 'displacement',
          value: roots[index],
          numericKind: 'float',
          unit: 'm',
        })),
      });
      const report = verifyExecution({
        execution,
        referenceCases: [reference],
      });
      expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
      expect(report.externalReferenceCoverage?.status).toBe('partial');
      expect(report.externalReferenceCoverage?.uncovered).toHaveLength(
        roots.length * 2,
      );
      expect(execution.checkOutcomes?.some((check) => !check.value)).toBe(true);
      const assets = execution.assets.map((asset) => ({
        asset,
        dataUrl: `data:${asset.mediaType};base64,${readFileSync(join(project, asset.path)).toString('base64')}`,
      }));
      const prepared = prepareExecutionDocument({
        execution,
        assets,
        verificationReport: report,
      });
      const html = renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document: prepared }),
      );
      expect(html).not.toContain('Results overview');
      expect(html).toContain(
        'Reusable function for downstream use. Values are not defined yet.',
      );
      expect(html).toContain('cso-symbolic-value');
      if (name === 'compare')
        expect(html).toContain('class="cso-method-helper"');
      expect(html).toContain('data-method-id=');
      expect(execution.cso.schemaVersion).toBe('1.3.0');
      expect(html).toContain('data-outcome-kind="boolean"');
      expect(html).toContain('data-outcome-kind="check"');
      expect(html).toContain('data-outcome-kind="applicability"');
      const comparison = prepared.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'table');
      if (comparison?.kind !== 'table') throw new Error('Missing comparison');
      expect(
        comparison.outcomeRows
          ?.find(
            (row) => row.label === 'Excitation below the natural frequency',
          )
          ?.cells.map((cell) => cell.results.map((result) => result.value)),
      ).toEqual(
        name === 'compare'
          ? [[false], [false], [false]]
          : [[true], [true], [false], [false], [false]],
      );
      expect(html.match(/External-result consistency:/gu)).toHaveLength(1);
      expect(html).not.toContain('Function compare.');
      if (name === 'compare')
        expect(html).toContain('class="cso-method-external cso-external-call"');
      expect(html.match(/data-external-role="input"/gu)).toHaveLength(
        roots.length * 3,
      );
      expect(html.match(/data-external-role="output"/gu)).toHaveLength(
        roots.length * 3,
      );
      if (name === 'compare') {
        expect(
          execution.applicabilityOutcomes?.some((outcome) => !outcome.value),
        ).toBe(true);
        const fallback = execution.authoring?.outputs.find(
          (output) =>
            output.invocationId === 'root/hardening_motion/harmonic_response' &&
            output.name === 'screened_transmissibility',
        );
        expect(fallback?.value).toBe(1);
        expect(html).toContain('0.20133');
        for (const quantity of [
          'damping',
          'allowance',
          'target',
          'mass',
          'force',
        ])
          expect(
            comparison.groups
              .flatMap((group) => group.rows)
              .some((row) => row.quantity === quantity),
          ).toBe(true);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
