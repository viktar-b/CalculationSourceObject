import { z } from 'zod';
import {
  ExecutionBindingSchema,
  executionBindingKey,
  collectCsoSymbols,
  NonemptyStringSchema,
  SupportedNumberSchema,
} from './common.ts';
import { ExecutionPayloadSchema } from './execution.ts';
import type { VerificationReport } from './reports.ts';

export const ReferenceBindingSchema = ExecutionBindingSchema;
export const ReferenceCaseSchema = z
  .strictObject({
    id: NonemptyStringSchema,
    revision: NonemptyStringSchema,
    basis: z.strictObject({
      method: NonemptyStringSchema,
      derivation: NonemptyStringSchema,
      sourceDescription: NonemptyStringSchema,
    }),
    binding: ReferenceBindingSchema,
    expected: z.array(
      z.strictObject({
        symbolId: NonemptyStringSchema,
        value: SupportedNumberSchema,
        unit: z.string(),
      }),
    ),
  })
  .superRefine((reference, ctx) => {
    const seen = new Set<string>();
    for (const [index, expected] of reference.expected.entries()) {
      if (seen.has(expected.symbolId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate expected symbol',
          path: ['expected', index, 'symbolId'],
          params: { diagnosticCode: 'DUPLICATE_REFERENCE_SYMBOL' },
        });
      }
      seen.add(expected.symbolId);
    }
  });

export const referenceBindingKey = executionBindingKey;
export const ReferenceCasesSchema = z
  .array(ReferenceCaseSchema)
  .superRefine((cases, ctx) => {
    const bindings = new Set<string>();
    const identities = new Set<string>();
    for (const [index, reference] of cases.entries()) {
      const binding = referenceBindingKey(reference.binding);
      const identity = JSON.stringify([reference.id, reference.revision]);
      if (bindings.has(binding)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate reference binding',
          path: [index, 'binding'],
          params: { diagnosticCode: 'DUPLICATE_REFERENCE_BINDING' },
        });
      }
      if (identities.has(identity)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate reference case revision',
          path: [index, 'id'],
          params: { diagnosticCode: 'DUPLICATE_REFERENCE_CASE' },
        });
      }
      bindings.add(binding);
      identities.add(identity);
    }
  });

export const ReferenceFileSchema = z.strictObject({
  referenceVersion: z.literal('1'),
  cases: ReferenceCasesSchema,
});

export const BoundReferenceCaseSchema = z
  .strictObject({
    execution: ExecutionPayloadSchema,
    referenceCase: ReferenceCaseSchema,
  })
  .superRefine(({ execution, referenceCase }, ctx) => {
    const binding = {
      entryModuleId: execution.entry.moduleId,
      entrySourceHash: execution.entry.sourceHash,
      sourceClosureHash: execution.sourceClosureHash,
      function: execution.entry.function,
      resolvedInputs: execution.entry.resolvedInputs,
    };
    if (
      referenceBindingKey(binding) !==
      referenceBindingKey(referenceCase.binding)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Reference case does not bind to this execution',
        path: ['referenceCase', 'binding'],
        params: { diagnosticCode: 'REFERENCE_BINDING_MISMATCH' },
      });
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
    const symbols = new Map(
      collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
    );
    const expectedIds = new Set(
      referenceCase.expected.map((item) => item.symbolId),
    );
    for (const symbolId of calculated) {
      if (!expectedIds.has(symbolId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Missing calculated symbol ${symbolId}`,
          path: ['referenceCase', 'expected'],
          params: { diagnosticCode: 'MISSING_REFERENCE_SYMBOL', symbolId },
        });
      }
    }
    for (const [index, expected] of referenceCase.expected.entries()) {
      if (!calculated.has(expected.symbolId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Expected symbol is not a calculated definition',
          path: ['referenceCase', 'expected', index, 'symbolId'],
          params: { diagnosticCode: 'UNKNOWN_REFERENCE_SYMBOL' },
        });
      } else if (
        (symbols.get(expected.symbolId)?.unit ?? '') !== expected.unit
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Reference unit differs from documented unit',
          path: ['referenceCase', 'expected', index, 'unit'],
          params: { diagnosticCode: 'REFERENCE_UNIT_MISMATCH' },
        });
      }
    }
  });

export const VerifyExecutionInputSchema = z.strictObject({
  execution: ExecutionPayloadSchema,
  referenceCases: ReferenceCasesSchema.optional(),
});
export type ReferenceBinding = z.infer<typeof ReferenceBindingSchema>;
export type ReferenceCase = z.infer<typeof ReferenceCaseSchema>;
export type ReferenceFile = z.infer<typeof ReferenceFileSchema>;
export type BoundReferenceCase = z.infer<typeof BoundReferenceCaseSchema>;
export type VerifyExecutionInput = z.infer<typeof VerifyExecutionInputSchema>;
export type VerifyExecution = (
  input: VerifyExecutionInput,
) => VerificationReport;
