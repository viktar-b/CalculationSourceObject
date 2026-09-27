import { z } from 'zod';
import {
  DiagnosticSchema,
  HashSchema,
  ModuleIdSchema,
  NonemptyStringSchema,
  PythonIdentifierSchema,
  SourceManifestSchema,
  sourceClosureHash,
} from './common.ts';
import { NumericKindSchema, numericValueIssue } from './numbers.ts';

const DefinitionOutputSchema = z.strictObject({
  name: NonemptyStringSchema,
  numericType: NumericKindSchema,
  glyph: NonemptyStringSchema,
  description: NonemptyStringSchema,
  unit: z.string(),
});

const DefinitionInputSchema = z
  .strictObject({
    name: PythonIdentifierSchema,
    numericType: NumericKindSchema,
    glyph: NonemptyStringSchema,
    description: NonemptyStringSchema,
    unit: z.string(),
    default: z.number().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.default === undefined) return;
    const issue = numericValueIssue({
      value: input.default,
      numericKind: input.numericType,
    });
    if (issue)
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: issue.message,
        params: { diagnosticCode: issue.code },
      });
  });

export const CalculationDefinitionSchema = z
  .strictObject({
    version: z.literal('1'),
    function: PythonIdentifierSchema,
    fingerprint: HashSchema,
    entryModuleId: ModuleIdSchema,
    entrySourceHash: HashSchema,
    sourceManifest: SourceManifestSchema,
    sourceClosureHash: HashSchema,
    inputs: z.array(DefinitionInputSchema),
    outputs: z.array(DefinitionOutputSchema),
  })
  .superRefine((definition, ctx) => {
    const manifest = SourceManifestSchema.safeParse(definition.sourceManifest);
    if (
      manifest.success &&
      sourceClosureHash(manifest.data) !== definition.sourceClosureHash
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceClosureHash'],
        message: 'Source closure hash does not match manifest',
        params: { diagnosticCode: 'SOURCE_CLOSURE_MISMATCH' },
      });
    }
    if (manifest.success) {
      const entry = manifest.data.find(
        (item) => item.moduleId === definition.entryModuleId,
      );
      if (!entry || entry.sha256 !== definition.entrySourceHash)
        ctx.addIssue({
          code: 'custom',
          path: ['entryModuleId'],
          message: 'Entry does not match source manifest',
          params: { diagnosticCode: 'ENTRY_MANIFEST_MISMATCH' },
        });
    }
    for (const [field, items] of [
      ['inputs', definition.inputs],
      ['outputs', definition.outputs],
    ] as const) {
      const seen = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (seen.has(item.name))
          ctx.addIssue({
            code: 'custom',
            path: [field, index, 'name'],
            message: `Duplicate definition ${field.slice(0, -1)} name`,
            params: {
              diagnosticCode: `DUPLICATE_DEFINITION_${field.slice(0, -1).toUpperCase()}`,
            },
          });
        seen.add(item.name);
      }
    }
  });

export const CalculationDefinitionResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    definition: CalculationDefinitionSchema,
    diagnostics: z.array(DiagnosticSchema).length(0),
  }),
  z.strictObject({
    ok: z.literal(false),
    diagnostics: z.array(DiagnosticSchema).min(1),
  }),
]);

export type CalculationDefinition = z.infer<typeof CalculationDefinitionSchema>;
export type CalculationDefinitionResponse = z.infer<
  typeof CalculationDefinitionResponseSchema
>;
