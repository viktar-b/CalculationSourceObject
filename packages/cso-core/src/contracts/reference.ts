import { z } from 'zod';
import {
  collectCsoSymbols,
  ExecutionBindingSchema,
  exactCaptureHash,
  executionBindingKey,
  NonemptyStringSchema,
  ResolvedInputEvidenceSchema,
} from './common.ts';
import {
  type ExecutionPayload,
  ExecutionPayloadSchema,
  InputBindingSchema,
} from './execution.ts';
import { ExternalCallSchema, ExternalEnvironmentSchema } from './external.ts';
import { NumericValueSchema } from './numbers.ts';
import type { VerificationReport } from './reports.ts';

// Reference identity describes the source and inputs, never an observed answer.
// Exact capture hashes and run IDs belong only to report/document bindings.
export const ReferenceBindingSchema = ResolvedInputEvidenceSchema.safeExtend({
  entryModuleId: ExecutionBindingSchema.shape.entryModuleId,
  entrySourceHash: ExecutionBindingSchema.shape.entrySourceHash,
  sourceClosureHash: ExecutionBindingSchema.shape.sourceClosureHash,
  function: ExecutionBindingSchema.shape.function,
});
const basisSchema = z.strictObject({
  method: NonemptyStringSchema,
  derivation: NonemptyStringSchema,
  sourceDescription: NonemptyStringSchema,
});
const expectedSymbolSchema = NumericValueSchema.safeExtend({
  symbolId: NonemptyStringSchema,
  unit: z.string(),
});
export const LegacyReferenceCaseSchema = z.strictObject({
  id: NonemptyStringSchema,
  revision: NonemptyStringSchema,
  basis: basisSchema,
  binding: ReferenceBindingSchema,
  expected: z.array(expectedSymbolSchema),
});
const ExternalCallReferenceBindingSchema = z.strictObject({
  externalCallId: NonemptyStringSchema,
  declarationModuleId: ExternalCallSchema.shape.declaration.shape.moduleId,
  declarationName: ExternalCallSchema.shape.declaration.shape.name,
  declarationFingerprint:
    ExternalCallSchema.shape.declaration.shape.fingerprint,
  adapter: ExternalCallSchema.shape.adapter,
  // Symbol arguments retain their source address, never their evaluated value:
  // that value can depend on the external answer being independently checked.
  inputBindings: z.array(InputBindingSchema),
});
export const ExternalReferenceBindingSchema = ReferenceBindingSchema.safeExtend(
  {
    pythonInterpreter: NonemptyStringSchema,
    environment: ExternalEnvironmentSchema,
    calls: z.array(ExternalCallReferenceBindingSchema),
  },
).superRefine((binding, ctx) => {
  const ids = new Set<string>();
  for (const [index, call] of binding.calls.entries()) {
    if (ids.has(call.externalCallId))
      ctx.addIssue({
        code: 'custom',
        path: ['calls', index, 'externalCallId'],
        message: 'External reference call identities must be unique',
        params: { diagnosticCode: 'DUPLICATE_REFERENCE_CALL' },
      });
    ids.add(call.externalCallId);
  }
  if (binding.resolvedInputKinds === undefined)
    ctx.addIssue({
      code: 'custom',
      path: ['resolvedInputKinds'],
      message: 'External entry inputs require captured numeric kinds',
      params: { diagnosticCode: 'REFERENCE_INPUT_KINDS_REQUIRED' },
    });
});
export const ExternalOutputReferenceCaseSchema = z.strictObject({
  kind: z.literal('externalOutputs'),
  id: NonemptyStringSchema,
  revision: NonemptyStringSchema,
  basis: basisSchema,
  binding: ExternalReferenceBindingSchema,
  expected: z
    .array(
      NumericValueSchema.safeExtend({
        externalCallId: NonemptyStringSchema,
        outputName: NonemptyStringSchema,
        unit: z.string(),
      }),
    )
    .min(1),
});
export const ReferenceCaseSchema = z
  .union([LegacyReferenceCaseSchema, ExternalOutputReferenceCaseSchema])
  .superRefine((reference, ctx) => {
    const seen = new Set<string>();
    for (const [index, expected] of reference.expected.entries()) {
      const key =
        'symbolId' in expected
          ? expected.symbolId
          : JSON.stringify([expected.externalCallId, expected.outputName]);
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate expected quantity',
          path: ['expected', index],
          params: { diagnosticCode: 'DUPLICATE_REFERENCE_SYMBOL' },
        });
      seen.add(key);
    }
  });
export type ReferenceBinding = z.infer<typeof ReferenceBindingSchema>;
export type ExternalReferenceBinding = z.infer<
  typeof ExternalReferenceBindingSchema
>;
export type ReferenceCase = z.infer<typeof ReferenceCaseSchema>;
export type LegacyReferenceCase = z.infer<typeof LegacyReferenceCaseSchema>;
export type ExternalOutputReferenceCase = z.infer<
  typeof ExternalOutputReferenceCaseSchema
>;

export const referenceSourceBindingFrom = (
  execution: ExecutionPayload,
): ReferenceBinding => ({
  entryModuleId: execution.entry.moduleId,
  entrySourceHash: execution.entry.sourceHash,
  sourceClosureHash: execution.sourceClosureHash,
  function: execution.entry.function,
  resolvedInputs: execution.entry.resolvedInputs,
  ...(execution.entry.resolvedInputKinds === undefined
    ? {}
    : { resolvedInputKinds: execution.entry.resolvedInputKinds }),
});
export const externalReferenceBindingFrom = (
  execution: ExecutionPayload,
): ExternalReferenceBinding => {
  if (
    execution.externalCalls === undefined ||
    execution.environment === undefined
  )
    throw new Error(
      'External reference binding requires captured external evidence and environment',
    );
  return ExternalReferenceBindingSchema.parse({
    ...referenceSourceBindingFrom(execution),
    pythonInterpreter: execution.versions.pythonInterpreter,
    environment: execution.environment,
    calls: execution.externalCalls.map((call) => {
      const invocation = execution.invocations.find(
        (invocation) => invocation.id === call.id,
      );
      if (!invocation)
        throw new Error(
          'External reference binding requires captured invocation input origins',
        );
      return {
        externalCallId: call.id,
        declarationModuleId: call.declaration.moduleId,
        declarationName: call.declaration.name,
        declarationFingerprint: call.declaration.fingerprint,
        adapter: call.adapter,
        inputBindings: invocation.inputBindings,
      };
    }),
  });
};
export const referenceBindingKey = (
  binding: ReferenceBinding | ExternalReferenceBinding,
): string => {
  if (!('calls' in binding)) return executionBindingKey(binding);
  return `external:${exactCaptureHash({
    ...binding,
    calls: binding.calls
      .map((call) => ({
        ...call,
        inputBindings: [...call.inputBindings].sort((left, right) =>
          left.parameterName < right.parameterName
            ? -1
            : left.parameterName > right.parameterName
              ? 1
              : 0,
        ),
      }))
      .sort((left, right) =>
        left.externalCallId < right.externalCallId
          ? -1
          : left.externalCallId > right.externalCallId
            ? 1
            : 0,
      ),
    environment: {
      ...binding.environment,
      distributions: [...binding.environment.distributions].sort(
        (left, right) =>
          left[0] < right[0]
            ? -1
            : left[0] > right[0]
              ? 1
              : left[1] < right[1]
                ? -1
                : left[1] > right[1]
                  ? 1
                  : 0,
      ),
    },
  })}`;
};
export const referenceMatchesExecution = (
  reference: ReferenceCase,
  execution: ExecutionPayload,
): boolean => {
  if ('kind' in reference)
    return (
      execution.externalCalls !== undefined &&
      execution.environment !== undefined &&
      referenceBindingKey(reference.binding) ===
        referenceBindingKey(externalReferenceBindingFrom(execution))
    );
  return (
    referenceBindingKey(reference.binding) ===
    referenceBindingKey(referenceSourceBindingFrom(execution))
  );
};
const validateReferenceCases = (
  cases: ReferenceCase[],
  ctx: z.RefinementCtx,
): void => {
  const bindings = new Set<string>();
  const identities = new Set<string>();
  for (const [index, reference] of cases.entries()) {
    const binding = referenceBindingKey(reference.binding);
    const identity = JSON.stringify([reference.id, reference.revision]);
    const slots =
      'kind' in reference
        ? reference.expected.map(
            (expected) =>
              `${binding}:${JSON.stringify([expected.externalCallId, expected.outputName])}`,
          )
        : [binding];
    if (slots.some((slot) => bindings.has(slot)))
      ctx.addIssue({
        code: 'custom',
        message:
          'Duplicate reference binding or overlapping external output scope',
        path: [index, 'binding'],
        params: { diagnosticCode: 'DUPLICATE_REFERENCE_BINDING' },
      });
    if (identities.has(identity))
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate reference case revision',
        path: [index, 'id'],
        params: { diagnosticCode: 'DUPLICATE_REFERENCE_CASE' },
      });
    for (const slot of slots) bindings.add(slot);
    identities.add(identity);
  }
};
export const ReferenceCasesSchema = z
  .array(ReferenceCaseSchema)
  .superRefine(validateReferenceCases);
const LegacyReferenceCasesSchema = z
  .array(LegacyReferenceCaseSchema)
  .superRefine(validateReferenceCases)
  .superRefine((cases, ctx) => {
    for (const [index, reference] of cases.entries()) {
      const ids = new Set<string>();
      for (const [expectedIndex, expected] of reference.expected.entries()) {
        if (ids.has(expected.symbolId))
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate expected symbol',
            path: [index, 'expected', expectedIndex, 'symbolId'],
            params: { diagnosticCode: 'DUPLICATE_REFERENCE_SYMBOL' },
          });
        ids.add(expected.symbolId);
      }
    }
  });
export const ReferenceFileSchema = z.discriminatedUnion('referenceVersion', [
  z.strictObject({
    referenceVersion: z.literal('1'),
    cases: LegacyReferenceCasesSchema,
  }),
  z.strictObject({
    referenceVersion: z.literal('2'),
    cases: ReferenceCasesSchema,
  }),
]);
export const BoundReferenceCaseSchema = z
  .strictObject({
    execution: ExecutionPayloadSchema,
    referenceCase: ReferenceCaseSchema,
  })
  .superRefine(({ execution, referenceCase }, ctx) => {
    if (!referenceMatchesExecution(referenceCase, execution)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Reference case does not bind to this execution source, inputs and environment',
        path: ['referenceCase', 'binding'],
        params: { diagnosticCode: 'REFERENCE_BINDING_MISMATCH' },
      });
      return;
    }
    const symbols = new Map(
      collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
    );
    if ('kind' in referenceCase) {
      for (const [index, expected] of referenceCase.expected.entries()) {
        const output = execution.externalCalls
          ?.find((call) => call.id === expected.externalCallId)
          ?.outputs.find((output) => output.name === expected.outputName);
        if (!output)
          ctx.addIssue({
            code: 'custom',
            message:
              'Expected external output must select a captured call and declared output',
            path: ['referenceCase', 'expected', index],
            params: { diagnosticCode: 'UNKNOWN_REFERENCE_SYMBOL' },
          });
        else if (symbols.get(output.symbolId)?.unit !== expected.unit)
          ctx.addIssue({
            code: 'custom',
            message: 'Reference unit differs from documented unit',
            path: ['referenceCase', 'expected', index, 'unit'],
            params: {
              diagnosticCode: 'REFERENCE_UNIT_MISMATCH',
              symbolId: output.symbolId,
            },
          });
      }
      return;
    }
    const calculated = new Set(
      execution.invocations.flatMap((invocation) =>
        invocation.symbols
          .filter(
            (symbol) =>
              symbol.kind === 'formula' || symbol.kind === 'unsupported',
          )
          .map((symbol) => symbol.symbolId),
      ),
    );
    const expectedIds = new Set(
      referenceCase.expected.map((item) => item.symbolId),
    );
    for (const symbolId of calculated)
      if (!expectedIds.has(symbolId))
        ctx.addIssue({
          code: 'custom',
          message: `Missing calculated symbol ${symbolId}`,
          path: ['referenceCase', 'expected'],
          params: { diagnosticCode: 'MISSING_REFERENCE_SYMBOL', symbolId },
        });
    for (const [index, expected] of referenceCase.expected.entries()) {
      if (!calculated.has(expected.symbolId))
        ctx.addIssue({
          code: 'custom',
          message: 'Expected symbol is not a calculated definition',
          path: ['referenceCase', 'expected', index, 'symbolId'],
          params: { diagnosticCode: 'UNKNOWN_REFERENCE_SYMBOL' },
        });
      else if ((symbols.get(expected.symbolId)?.unit ?? '') !== expected.unit)
        ctx.addIssue({
          code: 'custom',
          message: 'Reference unit differs from documented unit',
          path: ['referenceCase', 'expected', index, 'unit'],
          params: { diagnosticCode: 'REFERENCE_UNIT_MISMATCH' },
        });
    }
  });
export const VerifyExecutionInputSchema = z.strictObject({
  execution: ExecutionPayloadSchema,
  referenceCases: ReferenceCasesSchema.optional(),
});
export type ReferenceFile = z.infer<typeof ReferenceFileSchema>;
export type BoundReferenceCase = z.infer<typeof BoundReferenceCaseSchema>;
export type VerifyExecutionInput = z.infer<typeof VerifyExecutionInputSchema>;
export type VerifyExecution = (
  input: VerifyExecutionInput,
) => VerificationReport;
