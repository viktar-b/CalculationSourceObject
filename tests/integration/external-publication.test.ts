import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { z } from 'zod';
import { ExecutionResponseSchema } from '@cs-object/core';
import { startDevServer } from '../../packages/cso-cli/src/dev-server.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-external-retained-'));
const project = join(directory, 'loop');
const adapter = join(project, 'helpers/midpoint.py');
const calls = join(directory, 'calls.txt');
let server: Awaited<ReturnType<typeof startDevServer>>;
beforeAll(async () => {
  cpSync(
    join(import.meta.dirname, '../../examples/external-functions/loop'),
    project,
    {
      recursive: true,
      filter: (path) =>
        !path.includes('_cso_bindings') && !path.includes('__pycache__'),
    },
  );
  const code = readFileSync(adapter, 'utf8').replace(
    '    if intervals <= 0:',
    `    with open(${JSON.stringify(calls)}, "a") as log:\n        log.write("called\\n")\n    if intervals <= 0:`,
  );
  writeFileSync(adapter, code);
  const generated = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-m', 'cso_python', 'bindings', project],
    { encoding: 'utf8' },
  );
  expect(generated.status, generated.stdout + generated.stderr).toBe(0);
  server = await startDevServer({
    sourcePath: join(project, 'calculate.cso.py'),
    functionName: 'calculate',
    port: 0,
    executionTimeoutMs: 1000,
  });
});
afterAll(async () => {
  await server?.close();
  rmSync(directory, { recursive: true, force: true });
});

const RunSchema = z.object({
  html: z.string(),
  pdf: z.string(),
  evidence: z.string(),
});
const EvidenceSchema = z.object({
  execution: ExecutionResponseSchema,
  artifacts: z.object({ pdf: z.object({ sha256: z.string() }) }),
});
const postRun = () =>
  fetch(`${server.origin}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"inputs":{}}',
  });

test('retained external HTML, PDFs and evidence never rerun the adapter after it becomes unavailable', async () => {
  const response = await postRun();
  expect(response.status, await response.clone().text()).toBe(201);
  const run = RunSchema.parse(await response.json());
  const html = await (await fetch(server.origin + run.html)).text();
  expect(html).toContain('Midpoint integral estimate');
  expect(html).toContain('Retained even when no later formula uses it.');
  expect(readFileSync(calls, 'utf8')).toBe('called\n');
  const original = readFileSync(adapter, 'utf8');
  try {
    writeFileSync(
      adapter,
      'raise RuntimeError("adapter no longer available")\n',
    );
    const first = await fetch(server.origin + run.pdf);
    const second = await fetch(server.origin + run.pdf);
    expect(first.status, await first.clone().text()).toBe(200);
    expect(second.status).toBe(200);
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(Buffer.from(await second.arrayBuffer()).equals(bytes)).toBe(true);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(first.headers.get('x-cso-pdf-sha256')).toBe(sha256);
    const evidence = EvidenceSchema.parse(
      await (await fetch(server.origin + run.evidence)).json(),
    );
    expect(evidence.artifacts.pdf.sha256).toBe(sha256);
    if (!evidence.execution.ok) throw new Error('Expected retained execution');
    expect(evidence.execution.execution.externalCalls?.length).toBe(1);
    expect(
      evidence.execution.execution.authoring?.outputs.find(
        (output) => output.invocationId === 'root' && output.name === 'doubled',
      )?.value,
    ).toBe(42);
    expect(await (await fetch(server.origin + run.html)).text()).toBe(html);
    expect(readFileSync(calls, 'utf8')).toBe('called\n');
    const failed = await postRun();
    expect(failed.status).toBe(422);
    expect(await failed.text()).toContain('adapter no longer available');
    expect(await (await fetch(server.origin + run.html)).text()).toBe(html);
  } finally {
    writeFileSync(adapter, original);
  }
});

test('a blocked adapter reaches the configured dev deadline without replacing a retained run', async () => {
  const response = await postRun();
  expect(response.status, await response.clone().text()).toBe(201);
  const run = RunSchema.parse(await response.json());
  const html = await (await fetch(server.origin + run.html)).text();
  const original = readFileSync(adapter, 'utf8');
  try {
    const before = readFileSync(calls, 'utf8');
    writeFileSync(
      adapter,
      `def midpoint_square(*, upper_limit, intervals):\n    with open(${JSON.stringify(calls)}, "a") as log:\n        log.write("blocked\\n")\n    while True:\n        pass\n`,
    );
    const started = Date.now();
    const failed = await postRun();
    expect(failed.status).toBe(422);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await failed.text()).toMatch(/timed out|ETIMEDOUT/u);
    expect(readFileSync(calls, 'utf8')).toBe(before + 'blocked\n');
    expect(await (await fetch(server.origin + run.html)).text()).toBe(html);
  } finally {
    writeFileSync(adapter, original);
  }
});
