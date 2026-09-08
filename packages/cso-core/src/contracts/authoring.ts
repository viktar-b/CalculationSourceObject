import { z } from 'zod';
import {
  NodeAddressSchema,
  SourceSpanSchema,
  SupportedNumberSchema,
} from './common.ts';

const SourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('local') }),
  z.strictObject({ kind: z.literal('symbol'), symbolId: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('parameter'),
    invocationId: z.string().min(1),
    parameterName: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('output'),
    invocationId: z.string().min(1),
    outputName: z.string().min(1),
  }),
]);

export const AuthoringEvidenceSchema = z.strictObject({
  version: z.literal('2'),
  parameters: z.array(
    z.strictObject({
      invocationId: z.string().min(1),
      parameterName: z.string().min(1),
      symbolId: z.string().min(1),
      numericType: z.enum(['int', 'float']),
      unit: z.string(),
      location: SourceSpanSchema,
      origin: SourceSchema,
    }),
  ),
  uses: z.array(
    z.strictObject({
      invocationId: z.string().min(1),
      parameterName: z.string().min(1),
      address: NodeAddressSchema,
      location: SourceSpanSchema,
    }),
  ),
  outputDeclarations: z.array(
    z.strictObject({
      invocationId: z.string().min(1),
      name: z.string().min(1),
      symbolId: z.string().min(1),
      source: SourceSchema,
      location: SourceSpanSchema,
    }),
  ),
  outputs: z.array(
    z.strictObject({
      invocationId: z.string().min(1),
      name: z.string().min(1),
      symbolId: z.string().min(1),
      source: SourceSchema,
      location: SourceSpanSchema,
      value: SupportedNumberSchema,
    }),
  ),
});

export type AuthoringEvidence = z.infer<typeof AuthoringEvidenceSchema>;
