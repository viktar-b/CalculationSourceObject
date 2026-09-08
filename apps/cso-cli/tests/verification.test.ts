import { describe, expect, test } from 'vitest';
import { parseStrictJson } from '../src/strict-json.ts';
import { parseVerifiedArgs, verifiedHelp } from '../src/verified-arguments.ts';

const base = ['input with spaces.cso.py', '--function', 'calculate'];
describe('verified usage and strict capture', () => {
  test('resolves caller paths, normalizes identifiers and keeps distinct inputs', () => {
    expect(
      parseVerifiedArgs('verify', [
        ...base,
        '--input',
        'K=2',
        '--input',
        '__proto__=-3',
        '--reference',
        'reference.json',
        '--format',
        'json',
      ]),
    ).toEqual({
      command: 'verify',
      sourcePath: `${process.cwd()}/input with spaces.cso.py`,
      functionName: 'calculate',
      inputs: Object.fromEntries([
        ['K', 2],
        ['__proto__', -3],
      ]),
      referencePath: `${process.cwd()}/reference.json`,
    });
  });
  test.each([
    ['--input', 'width=2', '--input', 'width=1'],
    ['--input', 'K=2', '--input', 'K=3'],
    ['--reference', 'a.json', '--reference', 'b.json'],
    ['--format', 'yaml'],
    ['--format', 'json', '--format', 'json'],
    ['--reference'],
    ['--input', 'width=NaN'],
    ['--input', 'width=9007199254740993'],
    ['--out', 'out.pdf'],
    ['--inputs-json', '{}'],
    ['extra.cso.py'],
  ])('rejects ambiguous usage %j', (...args) => {
    expect(() => parseVerifiedArgs('verify', [...base, ...args])).toThrow();
  });
  test('requires PDF destination and documents verified generation', () => {
    expect(() => parseVerifiedArgs('pdf', base)).toThrow('--out is required');
    expect(verifiedHelp('pdf')).toContain('atomically replace');
    expect(verifiedHelp('verify')).toContain('cso verify <file.cso.py>');
  });
  test('pdf accepts --no-evidence and retains evidence by default', () => {
    expect(
      parseVerifiedArgs('pdf', [...base, '--out', 'out.pdf']),
    ).toMatchObject({
      command: 'pdf',
      retainEvidence: true,
      outPath: `${process.cwd()}/out.pdf`,
    });
    expect(
      parseVerifiedArgs('pdf', [
        ...base,
        '--out',
        'out.pdf',
        '--no-evidence',
        '--format',
        'json',
      ]),
    ).toMatchObject({ retainEvidence: false });
    expect(verifiedHelp('pdf')).toContain('--no-evidence');
  });
  test.each<Parameters<typeof parseVerifiedArgs>>([
    ['verify', [...base, '--no-evidence']],
    ['pdf', [...base, '--out', 'out.pdf', '--no-evidence', '--no-evidence']],
  ])('rejects invalid --no-evidence usage for %s', (command, args) => {
    expect(() => parseVerifiedArgs(command, args)).toThrow();
  });
  test.each([
    '{"x":1,"x":2}',
    '{"a":[{"x":1,"\\u0078":2}]}',
    '{"__proto__":{},"__proto__":{}}',
    '{"constructor":1,"constructor":2}',
  ])('rejects duplicate decoded reference keys %s', (text) => {
    expect(() => parseStrictJson(text)).toThrow('Duplicate JSON key');
  });
  test('keeps strings, arrays and separate object key scopes intact', () => {
    const text = '{"x":[{"x":1},{"x":2}],"str":"\\"x\\":false","__proto__":3}';
    expect(parseStrictJson(text)).toEqual(JSON.parse(text));
  });
});
