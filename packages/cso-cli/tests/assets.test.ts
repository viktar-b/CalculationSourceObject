import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ExecutionPayloadSchema,
  namespacedId,
  sourceClosureHash,
} from '@cs-object/core';
import { afterEach, expect, test } from 'vitest';
import { captureAssets } from '../src/assets.ts';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const dataUrl =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(assetPath = 'diagram.svg') {
  const directory = mkdtempSync(join(tmpdir(), 'cso-assets-'));
  roots.push(directory);
  const root = join(directory, 'calculation');
  const sourcePath = join(root, 'report.cso.py');
  const imagePath = join(root, assetPath);
  mkdirSync(dirname(imagePath), { recursive: true });
  writeFileSync(sourcePath, 'pass\n');
  writeFileSync(imagePath, svg);
  const hash = (path: string) =>
    createHash('sha256').update(readFileSync(path)).digest('hex');
  const moduleId = 'report.cso.py';
  const sectionId = namespacedId('section', 'root', 'main');
  const sourceManifest = [{ moduleId, sha256: hash(sourcePath) }];
  const execution = ExecutionPayloadSchema.parse({
    cso: {
      schemaVersion: '1.0.0',
      title: 'Asset capture',
      source: { id: 'asset-capture', metadata: {} },
      rootSectionIds: [sectionId],
      sections: [{ id: sectionId, title: 'Assets', items: [] }],
    },
    entry: {
      moduleId,
      function: 'calculate',
      sourceHash: hash(sourcePath),
      invocationId: 'root',
      resolvedInputs: {},
    },
    sourceManifest,
    sourceClosureHash: sourceClosureHash(sourceManifest),
    invocations: [
      {
        id: 'root',
        moduleId,
        function: 'calculate',
        resolvedInputs: {},
        inputBindings: [],
        symbols: [],
      },
    ],
    observations: [],
    assets: [
      {
        id: 'diagram',
        moduleId,
        path: assetPath,
        mediaType: 'image/svg+xml',
        sha256: hash(imagePath),
      },
    ],
    versions: {
      pythonPackage: '0.1.0',
      pythonInterpreter: 'python',
      pythonVersion: '3.11.0',
    },
  });
  return { directory, root, sourcePath, imagePath, execution };
}

test.each(['..notes/diagram.svg', '..diagram.svg'])(
  'captures a contained asset named %s',
  (path) => {
    const { sourcePath, execution } = fixture(path);
    expect(captureAssets(sourcePath, execution)).toEqual([
      { asset: execution.assets[0], dataUrl },
    ]);
  },
);

test('rejects a directory link retargeted to a sibling after its asset hash was captured', () => {
  const { directory, root, sourcePath, imagePath, execution } =
    fixture('linked/diagram.svg');
  const inside = join(root, 'images');
  const link = dirname(imagePath);
  const outside = join(directory, 'calculation-sibling');
  renameSync(link, inside);
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(inside, link, linkType);
  expect(captureAssets(sourcePath, execution)).toEqual([
    { asset: execution.assets[0], dataUrl },
  ]);

  mkdirSync(outside);
  writeFileSync(join(outside, 'diagram.svg'), svg);
  unlinkSync(link);
  symlinkSync(outside, link, linkType);
  expect(() => captureAssets(sourcePath, execution)).toThrow(
    'Asset resolves outside the entry source directory',
  );
});

test('retains copied asset bytes and rejects changes after the recorded hash', () => {
  const { sourcePath, imagePath, execution } = fixture();
  const captured = captureAssets(sourcePath, execution);
  writeFileSync(
    imagePath,
    '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>',
  );
  expect(captured).toEqual([{ asset: execution.assets[0], dataUrl }]);
  expect(() => captureAssets(sourcePath, execution)).toThrow(
    'Asset bytes changed since Python capture',
  );
});

test('rejects a matching hash with an incorrect declared media signature', () => {
  const { sourcePath, execution } = fixture();
  execution.assets[0].mediaType = 'image/png';
  expect(() => captureAssets(sourcePath, execution)).toThrow(
    'Declared PNG has the wrong media signature',
  );
});
