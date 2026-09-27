import { afterEach, expect, test } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { sha256 } from '../src/assets.ts';
import { jsonBytes, publishPdfEvidence } from '../src/evidence.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function published(options: ReturnType<typeof publication>) {
  const result = publishPdfEvidence(options);
  if (!result) throw new Error('expected evidence bundle');
  return result;
}

function publication() {
  const root = mkdtempSync(join(tmpdir(), 'cso-evidence-test-'));
  roots.push(root);
  const outPath = join(root, 'calculation.pdf');
  const pdf = Buffer.from('%PDF-test');
  const reportBytes = jsonBytes({
    output: { path: outPath, sha256: sha256(pdf) },
    zero: -0,
  });
  return {
    outPath,
    pdf,
    reportBytes,
    presentation: [],
    retained: {
      payloads: [
        {
          path: 'execution.json',
          bytes: Buffer.from('{ "zero": -0.0, "__proto__": false }\n'),
        },
      ],
      retainedFields: [],
    },
  };
}

test('publishes exact payloads and prospective report binding before replacing PDF; identical bundle reuse is immutable', () => {
  const options = publication();
  writeFileSync(options.outPath, 'previous');
  const result = published(options);
  const manifestBytes = readFileSync(result.path);
  expect(sha256(manifestBytes)).toBe(result.sha256);
  expect(dirname(result.path)).toBe(
    `${options.outPath}.evidence/${result.sha256}`,
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  expect(manifest.prospectiveCommandReport.sha256).toBe(
    sha256(options.reportBytes),
  );
  expect(readFileSync(join(dirname(result.path), 'execution.json'))).toEqual(
    options.retained.payloads[0].bytes,
  );
  expect(readFileSync(options.outPath)).toEqual(options.pdf);
  expect(publishPdfEvidence(options)).toEqual(result);
  expect(readFileSync(result.path)).toEqual(manifestBytes);
  expect(readdirSync(`${options.outPath}.evidence`)).toEqual([result.sha256]);
});

test('evidence directory write failure preserves an existing PDF and removes the sibling temporary', () => {
  const options = publication();
  writeFileSync(options.outPath, 'previous');
  writeFileSync(`${options.outPath}.evidence`, 'obstruction');
  expect(() => publishPdfEvidence(options)).toThrow();
  expect(readFileSync(options.outPath, 'utf8')).toBe('previous');
  expect(readdirSync(dirname(options.outPath)).sort()).toEqual([
    'calculation.pdf',
    'calculation.pdf.evidence',
  ]);
});

test('failed final PDF replacement can retain a complete unused bundle, without a success receipt', () => {
  const options = publication();
  mkdirSync(options.outPath);
  writeFileSync(join(options.outPath, 'previous'), 'preserved');
  expect(() => publishPdfEvidence(options)).toThrow();
  expect(readFileSync(join(options.outPath, 'previous'), 'utf8')).toBe(
    'preserved',
  );
  const names = readdirSync(`${options.outPath}.evidence`);
  expect(names).toHaveLength(1);
  const manifest = JSON.parse(
    readFileSync(
      join(`${options.outPath}.evidence`, names[0], 'manifest.json'),
      'utf8',
    ),
  );
  expect(manifest.prospectiveCommandReport.publication).toContain(
    'not a publication receipt',
  );
  expect(
    readdirSync(dirname(options.outPath)).some((name) => name.endsWith('.tmp')),
  ).toBe(false);
});

test('omitting evidence writes only the PDF and leaves no sibling bundle', () => {
  const options = publication();
  writeFileSync(options.outPath, 'previous');
  expect(
    publishPdfEvidence({ ...options, retainEvidence: false }),
  ).toBeUndefined();
  expect(readFileSync(options.outPath)).toEqual(options.pdf);
  expect(existsSync(`${options.outPath}.evidence`)).toBe(false);
  expect(readdirSync(dirname(options.outPath))).toEqual(['calculation.pdf']);
});

test('omitting evidence preserves an existing PDF when replacement fails', () => {
  const options = publication();
  mkdirSync(options.outPath);
  writeFileSync(join(options.outPath, 'previous'), 'preserved');
  expect(() =>
    publishPdfEvidence({ ...options, retainEvidence: false }),
  ).toThrow();
  expect(readFileSync(join(options.outPath, 'previous'), 'utf8')).toBe(
    'preserved',
  );
  expect(existsSync(`${options.outPath}.evidence`)).toBe(false);
  expect(
    readdirSync(dirname(options.outPath)).some((name) => name.endsWith('.tmp')),
  ).toBe(false);
});

test('an existing bundle with altered bytes is never reused or overwritten', () => {
  const options = publication();
  const result = published(options);
  writeFileSync(join(dirname(result.path), 'execution.json'), 'altered');
  writeFileSync(options.outPath, 'previous');
  expect(() => publishPdfEvidence(options)).toThrow();
  expect(readFileSync(options.outPath, 'utf8')).toBe('previous');
  expect(
    readFileSync(join(dirname(result.path), 'execution.json'), 'utf8'),
  ).toBe('altered');
  expect(readdirSync(`${options.outPath}.evidence`)).toEqual([result.sha256]);
});
