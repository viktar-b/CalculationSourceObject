import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  ReferenceFileSchema,
  contractIssuesToDiagnostics,
  referenceMatchesExecution,
  type Diagnostic,
  type ExecutionPayload,
  type Provenance,
  type ReferenceCase,
} from '@cs-object/core';
import { parseStrictJson } from './strict-json.ts';

type CapturedReference =
  | {
      kind: 'parsed';
      cases: ReferenceCase[];
      bytes: Buffer;
      provenance: NonNullable<Provenance['reference']>;
    }
  | {
      kind: 'failed';
      diagnostics: Diagnostic[];
      provenance?: NonNullable<Provenance['reference']>;
    };

export function captureReference(
  path: string,
  execution: ExecutionPayload,
): CapturedReference {
  let provenance: Provenance['reference'];
  try {
    const bytes = readFileSync(path);
    provenance = {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      revisions: [],
    };
    const raw = parseStrictJson(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    const parsed = ReferenceFileSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        kind: 'failed',
        provenance,
        diagnostics: contractIssuesToDiagnostics(parsed.error.issues).map(
          (diagnostic) => ({ ...diagnostic, stage: 'reference' }),
        ),
      };
    }
    provenance.revisions = parsed.data.cases
      .filter((item) => referenceMatchesExecution(item, execution))
      .map((item) => item.revision);
    return { kind: 'parsed', cases: parsed.data.cases, bytes, provenance };
  } catch (error) {
    return {
      kind: 'failed',
      provenance,
      diagnostics: [
        {
          code: 'REFERENCE_CAPTURE_FAILED',
          stage: 'reference',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
