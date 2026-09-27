import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const StatusSchema = z.enum(['passed', 'failed', 'pending', 'not_applicable']);
const CheckSchema = z.looseObject({ status: StatusSchema });
const ChecksSchema = z.record(z.string(), CheckSchema);
export const OutputsSchema = z.record(z.string(), z.number());
export const RunSchema = z.strictObject({
  id: z.string().uuid(),
  outputs: OutputsSchema,
  checks: ChecksSchema,
  html: z.string().min(1),
  pdf: z.string().min(1),
  evidence: z.string().min(1),
});
export const EvidenceSchema = z.strictObject({
  runId: z.string().uuid(),
  execution: z.looseObject({
    ok: z.literal(true),
    execution: z.looseObject({
      sourceClosureHash: z.string().regex(/^[a-f0-9]{64}$/),
      entry: z.looseObject({
        resolvedInputs: z.record(z.string(), z.number()),
      }),
    }),
  }),
  document: z.looseObject({
    source: z.looseObject({
      kind: z.literal('execution'),
      sourceClosureHash: z.string().regex(/^[a-f0-9]{64}$/),
      resolvedInputs: z.record(z.string(), z.number()),
    }),
    sections: z.array(
      z.looseObject({
        items: z.array(
          z.looseObject({
            kind: z.string(),
            symbol: z
              .looseObject({
                description: z.string().optional(),
                unit: z.string().optional(),
              })
              .optional(),
          }),
        ),
      }),
    ),
  }),
  verification: z.looseObject({
    ok: z.literal(true),
    checks: ChecksSchema,
  }),
  reference: z
    .strictObject({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      content: z.unknown(),
    })
    .nullable(),
  checks: ChecksSchema,
  artifacts: z.strictObject({
    html: z.strictObject({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    pdf: z
      .strictObject({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .nullable(),
  }),
  presentation: z.array(z.unknown()),
});

export const LockSchema = z.looseObject({
  packages: z.record(
    z.string(),
    z.looseObject({
      resolved: z.string().optional(),
      link: z.boolean().optional(),
    }),
  ),
});

export function hashBytes(bytes: Uint8Array, algorithm = 'sha256') {
  return createHash(algorithm).update(bytes).digest('hex');
}

export function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function postJson(origin: string, path: string, body: unknown) {
  return await fetch(new URL(path, origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function assertOutputs(
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [name, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[name];
    assert.notEqual(actualValue, undefined);
    const tolerance = Math.max(
      1e-9,
      1e-12 * Math.max(Math.abs(actualValue), Math.abs(expectedValue)),
    );
    assert(
      Math.abs(actualValue - expectedValue) <= tolerance,
      `${name}: expected ${expectedValue}, received ${actualValue}`,
    );
  }
}

export async function artifactSet(options: {
  readonly root: string;
  readonly origin: string;
  readonly run: z.infer<typeof RunSchema>;
  readonly inputs: Readonly<Record<string, number>>;
  readonly outputs: Readonly<Record<string, number>>;
  readonly rows: readonly {
    readonly description: string;
    readonly unit: string;
  }[];
  readonly referencePath?: string;
  readonly name: string;
}) {
  const expectedBase = `/api/runs/${options.run.id}`;
  assert.equal(options.run.html, `${expectedBase}/report.html`);
  assert.equal(options.run.pdf, `${expectedBase}/report.pdf`);
  assert.equal(options.run.evidence, `${expectedBase}/evidence.json`);
  assertOutputs(options.run.outputs, options.outputs);

  const htmlResponse = await fetch(new URL(options.run.html, options.origin));
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get('content-type') ?? '', /^text\/html/);
  const htmlBytes = new Uint8Array(await htmlResponse.arrayBuffer());
  const html = new TextDecoder().decode(htmlBytes);
  for (const name of Object.keys(options.outputs))
    assert.match(html, new RegExp(name, 'i'));

  const pdfResponse = await fetch(new URL(options.run.pdf, options.origin));
  assert.equal(pdfResponse.status, 200);
  assert.match(
    pdfResponse.headers.get('content-type') ?? '',
    /^application\/pdf/,
  );
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 5)), '%PDF-');
  assert.equal(
    pdfResponse.headers.get('x-cso-pdf-sha256'),
    hashBytes(pdfBytes),
  );

  const evidenceResponse = await fetch(
    new URL(options.run.evidence, options.origin),
  );
  assert.equal(evidenceResponse.status, 200);
  const evidence = EvidenceSchema.parse(await evidenceResponse.json());
  assert.equal(evidence.runId, options.run.id);
  assert.deepEqual(
    evidence.execution.execution.entry.resolvedInputs,
    options.inputs,
  );
  assert.deepEqual(evidence.document.source.resolvedInputs, options.inputs);
  assert.equal(
    evidence.execution.execution.sourceClosureHash,
    evidence.document.source.sourceClosureHash,
  );
  for (const name of [
    'executionValidity',
    'inputConsistency',
    'constantConsistency',
    'formulaConsistency',
    'outputConsistency',
    'sourceToDocumentConsistency',
    'independentReferenceAgreement',
  ])
    assert.deepEqual(evidence.checks[name], evidence.verification.checks[name]);
  assert.equal(evidence.checks.sourceToDocumentConsistency?.status, 'passed');
  assert.equal(
    evidence.checks.independentReferenceAgreement?.status,
    options.referencePath ? 'passed' : 'not_applicable',
  );
  assert.equal(evidence.checks.documentContent?.status, 'passed');
  assert.equal(evidence.checks.rendering?.status, 'passed');
  assert.equal(evidence.checks.visualInspection?.status, 'pending');
  assert.equal(evidence.artifacts.html.sha256, hashBytes(htmlBytes));
  assert.equal(evidence.artifacts.pdf?.sha256, hashBytes(pdfBytes));
  assert(evidence.presentation.length > 0);
  if (options.referencePath) {
    const referenceBytes = readFileSync(options.referencePath);
    assert(evidence.reference);
    assert.equal(evidence.reference.sha256, hashBytes(referenceBytes));
    assert.deepEqual(
      evidence.reference.content,
      JSON.parse(referenceBytes.toString('utf8')),
    );
  } else assert.equal(evidence.reference, null);
  const rows = evidence.document.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol' && item.symbol ? [item.symbol] : [],
    ),
  );
  for (const expected of options.rows)
    assert(
      rows.some(
        (row) =>
          row.description === expected.description &&
          row.unit === expected.unit,
      ),
      `Missing report row ${expected.description} [${expected.unit}]`,
    );

  const summaryResponse = await fetch(
    new URL(`/api/runs/${options.run.id}`, options.origin),
  );
  assert.equal(summaryResponse.status, 200);
  const summary = RunSchema.parse(await summaryResponse.json());
  assert.deepEqual(summary.checks, evidence.checks);

  const htmlPath = join(options.root, `${options.name}-report.html`);
  const pdfPath = join(options.root, `${options.name}-report.pdf`);
  const evidencePath = join(options.root, `${options.name}-evidence.json`);
  writeFileSync(htmlPath, htmlBytes);
  writeFileSync(pdfPath, pdfBytes);
  writeJson(evidencePath, evidence);
  return { htmlPath, pdfPath, evidencePath };
}
