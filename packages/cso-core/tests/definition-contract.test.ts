import { describe, expect, it } from 'vitest';
import {
  CalculationDefinitionResponseSchema,
  CalculationDefinitionSchema,
  sourceClosureHash,
} from '../src/index.ts';

const sourceManifest = [
  { moduleId: 'calculation.cso.py', sha256: 'a'.repeat(64) },
];
const definition = {
  version: '1',
  function: 'calculate',
  fingerprint: 'b'.repeat(64),
  entryModuleId: sourceManifest[0].moduleId,
  entrySourceHash: sourceManifest[0].sha256,
  sourceManifest,
  sourceClosureHash: sourceClosureHash(sourceManifest),
  inputs: [
    {
      name: 'load',
      numericType: 'float',
      glyph: 'P_{load}',
      description: 'Applied load',
      unit: 'N',
      default: 1e100,
    },
  ],
  outputs: [
    {
      name: 'stress',
      numericType: 'float',
      glyph: 's_{out}',
      description: 'Stress',
      unit: 'Pa',
    },
  ],
} as const;

describe('calculation definition contract', () => {
  it('accepts a static response and preserves a wide finite float default', () => {
    const response = CalculationDefinitionResponseSchema.parse({
      ok: true,
      definition,
      diagnostics: [],
    });
    expect(response.ok && response.definition.inputs[0]?.default).toBe(1e100);
  });

  it('rejects duplicate names, mismatched integer defaults and closure drift', () => {
    const cases = [
      {
        value: { ...definition, inputs: [...definition.inputs, definition.inputs[0]] },
        code: 'DUPLICATE_DEFINITION_INPUT',
      },
      {
        value: { ...definition, outputs: [...definition.outputs, definition.outputs[0]] },
        code: 'DUPLICATE_DEFINITION_OUTPUT',
      },
      {
        value: {
          ...definition,
          inputs: [{ ...definition.inputs[0], numericType: 'int', default: 1.5 }],
        },
        code: 'NUMERIC_KIND_MISMATCH',
      },
      {
        value: { ...definition, sourceClosureHash: 'c'.repeat(64) },
        code: 'SOURCE_CLOSURE_MISMATCH',
      },
      {
        value: { ...definition, entryModuleId: 'other.cso.py' },
        code: 'ENTRY_MANIFEST_MISMATCH',
      },
    ];
    for (const { value, code } of cases) {
      const result = CalculationDefinitionSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ params: { diagnosticCode: code } }),
          ]),
        );
    }
    const duplicateManifest = {
      ...definition,
      sourceManifest: [...sourceManifest, sourceManifest[0]],
    };
    expect(() =>
      CalculationDefinitionSchema.safeParse(duplicateManifest),
    ).not.toThrow();
    expect(CalculationDefinitionSchema.safeParse(duplicateManifest).success).toBe(
      false,
    );
  });
});
