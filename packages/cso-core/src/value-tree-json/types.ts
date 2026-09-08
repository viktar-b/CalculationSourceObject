import type { z } from 'zod';
import type {
  ValueTreeJsonDocumentSchema,
  ValueTreeJsonLiteralSchema,
  ValueTreeJsonNodeSchema,
  ValueTreeJsonSectionSchema,
  ValueTreeJsonSymbolSchema,
} from './schema.ts';

export type ValueTreeJsonLiteral = z.infer<typeof ValueTreeJsonLiteralSchema>;
export type ValueTreeJsonNode = z.infer<typeof ValueTreeJsonNodeSchema>;
export type ValueTreeJsonSymbol = z.infer<typeof ValueTreeJsonSymbolSchema>;
export type ValueTreeJsonSection = z.infer<typeof ValueTreeJsonSectionSchema>;
export type ValueTreeJsonDocument = z.infer<typeof ValueTreeJsonDocumentSchema>;

export type ValueTreeJsonDocumentInput = z.input<
  typeof ValueTreeJsonDocumentSchema
>;
