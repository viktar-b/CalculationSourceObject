import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BoundPreparedDocumentSchema,
  CommandReportSchema,
  ExecutionResponseSchema,
} from '@viktar-b/cso-core';
import { expect, test } from 'vitest';
import { loadPreparedDocuments } from '../../apps/demo/src/examples/prepared-gallery.ts';
import { loadExamples } from '../../apps/demo/src/examples/gallery.ts';
import { prepareDemoExamples } from '../../scripts/prepare-demo-examples.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sourceDirectory = join(root, 'examples/two-panel');

test('prepares the canonical width-2 document with its execution and verification receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cso-demo-examples-'));
  try {
    const preparedDirectory = prepareDemoExamples({ directory });
    const documents = loadPreparedDocuments(preparedDirectory);
    expect(documents).toHaveLength(1);
    const [document] = documents;
    if (!document) {
      throw new Error('Missing prepared document');
    }
    if (document.source.kind !== 'execution') {
      throw new Error('Canonical document must bind the captured execution');
    }

    const execution = ExecutionResponseSchema.parse(
      JSON.parse(
        readFileSync(
          join(directory, 'receipts/two-panel-width-2.execution.json'),
          'utf8',
        ),
      ),
    );
    const verification = CommandReportSchema.parse(
      JSON.parse(
        readFileSync(
          join(directory, 'receipts/two-panel-width-2.verification.json'),
          'utf8',
        ),
      ),
    );
    if (!execution.ok) {
      throw new Error('Canonical execution failed');
    }

    const gallery = loadExamples({ examplesDirectory: preparedDirectory });
    const example = gallery[0];
    if (!example || example.kind !== 'prepared') {
      throw new Error('Missing prepared example');
    }
    expect(example.pythonFiles[0]?.moduleId).toBe(
      execution.execution.entry.moduleId,
    );
    expect(example.pythonFiles).toHaveLength(
      execution.execution.sourceManifest.length,
    );
    for (const file of example.pythonFiles) {
      expect(file.code).toBe(
        readFileSync(join(directory, 'source', file.moduleId), 'utf8'),
      );
    }

    expect(verification.ok).toBe(true);
    expect(verification.checks.independentReferenceAgreement.status).toBe(
      'passed',
    );
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: execution.execution,
        document,
      }).success,
    ).toBe(true);
    expect(document.source.entrySourceHash).toBe(
      createHash('sha256')
        .update(readFileSync(join(sourceDirectory, 'estimate.cso.py')))
        .digest('hex'),
    );
    expect(document.source.sourceClosureHash).toBe(
      verification.provenance.sourceClosureHash,
    );
    expect(
      execution.execution.observations.filter(({ kind }) => kind === 'input'),
    ).toHaveLength(5);

    const items = document.sections.flatMap(({ items }) => items);
    const symbols = items.flatMap((item) =>
      item.kind === 'symbol' ? [item.symbol] : [],
    );
    expect(symbols).toHaveLength(12);
    expect(items.filter(({ kind }) => kind === 'figure')).toHaveLength(1);
    expect(
      items.flatMap((item) =>
        item.kind === 'text' ? [item.text.content] : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('no openings and no waste allowance'),
        expect.stringContaining('pan = panel; fp = first panel'),
      ]),
    );
    expect(
      symbols.find(({ glyph }) => glyph === 'A_{tot}')?.valueTree.result,
    ).toEqual({ kind: 'number', value: 14 });
    const volume = symbols.find(({ glyph }) => glyph === 'V_{mat}')?.valueTree
      .result;
    const mass = symbols.find(({ glyph }) => glyph === 'm_{mat}')?.valueTree
      .result;
    if (volume?.kind !== 'number' || mass?.kind !== 'number') {
      throw new Error('Missing material totals');
    }
    expect(volume.value).toBeCloseTo(1.4, 9);
    expect(mass.value).toBeCloseTo(700, 9);
    expect(document.assets).toHaveLength(1);
    expect(document.assets[0]?.asset.sha256).toBe(
      createHash('sha256')
        .update(readFileSync(join(sourceDirectory, 'panels.svg')))
        .digest('hex'),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);

test('rejects a stale canonical reference', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cso-demo-stale-reference-'));
  try {
    const changed = join(directory, 'changed');
    const output = join(directory, 'output');
    cpSync(sourceDirectory, changed, { recursive: true });
    const entry = join(changed, 'estimate.cso.py');
    writeFileSync(
      entry,
      readFileSync(entry, 'utf8').replace(
        'complete reusable calculation trace.',
        'complete reusable calculation trace!',
      ),
    );
    expect(() =>
      prepareDemoExamples({ directory: output, sourceDirectory: changed }),
    ).toThrow('the canonical reference did not pass');
    expect(readdirSync(join(output, 'prepared'))).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);

test('reports an unavailable Python interpreter', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cso-demo-missing-python-'));
  const originalPython = process.env.PYTHON;
  try {
    process.env.PYTHON = join(directory, 'missing-python');
    expect(() => prepareDemoExamples({ directory })).toThrow(
      'Canonical example bindings could not be generated',
    );
    expect(readdirSync(join(directory, 'prepared'))).toEqual([]);
  } finally {
    if (originalPython === undefined) {
      Reflect.deleteProperty(process.env, 'PYTHON');
    } else {
      process.env.PYTHON = originalPython;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
