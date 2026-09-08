import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ComparisonSchema,
  ModuleIdSchema,
  NodeAddressSchema,
  ProvenanceSchema,
  ResolvedInputsSchema,
  SourceSpanSchema,
  SupportedNumberSchema,
  ExecutionBindingSchema,
  executionBindingKey,
  namespacedId,
  serializeSourceManifest,
  sourceClosureHash,
} from '../src/contracts/common.ts';
import {
  ReferenceFileSchema,
  referenceBindingKey,
} from '../src/contracts/reference.ts';

const hash = 'a'.repeat(64);
describe('shared contract boundaries', () => {
  it('binds each zero sign exactly, independently of input key order', () => {
    const binding = ExecutionBindingSchema.parse({
      entryModuleId: 'zero.cso.py',
      entrySourceHash: hash,
      sourceClosureHash: hash,
      function: 'calculate',
      resolvedInputs: { z: 0, a: -0, scale: 2 },
    });
    const reordered = {
      ...binding,
      resolvedInputs: { scale: 2, a: -0, z: 0 },
    };
    expect(Object.is(binding.resolvedInputs.a, -0)).toBe(true);
    expect(Object.is(binding.resolvedInputs.z, 0)).toBe(true);
    expect(executionBindingKey(binding)).toBe(referenceBindingKey(reordered));
    for (const resolvedInputs of [
      { z: 0, a: 0, scale: 2 },
      { z: -0, a: -0, scale: 2 },
      { z: -0, a: 0, scale: 2 },
      { z: 0, a: -0, scale: 3 },
    ]) {
      expect(executionBindingKey({ ...binding, resolvedInputs })).not.toBe(
        executionBindingKey(binding),
      );
    }
    const positive = { ...binding, resolvedInputs: { a: 0, z: 2 } };
    expect(executionBindingKey(positive)).toBe(
      JSON.stringify([
        'zero.cso.py',
        hash,
        hash,
        'calculate',
        [
          ['a', 0],
          ['z', 2],
        ],
      ]),
    );
  });

  it('allows both zero signs in one reference file and rejects same-sign duplicates', () => {
    const reference = (value: number, id: string) => ({
      id,
      revision: '1',
      basis: {
        method: 'Arithmetic',
        derivation: 'x * 2',
        sourceDescription: 'Synthetic case',
      },
      binding: {
        entryModuleId: 'zero.cso.py',
        entrySourceHash: hash,
        sourceClosureHash: hash,
        function: 'calculate',
        resolvedInputs: { x: value, factor: 2 },
      },
      expected: [],
    });
    const file = ReferenceFileSchema.parse({
      referenceVersion: '1',
      cases: [reference(0, 'positive'), reference(-0, 'negative')],
    });
    expect(file.cases).toHaveLength(2);
    for (const value of [0, -0]) {
      const duplicate = reference(value, 'duplicate');
      duplicate.binding.resolvedInputs = { factor: 2, x: value };
      const result = ReferenceFileSchema.safeParse({
        ...file,
        cases: [...file.cases, duplicate],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              params: { diagnosticCode: 'DUPLICATE_REFERENCE_BINDING' },
            }),
          ]),
        );
      }
    }
  });

  it('keeps every valid Python parameter key, including inherited object names', () => {
    const raw = JSON.parse(
      '{"__proto__":2,"constructor":3,"toString":4,"材料":5}',
    );
    const parsed = ResolvedInputsSchema.parse(raw);
    expect(Object.keys(parsed)).toEqual(Object.keys(raw));
    expect(parsed).toEqual(raw);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
  it.each([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
    9007199254740992,
  ])('rejects unsupported numeric evidence %s', (value) => {
    expect(SupportedNumberSchema.safeParse(value).success).toBe(false);
    expect(
      ComparisonSchema.safeParse({
        actual: value,
        expected: 1,
        absoluteError: 1,
        absoluteTolerance: 1e-9,
        relativeTolerance: 1e-12,
      }).success,
    ).toBe(false);
  });
  it('validates derived absolute error without changing compared values', () => {
    const comparison = {
      actual: 999,
      expected: 8,
      absoluteError: 991,
      absoluteTolerance: 1e-9,
      relativeTolerance: 1e-12,
    };
    expect(ComparisonSchema.parse(comparison)).toEqual(comparison);
    const invalid = ComparisonSchema.safeParse({
      ...comparison,
      absoluteError: 0,
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            params: { diagnosticCode: 'COMPARISON_ERROR_MISMATCH' },
          }),
        ]),
      );
    for (const [actual, expected] of [
      [-2, 3],
      [0.1, 0.3],
      [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      [1e-300, 0],
      [-0, 0],
    ]) {
      expect(
        ComparisonSchema.parse({
          ...comparison,
          actual,
          expected,
          absoluteError: Math.abs(actual - expected),
        }).actual,
      ).toBe(actual);
    }
  });
  it('keeps supported signed and fractional values without coercion', () => {
    for (const value of [
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
      0,
      -0,
      1e-300,
      0.1,
    ]) {
      expect(Object.is(SupportedNumberSchema.parse(value), value)).toBe(true);
    }
    expect(SupportedNumberSchema.safeParse('2').success).toBe(false);
  });
  it('rejects ambiguous addresses and reversed byte spans', () => {
    expect(NodeAddressSchema.safeParse({ nodeKey: 'n1' }).success).toBe(false);
    expect(
      SourceSpanSchema.safeParse({
        moduleId: 'a.cso.py',
        start: { line: 2, column: 4 },
        end: { line: 2, column: 3 },
      }).success,
    ).toBe(false);
    expect(
      SourceSpanSchema.safeParse({
        moduleId: 'a.cso.py',
        start: { line: 0, column: 0 },
        end: { line: 1, column: 0 },
      }).success,
    ).toBe(false);
  });
  it('rejects noncanonical or unencodable module identities', () => {
    for (const moduleId of [
      '/a.py',
      '../a.py',
      'a/./b.py',
      'a//b.py',
      'C:/a.py',
      'a\\b.py',
      'a/../b.py',
      'bad\ud800.py',
    ]) {
      expect(ModuleIdSchema.safeParse(moduleId).success).toBe(false);
    }
    expect(ModuleIdSchema.parse('材料/géométrie.cso.py')).toBe(
      '材料/géométrie.cso.py',
    );
    expect(() => namespacedId('symbol', 'root', '\ud800')).toThrow();
  });
  it('sorts module IDs by UTF-8 bytes, not UTF-16 or locale, without normalizing accents', () => {
    const manifest = ['\u{10000}.py', '\ue000.py', 'e\u0301.py', 'é.py'].map(
      (moduleId) => ({ moduleId, sha256: hash }),
    );
    const canonical = serializeSourceManifest(manifest);
    expect(
      JSON.parse(canonical).map(([moduleId]: [string, string]) => moduleId),
    ).toEqual(['e\u0301.py', 'é.py', '\ue000.py', '\u{10000}.py']);
    expect(sourceClosureHash(manifest)).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );
  });
  it('retains known interpreter information on partial failures', () => {
    expect(
      ProvenanceSchema.parse({
        versions: { pythonInterpreter: '/venv/bin/python' },
      }),
    ).toEqual({ versions: { pythonInterpreter: '/venv/bin/python' } });
  });
  it('returns parse failures instead of throwing for dirty nested manifest values', () => {
    for (const sourceManifest of [
      [
        { moduleId: 'a.py', sha256: hash },
        { moduleId: 'a.py', sha256: hash },
      ],
      [{ moduleId: '../a.py', sha256: hash }],
      [{ moduleId: 'a.py', sha256: 'invalid' }],
    ]) {
      expect(() =>
        ProvenanceSchema.safeParse({ sourceManifest, sourceClosureHash: hash }),
      ).not.toThrow();
      expect(
        ProvenanceSchema.safeParse({ sourceManifest, sourceClosureHash: hash })
          .success,
      ).toBe(false);
    }
  });
});
