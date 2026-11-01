import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandReportSchema,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterAll, expect, test } from 'vitest';
import { renderPreparedPdf } from '../../packages/cso-cli/src/pdf-rendering.ts';
import { buildPreparedHtml } from '../../packages/cso-cli/src/prepared-html.ts';
import { writeExternalPaginationProject } from './fixtures/external-pagination-project.ts';
import { writeExternalMethodProject } from './fixtures/method-external-project.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-external-pagination-'));
const python = process.env.PYTHON ?? 'python3';
const cli = join(import.meta.dirname, '../../packages/cso-cli/dist/cli.js');
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: directory,
    env: { ...process.env, PYTHON: python },
    encoding: 'utf8',
    timeout: 30_000,
  });
}
function pageTexts(path: string, order: 'layout' | 'raw' = 'layout') {
  const info = spawnSync('pdfinfo', [path], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  const count = Number(info.stdout.match(/Pages:\s+(\d+)/u)?.[1]);
  expect(count).toBeGreaterThan(0);
  return Array.from({ length: count }, (_, index) => {
    const text = spawnSync(
      'pdftotext',
      [
        '-f',
        String(index + 1),
        '-l',
        String(index + 1),
        `-${order}`,
        path,
        '-',
      ],
      { encoding: 'utf8' },
    );
    expect(text.status, text.stderr).toBe(0);
    return text.stdout;
  });
}
function retain(name: string, project: string) {
  if (!process.env.CSO_EXTERNAL_ACCEPTANCE_DIR) return;
  const retained = join(process.env.CSO_EXTERNAL_ACCEPTANCE_DIR, name);
  rmSync(retained, { recursive: true, force: true });
  mkdirSync(retained, { recursive: true });
  cpSync(project, retained, {
    recursive: true,
    filter: (path) => !path.includes('__pycache__'),
  });
}
function capturedExecution(pdf: string) {
  const bundles = readdirSync(`${pdf}.evidence`);
  expect(bundles).toHaveLength(1);
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      readFileSync(
        join(`${pdf}.evidence`, bundles[0] ?? '', 'execution.json'),
        'utf8',
      ),
    ),
  );
  if (!response.ok) throw new Error('Expected successful captured execution');
  return response.execution;
}

test('external call pages repeat their identity and retain all indexed quantities without rerunning the adapter', async () => {
  const project = join(directory, 'pagination');
  mkdirSync(project);
  const fixture = writeExternalPaginationProject(project);
  const bindings = runCli('bindings', project);
  expect(bindings.status, bindings.stdout + bindings.stderr).toBe(0);
  const pdf = join(project, 'external-pagination.pdf');
  const published = runCli(
    'pdf',
    join(project, 'calculate.cso.py'),
    '--function',
    'calculate',
    '--out',
    pdf,
  );
  expect(published.status, published.stdout + published.stderr).toBe(0);
  const report = CommandReportSchema.parse(JSON.parse(published.stdout));
  expect(report.ok).toBe(true);
  writeFileSync(join(project, 'command-report.json'), published.stdout);
  retain('pagination', project);
  const pages = pageTexts(pdf);
  expect(pages.length).toBeGreaterThan(2);
  const allText = pages.join('\n');
  const rawText = pageTexts(pdf, 'raw').join('\n').replace(/\s+/gu, ' ');
  for (const paragraph of fixture.paragraphs) {
    expect(allText.replace(/\s+/gu, ' ')).toContain(paragraph);
  }
  for (const output of fixture.outputs) {
    expect(allText).toContain(output.description);
    expect(rawText.replace(/\s+/gu, '')).toContain(
      output.comment.replace(/\s+/gu, ''),
    );
  }
  for (const page of pages) {
    if (
      !/Method paragraph|Diagnostic area|Supplied length|Supplied width/u.test(
        page,
      )
    )
      continue;
    expect(page).toContain('evaluated');
    expect(page).toContain('External source: adapter.py, evaluate');
    expect(page.replace(/\s+/gu, ' ')).toContain(
      'External algorithm excluded from CSO formula verification.',
    );
  }
  expect(readFileSync(fixture.callsPath, 'utf8')).toBe('called\n');
  const execution = capturedExecution(pdf);
  const originalAdapter = readFileSync(join(project, 'adapter.py'), 'utf8');
  try {
    writeFileSync(
      join(project, 'adapter.py'),
      'raise RuntimeError("Adapter unavailable during retained rendering")\n',
    );
    const document = prepareExecutionDocument({
      execution,
      assets: [],
      verificationReport: verifyExecution({ execution }),
    });
    const html = buildPreparedHtml(document);
    writeFileSync(join(project, 'external-pagination.html'), html);
    expect(html.match(/data-external-role="input"/gu) ?? []).toHaveLength(2);
    expect(html.match(/data-external-role="output"/gu) ?? []).toHaveLength(
      fixture.outputs.length,
    );
    expect(
      (html.match(/class="cso-symbol-row/gu) ?? []).length,
    ).toBeGreaterThanOrEqual(fixture.outputs.length + 2);
    expect(html).toContain('<math');
    for (const output of fixture.outputs)
      expect(html).toContain(output.comment);
    expect(
      execution.externalCalls?.[0]?.outputs.map((output) => output.value),
    ).toEqual(fixture.outputs.map((output) => output.value));
    const retained = await renderPreparedPdf(document, html);
    const retainedPdf = join(project, 'retained-pagination.pdf');
    writeFileSync(retainedPdf, retained.pdf);
    expect(pageTexts(retainedPdf)).toEqual(pages);
    expect(readFileSync(fixture.callsPath, 'utf8')).toBe('called\n');
  } finally {
    writeFileSync(join(project, 'adapter.py'), originalAdapter);
    retain('pagination', project);
  }
}, 120_000);

test('publishes complete mixed method and grouped-case external blocks from one execution', () => {
  const project = join(directory, 'mixed');
  mkdirSync(project);
  writeExternalMethodProject(project, 'rows', false, 3, 'outer');
  const bindings = runCli('bindings', project);
  expect(bindings.status, bindings.stdout + bindings.stderr).toBe(0);
  const pdf = join(project, 'mixed-method-external.pdf');
  const published = runCli(
    'pdf',
    join(project, 'external_compare.cso.py'),
    '--function',
    'compare',
    '--out',
    pdf,
  );
  expect(published.status, published.stdout + published.stderr).toBe(0);
  writeFileSync(join(project, 'command-report.json'), published.stdout);
  const execution = capturedExecution(pdf);
  expect(
    execution.externalCalls?.map(
      (call) => call.outputs.find((output) => output.name === 'count')?.value,
    ),
  ).toEqual([1, 2]);
  const document = prepareExecutionDocument({
    execution,
    assets: [],
    verificationReport: verifyExecution({ execution }),
  });
  writeFileSync(
    join(project, 'mixed-method-external.html'),
    buildPreparedHtml(document),
  );
  retain('mixed', project);
  const text = pageTexts(pdf).join('\n').replace(/\s+/gu, ' ');
  const rawText = pageTexts(pdf, 'raw').join('\n').replace(/\s+/gu, ' ');
  expect(text).toContain('How the external calculation is used');
  expect(text).toContain('Selected external results');
  expect(text).toContain('First / inner_case / searched');
  expect(text).toContain('Second / inner_case / searched');
  expect(
    rawText
      .replace(/\s+/gu, '')
      .match(/Keepthisdiagnosticevenwhenthecomparisonomitsit\./gu),
  ).toHaveLength(3);
  expect(text).toContain('Fail. Double area must be below one square metre.');
  retain('mixed', project);
}, 120_000);
