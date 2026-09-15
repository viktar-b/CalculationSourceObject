import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CalculationSourceObjectSchema,
  PreparedDocumentSchema,
  sourceClosureHash,
} from '@cs-object/core';
import { prepareLegacyDocument } from '@cs-object/react';
import { describe, expect, test } from 'vitest';
import { loadExamples } from '../src/examples/gallery.ts';
import { PythonSourceBundleSchema } from '../src/examples/python-source.ts';

function sourceBundle() {
  const files = [
    { moduleId: 'constants.py', code: 'FACTOR = 2\n' },
    {
      moduleId: 'sample.cso.py',
      code: 'from constants import FACTOR\n\ndef sample(width):\n    return width * FACTOR\n',
    },
    { moduleId: '_cso_bindings/__init__.py', code: '' },
    {
      moduleId: 'utilities/__init__.py',
      code: 'from constants import FACTOR\n',
    },
  ].map((file) => ({
    ...file,
    sha256: createHash('sha256').update(file.code).digest('hex'),
  }));
  return PythonSourceBundleSchema.parse({
    version: '1',
    binding: {
      entryModuleId: 'sample.cso.py',
      entrySourceHash: files[1].sha256,
      sourceClosureHash: sourceClosureHash(
        files.map(({ moduleId, sha256 }) => ({ moduleId, sha256 })),
      ),
      function: 'sample',
      resolvedInputs: { width: 2 },
    },
    files,
  });
}

function prepared(binding: ReturnType<typeof sourceBundle>['binding']) {
  const sectionId = JSON.stringify(['section', 'root', 'inputs']);
  const document = prepareLegacyDocument({
    cso: CalculationSourceObjectSchema.parse({
      schemaVersion: '1.0.0',
      title: 'Synthetic source display',
      source: { id: 'sample', metadata: {} },
      rootSectionIds: [sectionId],
      sections: [{ id: sectionId, title: 'Inputs', items: [] }],
    }),
    fixtureId: 'sample',
    fixtureSha256: 'a'.repeat(64),
    assets: [],
    manifest: { manifestVersion: '1', entries: [] },
  });
  return PreparedDocumentSchema.parse({
    ...document,
    source: { kind: 'execution', ...binding },
    sections: document.sections.map((section) => ({
      ...section,
      localId: 'inputs',
      invocationId: 'root',
      location: {
        moduleId: binding.entryModuleId,
        start: { line: 1, column: 0 },
        end: { line: 1, column: 1 },
      },
    })),
  });
}

describe('Python sources for prepared examples', () => {
  test('loads optional source companions and binds them to the displayed execution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cso-source-gallery-'));
    const bundle = sourceBundle();
    const document = prepared(bundle.binding);
    try {
      writeFileSync(
        join(directory, 'sample.prepared.json'),
        JSON.stringify(document),
      );
      expect(loadExamples({ examplesDirectory: directory })[0]).toMatchObject({
        pythonFiles: [],
      });
      const sourcePath = join(directory, 'sample.source.json');
      writeFileSync(sourcePath, JSON.stringify(bundle));
      expect(loadExamples({ examplesDirectory: directory })[0]).toMatchObject({
        pythonFiles: [
          { moduleId: 'sample.cso.py', code: bundle.files[1].code },
          { moduleId: 'constants.py', code: bundle.files[0].code },
          { moduleId: 'utilities/__init__.py', code: bundle.files[3].code },
        ],
      });
      writeFileSync(
        sourcePath,
        JSON.stringify({
          ...bundle,
          binding: { ...bundle.binding, resolvedInputs: { width: 3 } },
        }),
      );
      expect(() => loadExamples({ examplesDirectory: directory })).toThrow(
        'does not match the prepared document',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('rejects changed source bytes, incomplete dependencies, duplicate files and wrong entry identity', () => {
    const bundle = sourceBundle();
    expect(() =>
      PythonSourceBundleSchema.parse({
        ...bundle,
        files: bundle.files.map((file) => ({
          ...file,
          code: `${file.code}# changed\n`,
        })),
      }),
    ).toThrow('source bytes');
    expect(() =>
      PythonSourceBundleSchema.parse({
        ...bundle,
        files: bundle.files.slice(1),
      }),
    ).toThrow('source closure');
    expect(() =>
      PythonSourceBundleSchema.parse({
        ...bundle,
        files: [...bundle.files, bundle.files[0]],
      }),
    ).toThrow('unique module paths');
    expect(() =>
      PythonSourceBundleSchema.parse({
        ...bundle,
        binding: { ...bundle.binding, entryModuleId: 'missing.cso.py' },
      }),
    ).toThrow('entry file');
    expect(() =>
      PythonSourceBundleSchema.parse({
        ...bundle,
        binding: { ...bundle.binding, entrySourceHash: 'f'.repeat(64) },
      }),
    ).toThrow('entry file');
  });
});
