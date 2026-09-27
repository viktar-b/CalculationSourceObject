import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';
import {
  NumericKindSchema,
  SupportedNumberSchema,
  numericValueIssue,
} from './numbers.ts';
import type {
  CalculationSourceObject,
  CalculationSourceSymbol,
} from '../calculation-source/object-schema.ts';
export { SupportedNumberSchema } from './numbers.ts';

const invalidUnicodePattern = /[\uD800-\uDFFF]/u;
const absoluteSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;
export const NonemptyStringSchema = z.string().min(1);
const UnicodeStringSchema = NonemptyStringSchema.refine(
  (value) => !invalidUnicodePattern.test(value),
  {
    message: 'Expected Unicode scalar values',
    params: { diagnosticCode: 'INVALID_UNICODE' },
  },
);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ModuleIdSchema = UnicodeStringSchema.refine(
  (value) =>
    !(
      value.includes('\\') ||
      value.includes('\0') ||
      absoluteSchemePattern.test(value)
    ) &&
    value
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..'),
  {
    message: 'Expected a normalized entry-relative POSIX module path',
    params: { diagnosticCode: 'INVALID_MODULE_ID' },
  },
);
export const PythonIdentifierSchema = UnicodeStringSchema.regex(
  /^(?:_|\p{ID_Start})(?:_|\p{ID_Continue})*$/u,
);
const parameterMapSchema = <T>(valueSchema: z.ZodType<T>) =>
  z
    .unknown()
    .transform((value, ctx) => {
      if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Expected a parameter object',
          params: { diagnosticCode: 'INVALID_RESOLVED_INPUTS' },
        });
        return z.NEVER;
      }
      return Object.entries(value);
    })
    .pipe(z.array(z.tuple([PythonIdentifierSchema, valueSchema])))
    .transform((entries): Record<string, T> => Object.fromEntries(entries));

export const ResolvedInputsSchema = parameterMapSchema(SupportedNumberSchema);
const FiniteInputsSchema = parameterMapSchema(z.number());
const InputKindsSchema = parameterMapSchema(NumericKindSchema);
const OptionalResolvedInputEvidenceSchema = z
  .strictObject({
    resolvedInputs: FiniteInputsSchema.optional(),
    resolvedInputKinds: InputKindsSchema.optional(),
  })
  .superRefine(({ resolvedInputs, resolvedInputKinds }, ctx) => {
    for (const name of Object.keys(resolvedInputKinds ?? {})) {
      if (!resolvedInputs || !Object.hasOwn(resolvedInputs, name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['resolvedInputKinds', name],
          message: 'Numeric kind must name a resolved input',
          params: { diagnosticCode: 'ORPHAN_INPUT_NUMERIC_KIND' },
        });
      }
    }
    for (const [name, value] of Object.entries(resolvedInputs ?? {})) {
      const numericKind =
        resolvedInputKinds && Object.hasOwn(resolvedInputKinds, name)
          ? resolvedInputKinds[name]
          : undefined;
      const issue = numericValueIssue({ value, numericKind });
      if (issue)
        ctx.addIssue({
          code: 'custom',
          path: ['resolvedInputs', name],
          message: issue.message,
          params: { diagnosticCode: issue.code },
        });
    }
  });

/** Extend this record, rather than spreading its fields and losing validation. */
export const ResolvedInputEvidenceSchema =
  OptionalResolvedInputEvidenceSchema.safeExtend({
    resolvedInputs: FiniteInputsSchema,
  });

export const resolvedInputKind = (
  record: z.infer<typeof OptionalResolvedInputEvidenceSchema>,
  name: string,
) =>
  record.resolvedInputKinds && Object.hasOwn(record.resolvedInputKinds, name)
    ? record.resolvedInputKinds[name]
    : undefined;
const PositionSchema = z.strictObject({
  line: z.number().int().min(1),
  column: z.number().int().min(0),
});
export const SourceSpanSchema = z
  .strictObject({
    moduleId: ModuleIdSchema,
    start: PositionSchema,
    end: PositionSchema,
  })
  .refine(
    ({ start, end }) =>
      end.line > start.line ||
      (end.line === start.line && end.column >= start.column),
    {
      message: 'Source span is reversed',
      params: { diagnosticCode: 'INVALID_SOURCE_SPAN' },
    },
  );
export const NodeAddressSchema = z.strictObject({
  symbolId: UnicodeStringSchema,
  nodeKey: NonemptyStringSchema,
});
export const SourceManifestEntrySchema = z.strictObject({
  moduleId: ModuleIdSchema,
  sha256: HashSchema,
});
export const SourceManifestSchema = z
  .array(SourceManifestEntrySchema)
  .min(1)
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of manifest.entries()) {
      if (seen.has(entry.moduleId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate module identity',
          path: [index, 'moduleId'],
          params: { diagnosticCode: 'DUPLICATE_MODULE_ID' },
        });
      }
      seen.add(entry.moduleId);
    }
  });
export const AssetRecordSchema = z.strictObject({
  id: UnicodeStringSchema,
  moduleId: ModuleIdSchema,
  path: UnicodeStringSchema.refine(
    (value) =>
      !(
        value.startsWith('/') ||
        value.includes('\\') ||
        value.includes('\0') ||
        absoluteSchemePattern.test(value)
      ),
    'Expected a module-relative asset path',
  ),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  sha256: HashSchema,
});
export const VersionsSchema = z.strictObject({
  pythonPackage: NonemptyStringSchema,
  pythonInterpreter: NonemptyStringSchema,
  pythonVersion: NonemptyStringSchema,
});
export const ComparisonSchema = z
  .strictObject({
    actual: z.number(),
    expected: z.number(),
    absoluteError: z.union([z.number().nonnegative(), z.literal('overflow')]),
    absoluteTolerance: z.literal(1e-9),
    relativeTolerance: z.literal(1e-12),
    formulaValue: z.number().optional(),
    referenceRevision: NonemptyStringSchema.optional(),
  })
  .refine(
    (comparison) =>
      comparison.absoluteError ===
      (Number.isFinite(Math.abs(comparison.actual - comparison.expected))
        ? Math.abs(comparison.actual - comparison.expected)
        : 'overflow'),
    {
      message:
        'Absolute error must equal the absolute difference of the compared values',
      path: ['absoluteError'],
      params: { diagnosticCode: 'COMPARISON_ERROR_MISMATCH' },
    },
  );
export const DiagnosticStageSchema = z.enum([
  'usage',
  'source',
  'execution',
  'contract',
  'verification',
  'reference',
  'document',
  'rendering',
  'write',
]);
export const CheckNameSchema = z.enum([
  'executionValidity',
  'inputConsistency',
  'constantConsistency',
  'formulaConsistency',
  'outputConsistency',
  'sourceToDocumentConsistency',
  'independentReferenceAgreement',
  'documentContent',
  'rendering',
  'visualInspection',
]);
export const DiagnosticSchema = z
  .strictObject({
    code: NonemptyStringSchema,
    message: NonemptyStringSchema,
    stage: DiagnosticStageSchema,
    check: CheckNameSchema.optional(),
    symbolId: UnicodeStringSchema.optional(),
    nodeKey: NonemptyStringSchema.optional(),
    invocationId: UnicodeStringSchema.optional(),
    location: SourceSpanSchema.optional(),
    relatedLocations: z.array(SourceSpanSchema).optional(),
    callChain: z.array(SourceSpanSchema).optional(),
    comparison: ComparisonSchema.optional(),
    layout: z
      .strictObject({
        media: z.enum(['screen', 'print']),
        sourcePlacementId: UnicodeStringSchema.optional(),
        selector: NonemptyStringSchema,
        left: z.number(),
        right: z.number(),
        containerLeft: z.number(),
        containerRight: z.number(),
        overflowPx: z.number().nonnegative(),
      })
      .optional(),
    valueDisplay: z
      .strictObject({
        kind: z.enum(['python-int', 'python-float', 'unsupported']),
        text: NonemptyStringSchema,
      })
      .optional(),
  })
  .refine(
    (value) => value.nodeKey === undefined || value.symbolId !== undefined,
    {
      message: 'A node diagnostic needs its symbol identity',
      params: { diagnosticCode: 'UNQUALIFIED_NODE_ADDRESS' },
    },
  );
export const ProvenanceSchema = OptionalResolvedInputEvidenceSchema.safeExtend({
  entryModuleId: ModuleIdSchema.optional(),
  entrySourceHash: HashSchema.optional(),
  sourceClosureHash: HashSchema.optional(),
  function: PythonIdentifierSchema.optional(),
  sourceManifest: SourceManifestSchema.optional(),
  versions: VersionsSchema.partial().optional(),
  reference: z
    .strictObject({
      path: NonemptyStringSchema,
      sha256: HashSchema,
      revisions: z.array(NonemptyStringSchema),
    })
    .optional(),
}).superRefine((value, ctx) => {
  if (
    value.sourceManifest &&
    SourceManifestSchema.safeParse(value.sourceManifest).success &&
    value.sourceClosureHash &&
    sourceClosureHash(value.sourceManifest) !== value.sourceClosureHash
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Source closure hash does not match manifest',
      path: ['sourceClosureHash'],
      params: { diagnosticCode: 'SOURCE_CLOSURE_MISMATCH' },
    });
  }
  if (value.sourceManifest && value.entryModuleId) {
    const entry = value.sourceManifest.find(
      (item) => item.moduleId === value.entryModuleId,
    );
    if (
      !entry ||
      (value.entrySourceHash && entry.sha256 !== value.entrySourceHash)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Entry does not match source manifest',
        path: ['entryModuleId'],
        params: { diagnosticCode: 'ENTRY_MANIFEST_MISMATCH' },
      });
    }
  }
});

export const sha256Bytes = (bytes: Uint8Array): string =>
  Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
const encoder = new TextEncoder();
export const compareUtf8 = (left: string, right: string): number => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = a[index] - b[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return a.length - b.length;
};
export const serializeSourceManifest = (
  manifest: readonly SourceManifestEntry[],
): string =>
  JSON.stringify(
    [...SourceManifestSchema.parse(manifest)]
      .sort((a, b) => compareUtf8(a.moduleId, b.moduleId))
      .map(({ moduleId, sha256: hash }) => [moduleId, hash]),
  );
export const sourceClosureHash = (
  manifest: readonly SourceManifestEntry[],
): string => sha256Bytes(encoder.encode(serializeSourceManifest(manifest)));
export const namespacedId = (
  kind: 'symbol' | 'section' | 'text' | 'figure',
  invocationId: string,
  localId: string,
): string =>
  JSON.stringify([
    kind,
    UnicodeStringSchema.parse(invocationId),
    UnicodeStringSchema.parse(localId),
  ]);

export const collectCsoSymbols = (
  cso: CalculationSourceObject,
): CalculationSourceSymbol[] => [
  ...cso.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol' ? [item.symbol] : [],
    ),
  ),
  ...(cso.detachedItems ?? []).flatMap((item) =>
    item.kind === 'symbol' ? [item.symbol] : [],
  ),
];

export const contractIssuesToDiagnostics = (
  issues: readonly z.core.$ZodIssue[],
): Diagnostic[] =>
  issues.map((issue) => {
    const params = issue.code === 'custom' ? issue.params : undefined;
    return {
      code:
        typeof params?.diagnosticCode === 'string'
          ? params.diagnosticCode
          : `SCHEMA_${issue.code.toUpperCase()}`,
      message: `${issue.path.map(String).join('.') || '$'}: ${issue.message}`,
      stage: 'contract',
      ...(typeof params?.symbolId === 'string'
        ? { symbolId: params.symbolId }
        : {}),
      ...(typeof params?.nodeKey === 'string'
        ? { nodeKey: params.nodeKey }
        : {}),
      ...(typeof params?.invocationId === 'string'
        ? { invocationId: params.invocationId }
        : {}),
    };
  });
export type SourceManifestEntry = z.infer<typeof SourceManifestEntrySchema>;
export type SourceSpan = z.infer<typeof SourceSpanSchema>;
export type NodeAddress = z.infer<typeof NodeAddressSchema>;
export type AssetRecord = z.infer<typeof AssetRecordSchema>;
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Versions = z.infer<typeof VersionsSchema>;
export type ResolvedInputs = z.infer<typeof ResolvedInputsSchema>;

export type Comparison = z.infer<typeof ComparisonSchema>;
export type DiagnosticStage = z.infer<typeof DiagnosticStageSchema>;
export type CheckName = z.infer<typeof CheckNameSchema>;
export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export const ExecutionBindingSchema = ResolvedInputEvidenceSchema.safeExtend({
  entryModuleId: ModuleIdSchema,
  entrySourceHash: HashSchema,
  sourceClosureHash: HashSchema,
  function: PythonIdentifierSchema,
});
export type ExecutionBinding = z.infer<typeof ExecutionBindingSchema>;
export const executionBindingKey = (binding: ExecutionBinding): string =>
  JSON.stringify([
    binding.entryModuleId,
    binding.entrySourceHash,
    binding.sourceClosureHash,
    binding.function,
    Object.entries(binding.resolvedInputs)
      .sort(([left], [right]) => compareUtf8(left, right))
      // Inputs are numbers, so a string marker cannot collide with an input.
      // JSON.stringify alone would erase the sign of negative zero.
      .map(([name, value]) => [name, Object.is(value, -0) ? '-0' : value]),
  ]);
