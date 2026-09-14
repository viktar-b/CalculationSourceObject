import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CalculationSourceObjectSchema } from '@viktar-b/cso-core';
import { prepareLegacyDocument } from '@viktar-b/cso-react';
import { loadExamples } from '../src/examples/gallery.ts';
import { createSheetExamples } from '../src/examples/sheet-gallery.ts';
import { loadPreparedDocuments } from '../src/examples/prepared-gallery.ts';

describe('host-supplied calculation data', () => {
  test('builds an empty gallery without a configured catalog', () => {
    expect(createSheetExamples('')).toEqual([]);
    expect(loadPreparedDocuments('')).toEqual([]);
  });
  test('loads validated documents from any supplied directory and rejects malformed data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cso-gallery-'));
    try {
      const source = {
        schemaVersion: '1.0.0',
        title: 'Input display',
        source: { id: 'synthetic', metadata: {} },
        rootSectionIds: ['root'],
        sections: [{ id: 'root', title: 'Inputs', items: [] }],
      };
      writeFileSync(join(directory, 'input.json'), JSON.stringify(source));
      expect(createSheetExamples(directory).map(({ label }) => label)).toEqual([
        'Input display',
      ]);
      writeFileSync(join(directory, 'invalid.json'), '{}');
      expect(() => createSheetExamples(directory)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test('uses Examples documents unless a CSO gallery override is supplied', () => {
    const examplesDirectory = mkdtempSync(join(tmpdir(), 'cso-examples-'));
    const galleryDirectory = mkdtempSync(join(tmpdir(), 'cso-gallery-'));
    const originalExamplesDirectory = process.env.CSO_EXAMPLES_DIRECTORY;
    const originalGalleryDirectory = process.env.CSO_GALLERY_DIRECTORY;
    try {
      const source = CalculationSourceObjectSchema.parse({
        schemaVersion: '1.0.0',
        title: 'Prepared input display',
        source: { id: 'synthetic', metadata: {} },
        rootSectionIds: ['root'],
        sections: [{ id: 'root', title: 'Inputs', items: [] }],
      });
      const document = prepareLegacyDocument({
        cso: source,
        fixtureId: 'synthetic',
        fixtureSha256: 'a'.repeat(64),
        manifest: { manifestVersion: '1', entries: [] },
        assets: [],
      });
      writeFileSync(
        join(examplesDirectory, 'prepared.prepared.json'),
        JSON.stringify(document),
      );
      writeFileSync(
        join(galleryDirectory, 'sheet.json'),
        JSON.stringify({ ...source, title: 'Sheet input display' }),
      );
      Reflect.deleteProperty(process.env, 'CSO_EXAMPLES_DIRECTORY');
      Reflect.deleteProperty(process.env, 'CSO_GALLERY_DIRECTORY');
      expect(loadExamples()).toEqual([]);
      expect(
        loadExamples({ examplesDirectory }).map(({ kind, label }) => ({
          kind,
          label,
        })),
      ).toEqual([{ kind: 'prepared', label: 'Prepared input display' }]);
      expect(
        loadExamples({ galleryDirectory, examplesDirectory }).map(
          ({ kind, label }) => ({ kind, label }),
        ),
      ).toEqual([{ kind: 'sheet', label: 'Sheet input display' }]);
      expect(loadExamples({ galleryDirectory: '', examplesDirectory })).toEqual(
        [],
      );
    } finally {
      if (originalExamplesDirectory === undefined) {
        Reflect.deleteProperty(process.env, 'CSO_EXAMPLES_DIRECTORY');
      } else {
        process.env.CSO_EXAMPLES_DIRECTORY = originalExamplesDirectory;
      }
      if (originalGalleryDirectory === undefined) {
        Reflect.deleteProperty(process.env, 'CSO_GALLERY_DIRECTORY');
      } else {
        process.env.CSO_GALLERY_DIRECTORY = originalGalleryDirectory;
      }
      rmSync(examplesDirectory, { recursive: true, force: true });
      rmSync(galleryDirectory, { recursive: true, force: true });
    }
  });
});
