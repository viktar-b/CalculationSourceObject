import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  lstatSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  BoundPreparedDocumentSchema,
  type PreparedDocument,
} from '@cs-object/core';
import { sha256 } from './assets.ts';
import { stringifyJson } from './json.ts';
import { parseStrictJson } from './strict-json.ts';
import type { VerifiedCapture } from './verification.ts';

export const jsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${stringifyJson(value)}\n`);
export type PresentationMapping = {
  pointer: string;
  role: string;
  selector: string;
};
type RetainedField = { artifact: string; pointer: string; sha256: string };
const pointerKey = (key: string) =>
  key.replaceAll('~', '~0').replaceAll('/', '~1');
// The preparer uses undefined for absent optional contract fields. They are not
// authored JSON data; omit those keys while preserving every supplied value.
const suppliedJson = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(suppliedJson)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, suppliedJson(entry)]),
        )
      : value;

function fields(
  value: unknown,
  artifact: string,
  pointer = '',
): RetainedField[] {
  if (value !== null && typeof value === 'object' && Object.keys(value).length)
    return Object.entries(value).flatMap(([key, entry]) =>
      fields(entry, artifact, `${pointer}/${pointerKey(key)}`),
    );
  return [{ artifact, pointer, sha256: sha256(jsonBytes(value)) }];
}

export function retainSource(
  capture: VerifiedCapture,
  document: PreparedDocument,
) {
  BoundPreparedDocumentSchema.parse({ execution: capture.execution, document });
  const preparedBytes = jsonBytes(document);
  const roundTrip = parseStrictJson(preparedBytes.toString('utf8'));
  if (!isDeepStrictEqual(roundTrip, suppliedJson(document)))
    throw new Error('Prepared data did not survive exact JSON round trip');
  const execution = parseStrictJson(
    new TextDecoder('utf-8', { fatal: true }).decode(capture.executionBytes),
  );
  const payloads: { path: string; bytes: Buffer }[] = [
    { path: 'execution.json', bytes: capture.executionBytes },
    { path: 'verification.json', bytes: jsonBytes(capture.verification) },
    { path: 'prepared.json', bytes: preparedBytes },
  ];
  if (capture.referenceBytes)
    payloads.push({ path: 'reference.json', bytes: capture.referenceBytes });
  return {
    payloads,
    retainedFields: [
      ...fields(execution, 'execution.json'),
      ...fields(roundTrip, 'prepared.json'),
    ],
  };
}

export function publishDocumentEvidence(options: {
  outPath: string;
  artifact: { kind: 'html' | 'pdf'; bytes: Buffer };
  presentationCheck: 'passed' | 'not_applicable';
  reportBytes: Buffer;
  retained: ReturnType<typeof retainSource>;
  presentation: PresentationMapping[];
  retainEvidence?: boolean;
}): { path: string; sha256: string } | undefined {
  const { outPath, artifact } = options;
  const bytes = artifact.bytes;
  mkdirSync(dirname(outPath), { recursive: true });
  const temporaryOutput = join(
    dirname(outPath),
    `.${basename(outPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporaryOutput, bytes, { flag: 'wx' });
    if (!readFileSync(temporaryOutput).equals(bytes)) {
      throw new Error('Temporary document byte verification failed');
    }
    const evidence =
      options.retainEvidence === false
        ? undefined
        : publishEvidenceBundle(options);
    // Last filesystem commit. A complete unused bundle can remain if this fails.
    renameSync(temporaryOutput, outPath);
    return evidence;
  } finally {
    // Cleanup cannot turn an already published document into a reported failure.
    try {
      rmSync(temporaryOutput, { force: true });
    } catch {
      /* Preserve the owning failure. */
    }
  }
}

function publishEvidenceBundle(
  options: Parameters<typeof publishDocumentEvidence>[0],
): { path: string; sha256: string } {
  const { outPath, artifact, reportBytes, retained, presentation } = options;
  const payloads = [
    ...retained.payloads,
    {
      path: 'source-audit.json',
      bytes: jsonBytes({
        auditVersion: '1',
        defaultDisposition:
          'Retained in the named evidence artifact; only explicit engineering projections are presented.',
        retainedFields: retained.retainedFields,
        presentationArtifact: 'prepared.json',
        presentation,
      }),
    },
  ];
  const manifest = jsonBytes({
    manifestVersion: '1',
    [artifact.kind]: { path: outPath, sha256: sha256(artifact.bytes) },
    prospectiveCommandReport: {
      sha256: sha256(reportBytes),
      publication:
        'Requires the actual successful stdout report and matching document; this manifest alone is not a publication receipt.',
    },
    artifacts: payloads.map(({ path, bytes }) => ({
      path,
      sha256: sha256(bytes),
    })),
    outcomes: {
      dataRetention: {
        status: 'passed',
        fields: retained.retainedFields.length,
      },
      engineeringPresentation: {
        automatic: options.presentationCheck,
        visualInspection: 'pending',
      },
      sourceToDocumentConsistency: {
        artifact: 'verification.json',
        pointer: '/checks/sourceToDocumentConsistency',
      },
      independentReferenceAgreement: {
        artifact: 'verification.json',
        pointer: '/checks/independentReferenceAgreement',
      },
    },
  });
  const hash = sha256(manifest);
  const parent = `${outPath}.evidence`;
  const destination = join(parent, hash);
  let temporaryEvidence: string | undefined;
  try {
    mkdirSync(parent, { recursive: true });
    temporaryEvidence = mkdtempSync(join(parent, '.tmp-'));
    const files = [...payloads, { path: 'manifest.json', bytes: manifest }];
    for (const file of files) {
      const path = join(temporaryEvidence, file.path);
      writeFileSync(path, file.bytes, { flag: 'wx' });
      if (!readFileSync(path).equals(file.bytes))
        throw new Error(`Evidence verification failed: ${file.path}`);
    }
    try {
      renameSync(temporaryEvidence, destination);
      temporaryEvidence = undefined;
    } catch (error) {
      // A complete immutable bundle may already exist. Never overwrite it.
      if (
        !lstatSync(destination).isDirectory() ||
        readdirSync(destination).sort().join('\0') !==
          files
            .map((file) => file.path)
            .sort()
            .join('\0') ||
        files.some(
          (file) =>
            !lstatSync(join(destination, file.path)).isFile() ||
            !readFileSync(join(destination, file.path)).equals(file.bytes),
        )
      )
        throw error;
    }
    if (temporaryEvidence) {
      rmSync(temporaryEvidence, { recursive: true });
      temporaryEvidence = undefined;
    }
  } finally {
    if (temporaryEvidence) {
      try {
        rmSync(temporaryEvidence, { recursive: true, force: true });
      } catch {
        /* Preserve the owning failure. */
      }
    }
  }
  return { path: join(destination, 'manifest.json'), sha256: hash };
}

// Preserve the PDF publication API and manifest shape for existing consumers.
export function publishPdfEvidence(
  options: Omit<
    Parameters<typeof publishDocumentEvidence>[0],
    'artifact' | 'presentationCheck'
  > & { pdf: Buffer },
) {
  return publishDocumentEvidence({
    ...options,
    artifact: { kind: 'pdf', bytes: options.pdf },
    presentationCheck: 'passed',
  });
}
