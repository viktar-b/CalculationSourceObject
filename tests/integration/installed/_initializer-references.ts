import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CommandReportSchema,
  ExecutionResponseSchema,
  type LegacyReferenceCaseSchema,
  ReferenceBindingSchema,
  ReferenceFileSchema,
} from '@cs-object/core';
import { z } from 'zod';
import { exerciseBrowser } from './_initializer-browser.ts';
import {
  artifactSet,
  hashBytes,
  OutputsSchema,
  writeJson,
} from './_initializer-evidence.ts';
import { type CommandRunner, startDev } from './_initializer-processes.ts';

// Follow the shipped composed report and reference recipes. Expectations are
// elementary geometry established before execution, never observed answers.
const independentCases = [
  { width: 2, area: 6, totalArea: 12 },
  { width: 4, area: 12, totalArea: 24 },
];

export async function exerciseReferenceAuthoring(options: {
  readonly project: string;
  readonly trial: string;
  readonly installedPython: string;
  readonly root: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly run: CommandRunner;
}) {
  const { project, trial, installedPython, root, environment, run } = options;
  // The generated report registry requires sources below calculations/. Keep
  // this recipe separate from the maintained example exercised earlier.
  const calculations = join(project, 'calculations/reference_trial');
  cpSync(join(trial, 'calculations'), calculations, {
    recursive: true,
    filter: (path) =>
      !path
        .split(/[\\/]/)
        .some((part) => ['__pycache__', '_cso_bindings'].includes(part)),
  });
  await run({
    cwd: project,
    command: installedPython,
    args: ['-I', '-m', 'cso_python', 'bindings', calculations],
  });
  const source = join(calculations, 'composed.cso.py');
  const referencePath = join(trial, 'reference.json');
  const cli = join(project, 'node_modules/@cs-object/cli/dist/cli.js');
  const env = { ...environment, PYTHON: installedPython };
  const receipts: { name: string; ok: boolean; referenceStatus: string }[] = [];
  async function verify(
    name: string,
    width: number,
    reference: string | undefined,
    expectedStatus = 0,
  ) {
    const report = CommandReportSchema.parse(
      JSON.parse(
        await run({
          cwd: project,
          command: process.execPath,
          args: [
            cli,
            'verify',
            source,
            '--function',
            'calculate',
            '--input',
            `width=${width}`,
            ...(reference ? ['--reference', reference] : []),
            '--format',
            'json',
          ],
          env,
          expectedStatus,
        }),
      ),
    );
    writeJson(join(root, `reference-${name}.json`), report);
    receipts.push({
      name,
      ok: report.ok,
      referenceStatus: report.checks.independentReferenceAgreement.status,
    });
    assert.equal(report.checks.sourceToDocumentConsistency.status, 'passed');
    return report;
  }
  const capture = ExecutionResponseSchema.parse(
    JSON.parse(
      await run({
        cwd: project,
        command: installedPython,
        args: [
          '-I',
          '-m',
          'cso_python',
          'execute',
          source,
          '--function',
          'calculate',
        ],
      }),
    ),
  );
  assert(capture.ok);
  const outputs = capture.execution.authoring?.outputs;
  const areaId = z
    .string()
    .min(1)
    .parse(
      outputs?.find(
        (item) => item.invocationId !== 'root' && item.name === 'area',
      )?.symbolId,
    );
  const totalId = z
    .string()
    .min(1)
    .parse(
      outputs?.find(
        (item) => item.invocationId === 'root' && item.name === 'total_area',
      )?.symbolId,
    );
  assert.deepEqual(
    new Set([areaId, totalId]),
    new Set(
      capture.execution.observations
        .filter((item) => item.kind === 'formula')
        .map((item) => item.symbolId),
    ),
  );

  async function bind(revision: string) {
    const cases: z.infer<typeof LegacyReferenceCaseSchema>[] = [];
    for (const item of independentCases) {
      const report = await verify(
        `bind-${revision}-${item.width}`,
        item.width,
        undefined,
      );
      const {
        entryModuleId,
        entrySourceHash,
        sourceClosureHash,
        function: entryFunction,
        resolvedInputs,
        resolvedInputKinds,
      } = report.provenance;
      cases.push({
        id: `pair-3-by-${item.width}`,
        revision,
        basis: {
          method: 'Independent elementary rectangle geometry',
          derivation: `Perpendicular sides: 3 m times ${item.width} m gives ${item.area} m^2. Two equal non-overlapping rectangles give ${item.totalArea} m^2.`,
          sourceDescription:
            'Elementary geometry stated before executing the packaged recipe.',
        },
        binding: ReferenceBindingSchema.parse({
          entryModuleId,
          entrySourceHash,
          sourceClosureHash,
          function: entryFunction,
          resolvedInputs,
          resolvedInputKinds,
        }),
        expected: [
          { symbolId: areaId, value: item.area, unit: 'm^2' },
          { symbolId: totalId, value: item.totalArea, unit: 'm^2' },
        ],
      });
    }
    const reference = ReferenceFileSchema.parse({
      referenceVersion: '1',
      cases,
    });
    writeJson(referencePath, reference);
    writeJson(join(root, `reference-revision-${revision}.json`), reference);
    return reference;
  }
  const original = await bind('1');
  const expectedValues = original.cases.map((item) => item.expected);
  for (const item of independentCases) {
    const report = await verify(
      `matching-${item.width}`,
      item.width,
      referencePath,
    );
    assert.equal(report.ok, true);
    assert.equal(report.checks.independentReferenceAgreement.status, 'passed');
    assert.equal(
      report.checks.independentReferenceAgreement.counts?.checked,
      2,
    );
  }
  const wrongPath = join(trial, 'wrong-reference.json');
  writeJson(wrongPath, {
    ...original,
    cases: original.cases.map((item) => ({
      ...item,
      expected: item.expected.map((expected) => ({
        ...expected,
        value: expected.value + 1,
      })),
    })),
  });
  const wrong = await verify('wrong-matching', 4, wrongPath, 1);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.checks.independentReferenceAgreement.status, 'failed');
  const unmatched = await verify('unmatched-inputs', 5, referencePath);
  assert.equal(unmatched.ok, true);
  assert.equal(
    unmatched.checks.independentReferenceAgreement.status,
    'not_applicable',
  );

  const authored = readFileSync(source, 'utf8');
  const edits = [
    {
      name: 'formula',
      before: '2.0 * single["area"]',
      after: 'single["area"] + single["area"]',
    },
    {
      name: 'text',
      before: 'Two equal perpendicular rectangles.',
      after: 'Two identical perpendicular rectangles.',
    },
  ];
  for (const [index, edit] of edits.entries()) {
    const current = readFileSync(source, 'utf8');
    assert(current.includes(edit.before));
    writeFileSync(source, current.replace(edit.before, edit.after));
    const stale = await verify(`stale-${edit.name}`, 4, referencePath);
    assert.equal(stale.ok, true);
    assert.equal(
      stale.checks.independentReferenceAgreement.status,
      'not_applicable',
    );
    // Explicit review: the equivalent doubling formula and wording change leave
    // the independently derived geometry and expected numbers unchanged.
    const rebound = await bind(String(index + 2));
    assert.deepEqual(
      rebound.cases.map((item) => item.expected),
      expectedValues,
    );
    for (const item of independentCases) {
      const checked = await verify(
        `rebound-${edit.name}-${item.width}`,
        item.width,
        referencePath,
      );
      assert.equal(
        checked.checks.independentReferenceAgreement.status,
        'passed',
      );
      assert.equal(
        checked.checks.independentReferenceAgreement.counts?.checked,
        2,
      );
    }
  }
  assert.notEqual(readFileSync(source, 'utf8'), authored);

  const reportsPath = join(project, 'reports.json');
  const reportsBefore = readFileSync(reportsPath);
  writeJson(reportsPath, [
    {
      id: 'composed-reference',
      title: 'Referenced rectangle pair',
      source: 'calculations/reference_trial/composed.cso.py',
      function: 'calculate',
      reference: 'guidance-trial/reference.json',
    },
  ]);
  try {
    const dev = await startDev({
      project,
      name: 'reference-authoring-dev',
      environment,
      logs: root,
    });
    try {
      const curl = OutputsSchema.parse(
        JSON.parse(
          await run({
            cwd: project,
            command: 'curl',
            args: [
              '--fail-with-body',
              '--silent',
              '--show-error',
              '-H',
              'content-type: application/json',
              '--data',
              JSON.stringify({ inputs: { length: 3, width: 4 } }),
              `${dev.origin}/api/reports/composed-reference/calculate`,
            ],
          }),
        ),
      );
      assert.deepEqual(curl, { total_area: 24 });
      const artifacts = [];
      for (const item of [
        { width: 4, totalArea: 24, status: 'passed' },
        { width: 5, totalArea: 30, status: 'not_applicable' },
      ] satisfies {
        width: number;
        totalArea: number;
        status: 'passed' | 'not_applicable';
      }[]) {
        const name = `reference-width-${item.width}`;
        const downloadPath = join(root, `${name}-browser.pdf`);
        const browserRun = await exerciseBrowser({
          origin: dev.origin,
          reportId: 'composed-reference',
          reportTitle: 'Referenced rectangle pair',
          width: String(item.width),
          initialText: ['Combined area', '12'],
          expectedText: [
            'Combined area',
            String(item.totalArea),
            'Rectangle dimensions',
          ],
          screenshot: join(root, `${name}-browser.png`),
          downloadPath,
          inputs: { length: 3, width: item.width },
          outputs: { total_area: item.totalArea },
          referenceStatus: item.status,
        });
        const artifact = await artifactSet({
          root,
          origin: dev.origin,
          run: browserRun,
          inputs: { length: 3, width: item.width },
          outputs: { total_area: item.totalArea },
          rows: [{ description: 'Combined area', unit: 'm^2' }],
          referencePath,
          referenceStatus: item.status,
          name,
          reportId: 'composed-reference',
        });
        assert.equal(
          hashBytes(readFileSync(downloadPath)),
          hashBytes(readFileSync(artifact.pdfPath)),
        );
        assert(
          readFileSync(artifact.htmlPath, 'utf8').includes(
            'data:image/svg+xml',
          ),
        );
        artifacts.push(artifact);
      }
      const evidence = {
        receipts,
        artifacts,
        referencePath,
        source,
        automatic: 'passed',
        visualInspection: 'pending',
        engineeringApproval: 'not_supplied',
      };
      writeJson(join(root, 'reference-authoring.json'), evidence);
      return evidence;
    } finally {
      await dev.stop();
    }
  } finally {
    writeFileSync(reportsPath, reportsBefore);
  }
}
