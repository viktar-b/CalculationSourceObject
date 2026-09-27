import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { chromium } from 'playwright';
import * as pdfRenderer from '../../packages/cso-cli/src/pdf-rendering.ts';
import {
  CalculationDefinitionSchema,
  ExecutionResponseSchema,
} from '@cs-object/core';
import { z } from 'zod';
import { startDevServer } from '../../packages/cso-cli/src/dev-server.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-dev-runtime-'));
const source = join(directory, 'area.cso.py');
const calculation = `from typing import Annotated
from cso_python import calculation, section, symbol, text
@calculation(id="area", title="Rectangle area")
@section(title="Rectangle", root=True)
def calculate(width: Annotated[float, symbol(glyph="w_{rect}", description="Width", unit="m")] = 2.0, height: Annotated[float, symbol(glyph="h_{rect}", description="Height", unit="m")] = 3.0):
    text(id="assumptions", content="Assume perpendicular sides.")
    area: Annotated[float, symbol(glyph="A_{rect}", description="Area", unit="m^2")] = width * height
    return {"area": area}
`;
let server: Awaited<ReturnType<typeof startDevServer>>;
beforeAll(async () => {
  writeFileSync(source, calculation);
  server = await startDevServer({
    sourcePath: source,
    functionName: 'calculate',
    port: 0,
  });
});
afterAll(async () => {
  await server?.close();
  rmSync(directory, { recursive: true, force: true });
});
const post = (
  path: string,
  body: string,
  headers: Record<string, string> = {},
) =>
  fetch(server.origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
const runSchema = z.object({
  html: z.string(),
  pdf: z.string(),
  evidence: z.string(),
});
const evidenceSchema = z.object({
  execution: ExecutionResponseSchema,
  artifacts: z.object({ pdf: z.object({ sha256: z.string() }) }),
  checks: z.object({
    rendering: z.object({ status: z.string() }),
    visualInspection: z.object({ status: z.string() }),
  }),
});

test('serves a static definition and output-only verified calculation, including wide floats', async () => {
  const definition = CalculationDefinitionSchema.parse(
    await (await fetch(`${server.origin}/api/definition`)).json(),
  );
  expect(definition.inputs.map((input) => [input.name, input.default])).toEqual(
    [
      ['width', 2],
      ['height', 3],
    ],
  );
  const result = await post(
    '/api/calculate',
    '{"inputs":{"width":4,"height":3}}',
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ area: 12 });
  const wide = await post(
    '/api/calculate',
    '{"inputs":{"width":1e20,"height":1}}',
  );
  expect(wide.status, await wide.clone().text()).toBe(200);
  expect(await wide.json()).toEqual({ area: 1e20 });
});

test('rejects unknown, duplicated, nonnumeric and oversized inputs and foreign request origins', async () => {
  for (const body of [
    '{"inputs":{"width":2,"width":3}}',
    '{"inputs":{"width":true}}',
    '{"inputs":{},"source":"area.cso.py"}',
    '{"inputs":{"missing":4}}',
  ]) {
    expect((await post('/api/calculate', body)).status).toBe(400);
  }
  expect(
    (
      await post('/api/calculate', '{"inputs":{}}', {
        Origin: 'https://example.invalid',
      })
    ).status,
  ).toBe(403);
  const foreignHost = await new Promise<number | undefined>((done, fail) => {
    const call = request(
      server.origin,
      { headers: { Host: 'example.invalid' } },
      (response) => {
        response.resume();
        done(response.statusCode);
      },
    );
    call.once('error', fail);
    call.end();
  });
  expect(foreignHost).toBe(403);
  expect((await post('/api/calculate', ' '.repeat(65537))).status).toBe(413);
});

test('retains original HTML and memoizes same-capture PDFs after a source change', async () => {
  const response = await post('/api/runs', '{"inputs":{"width":4,"height":3}}');
  expect(response.status).toBe(201);
  const run = runSchema.parse(await response.json());
  const html = await (await fetch(server.origin + run.html)).text();
  expect(html).toContain('Human visual inspection is pending');
  expect(html).toContain('Independent numerical reference: pending');
  writeFileSync(
    source,
    calculation.replace('width * height', 'width + height'),
  );
  try {
    const [first, second] = await Promise.all([
      fetch(server.origin + run.pdf),
      fetch(server.origin + run.pdf),
    ]);
    expect(first.status, await first.clone().text()).toBe(200);
    expect(second.status).toBe(200);
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await second.arrayBuffer()).equals(bytes)).toBe(true);
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(first.headers.get('x-cso-pdf-sha256')).toBe(hash);
    const evidence = evidenceSchema.parse(
      await (await fetch(server.origin + run.evidence)).json(),
    );
    expect(evidence.artifacts.pdf.sha256).toBe(hash);
    expect(evidence.checks.rendering.status).toBe('passed');
    expect(evidence.checks.visualInspection.status).toBe('pending');
    if (!evidence.execution.ok)
      throw new Error('Expected retained verified execution');
    expect(
      evidence.execution.execution.authoring?.outputs.find(
        (output) => output.invocationId === 'root',
      )?.value,
    ).toBe(12);
    expect(await (await fetch(server.origin + run.html)).text()).toBe(html);
    expect(
      await (
        await post('/api/calculate', '{"inputs":{"width":4,"height":3}}')
      ).json(),
    ).toEqual({ area: 7 });
  } finally {
    writeFileSync(source, calculation);
  }
}, 30_000);

test('expires and evicts retained runs, and enforces retained byte limits', async () => {
  const bounded = await startDevServer(
    { sourcePath: source, functionName: 'calculate', port: 0 },
    { maximumRuns: 1, maximumBytes: 128 * 1024 * 1024, maximumAgeMs: 1000 },
  );
  const create = async () =>
    runSchema.parse(
      await (
        await fetch(`${bounded.origin}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"inputs":{}}',
        })
      ).json(),
    );
  try {
    const first = await create();
    const second = await create();
    expect((await fetch(bounded.origin + first.html)).status).toBe(404);
    expect((await fetch(bounded.origin + second.html)).status).toBe(200);
    await setTimeout(1100);
    expect((await fetch(bounded.origin + second.html)).status).toBe(404);
  } finally {
    await bounded.close();
  }
  const tiny = await startDevServer(
    { sourcePath: source, functionName: 'calculate', port: 0 },
    { maximumRuns: 1, maximumBytes: 1, maximumAgeMs: 1000 },
  );
  try {
    const response = await fetch(`${tiny.origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"inputs":{}}',
    });
    expect(response.status).toBe(413);
  } finally {
    await tiny.close();
  }
});

test('returns calculation failures without replacing a successful run', async () => {
  const run = runSchema.parse(
    await (await post('/api/runs', '{"inputs":{}}')).json(),
  );
  const originalHtml = await (await fetch(server.origin + run.html)).text();
  const originalEvidence = await (
    await fetch(server.origin + run.evidence)
  ).text();
  const original = readFileSync(source, 'utf8');
  writeFileSync(source, original.replace('width * height', 'width / height'));
  try {
    const response = await post('/api/calculate', '{"inputs":{"height":0}}');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'Calculation failed verification',
    });
    const retained = await fetch(server.origin + run.html);
    expect(retained.status).toBe(200);
    expect(await retained.text()).toBe(originalHtml);
    expect(await (await fetch(server.origin + run.evidence)).text()).toBe(
      originalEvidence,
    );
  } finally {
    writeFileSync(source, original);
  }
});

test.skipIf(process.platform === 'win32')(
  'rejects a source change between static description and execution',
  async () => {
    const previous = process.env.PYTHON;
    const interpreter = previous ?? 'python3';
    const wrapper = join(directory, 'source-race-python');
    writeFileSync(
      wrapper,
      `#!/usr/bin/env python3
import pathlib, subprocess, sys
if "execute" in sys.argv:
    source = pathlib.Path(sys.argv[sys.argv.index("execute") + 1])
    source.write_text(source.read_text().replace("width * height", "width + height"))
raise SystemExit(subprocess.run([${JSON.stringify(interpreter)}, *sys.argv[1:]]).returncode)
`,
      { mode: 0o755 },
    );
    try {
      process.env.PYTHON = wrapper;
      const response = await post('/api/runs', '{"inputs":{}}');
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: 'Calculation source changed during the request; calculate again',
      });
    } finally {
      if (previous === undefined) delete process.env.PYTHON;
      else process.env.PYTHON = previous;
      writeFileSync(source, calculation);
    }
  },
);

test('counts captured reference bytes toward retention and includes their exact hash and content in evidence', async () => {
  const referencePath = join(directory, 'reference.json');
  const reference = '{"referenceVersion":"1","cases":[]}\n';
  writeFileSync(referencePath, reference);
  const bounded = await startDevServer(
    { sourcePath: source, functionName: 'calculate', referencePath, port: 0 },
    { maximumRuns: 2, maximumBytes: 1024 * 1024, maximumAgeMs: 60_000 },
  );
  const create = () =>
    fetch(`${bounded.origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"inputs":{}}',
    });
  try {
    const first = await create();
    expect(first.status).toBe(201);
    const run = runSchema.parse(await first.json());
    const captured = z
      .object({
        reference: z.object({ sha256: z.string(), content: z.unknown() }),
      })
      .parse(await (await fetch(bounded.origin + run.evidence)).json());
    expect(captured.reference).toEqual({
      sha256: createHash('sha256').update(reference).digest('hex'),
      content: { referenceVersion: '1', cases: [] },
    });
    writeFileSync(referencePath, reference + ' '.repeat(1024 * 1024));
    expect((await create()).status).toBe(413);
    expect((await fetch(bounded.origin + run.html)).status).toBe(200);
  } finally {
    await bounded.close();
  }
});

test('keeps calculations available during PDF work and reports retention and rendering failures accurately', async () => {
  const limited = await startDevServer(
    { sourcePath: source, functionName: 'calculate', port: 0 },
    { maximumRuns: 10, maximumBytes: 1024 * 1024, maximumAgeMs: 60_000 },
  );
  const browser = await chromium.launch();
  const render = vi.spyOn(pdfRenderer, 'renderPreparedPdf');
  let finish:
    | ((
        result: Awaited<ReturnType<typeof pdfRenderer.renderPreparedPdf>>,
      ) => void)
    | undefined;
  render.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  try {
    const page = await browser.newPage();
    await page.goto(limited.origin);
    await expect
      .poll(() => page.locator('#outputs').textContent())
      .toContain('6 m^2');
    await page.locator('input[name="width"]').fill('-0');
    await page.locator('#calculate').click();
    await expect
      .poll(() => page.locator('#outputs').textContent())
      .toContain('-0.0 m^2');
    expect(await page.locator('#evidence').isHidden()).toBe(true);
    const retainedFailure = page.waitForResponse((response) =>
      response.url().endsWith('/report.pdf'),
    );
    await page.locator('#pdf').click();
    await expect.poll(() => finish !== undefined).toBe(true);
    const calculationResponse = await fetch(limited.origin + '/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"inputs":{}}',
    });
    expect(calculationResponse.status).toBe(200);
    expect(await calculationResponse.json()).toEqual({ area: 6 });
    if (!finish) throw new Error('PDF rendering did not start');
    finish({ pdf: Buffer.alloc(2 * 1024 * 1024), presentation: [] });
    expect((await retainedFailure).status()).toBe(413);
    await expect
      .poll(() => page.locator('#status').textContent())
      .toContain('local session limit');
    await expect
      .poll(() => page.locator('#checks').textContent())
      .toContain('PDF layout: pending');
    expect(await page.locator('#evidence').isHidden()).toBe(true);
    render.mockRejectedValue(new Error('Synthetic browser failure'));
    await page.locator('#pdf').click();
    await expect
      .poll(() => page.locator('#checks').textContent())
      .toContain('PDF layout: failed');
    expect(await page.locator('#evidence').isHidden()).toBe(true);
    render.mockResolvedValue({
      pdf: Buffer.from('%PDF-test'),
      presentation: [],
    });
    await page.locator('#calculate').click();
    await expect
      .poll(() => page.locator('#status').textContent())
      .toContain('Report ready');
    await page.locator('#pdf').click();
    await expect
      .poll(() => page.locator('#status').textContent())
      .toContain('PDF ready');
    expect(await page.locator('#evidence').isVisible()).toBe(true);
    await page.screenshot({ path: '/tmp/cso-pr66-ui.png', fullPage: true });
  } finally {
    render.mockRestore();
    await browser.close();
    await limited.close();
  }
}, 30_000);
