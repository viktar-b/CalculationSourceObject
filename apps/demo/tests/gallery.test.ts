import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
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
});
