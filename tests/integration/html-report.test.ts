import { spawnSync, execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CommandReportSchema } from '@cs-object/core';
import { chromium, type Page } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'cso-html-'));
const cli = resolve('packages/cso-cli/dist/cli.js');
const python = process.env.PYTHON ?? 'python3';
const panels = join(directory, 'panels');
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
beforeAll(() => {
  cpSync('examples/two-panel', panels, {
    recursive: true,
    filter: (path) =>
      !['_cso_bindings', '__pycache__', 'pdfs'].includes(basename(path)),
  });
  execFileSync(python, ['-I', '-m', 'cso_python', 'bindings', panels]);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function run(
  command: 'html' | 'pdf',
  source: string,
  name: string,
  output: string,
  extra: string[] = [],
  browser = true,
) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      command,
      source,
      '--function',
      name,
      '--out',
      output,
      '--format',
      'json',
      ...extra,
    ],
    {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHON: python,
        ...(!browser
          ? { PLAYWRIGHT_BROWSERS_PATH: join(directory, 'absent-browser') }
          : {}),
      },
    },
  );
  if (result.error) throw result.error;
  return {
    ...result,
    report: CommandReportSchema.parse(JSON.parse(result.stdout)),
  };
}

function replaceFixture(
  source: string,
  search: string | RegExp,
  replacement: string,
): string {
  const matches =
    typeof search === 'string'
      ? source.split(search).length - 1
      : [...source.matchAll(new RegExp(search.source, 'g'))].length;
  expect(matches, `Expected one fixture match for ${search}`).toBe(1);
  const changed = source.replace(search, replacement);
  expect(changed).not.toBe(source);
  return changed;
}

async function inspectMedia(
  output: string,
  inspect: (page: Page) => Promise<void>,
) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const external: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) external.push(request.url());
    });
    await page.goto(pathToFileURL(output).href);
    for (const media of ['screen', 'print'] satisfies Array<
      'screen' | 'print'
    >) {
      await page.emulateMedia({ media });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images, (image) => image.decode()),
        );
      });
      await inspect(page);
    }
    expect(external).toEqual([]);
  } finally {
    await browser.close();
  }
}

function assertLayoutRejected(source: string, stem: string) {
  const reports = [];
  for (const command of ['html', 'pdf'] satisfies Array<'html' | 'pdf'>) {
    const output = join(directory, `${stem}.${command}`);
    writeFileSync(output, 'previous artifact');
    const result = run(
      command,
      source,
      'polynomial',
      output,
      command === 'html' ? ['--check-layout'] : [],
    );
    expect(result.status, result.stdout).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('previous artifact');
    expect(result.report.output).toBeUndefined();
    expect(result.report.checks.rendering.status).toBe('failed');
    const issues = result.report.diagnostics.filter(
      (item) => item.code === 'DOCUMENT_LAYOUT_OVERFLOW',
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(new Set(issues.map((item) => item.layout?.media))).toEqual(
      new Set(['screen', 'print']),
    );
    expect(
      issues.every((item) => item.layout && item.layout.overflowPx > 2),
    ).toBe(true);
    reports.push(issues);
  }
  return reports.flat();
}

test('exports standalone HTML and exact evidence without a browser; preview matches print content width', async () => {
  const output = join(directory, 'panels.html');
  const result = run(
    'html',
    join(panels, 'estimate.cso.py'),
    'estimate',
    output,
    ['--input', 'width=2'],
    false,
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.report.checks.documentContent.status).toBe('passed');
  expect(result.report.checks.rendering.status).toBe('not_applicable');
  expect(result.report.checks.visualInspection.status).toBe('pending');
  expect(result.report.output?.sha256).toBe(hash(readFileSync(output)));
  const locatorLine = result.stderr
    .split('\n')
    .find((line) => line.startsWith('CSO evidence '));
  if (!locatorLine) throw new Error('Missing evidence locator');
  const locator = JSON.parse(locatorLine.slice('CSO evidence '.length));
  const manifest = JSON.parse(readFileSync(locator.path, 'utf8'));
  expect(manifest.html).toEqual(result.report.output);
  expect(manifest.outcomes.engineeringPresentation.automatic).toBe(
    'not_applicable',
  );
  expect(manifest.prospectiveCommandReport.sha256).toBe(
    hash(Buffer.from(result.stdout)),
  );
  expect(
    JSON.parse(
      readFileSync(join(dirname(locator.path), 'execution.json'), 'utf8'),
    ).ok,
  ).toBe(true);
  await inspectMedia(output, async (page) => {
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('[data-formula-sheet]');
      if (!sheet) throw new Error('Missing sheet');
      return {
        width: sheet.getBoundingClientRect().width,
        math: sheet.querySelectorAll('math').length,
        images: Array.from(document.images, (image) => image.naturalWidth),
      };
    });
    expect(layout.width).toBeCloseTo((190 * 96) / 25.4, 1);
    expect(layout.math).toBeGreaterThan(0);
    expect(layout.images.length).toBeGreaterThan(0);
    expect(layout.images.every((width) => width > 0)).toBe(true);
  });
}, 30_000);

test('checks the HTML in Chromium when requested', () => {
  const result = run(
    'html',
    join(panels, 'estimate.cso.py'),
    'estimate',
    join(directory, 'checked.html'),
    ['--input', 'width=2', '--check-layout', '--no-evidence'],
  );
  expect(result.status, result.stdout).toBe(0);
  expect(result.report.checks.rendering.status).toBe('passed');
  expect(result.stderr).not.toContain('CSO evidence');
}, 30_000);

test.each(['fraction', 'conditional', 'qualified'])(
  'rejects overflowing %s notation in HTML and PDF without replacing output',
  (kind) => {
    const source = join(directory, `${kind}.cso.py`);
    let fixture = readFileSync(
      'tests/integration/installed/fixtures/overflow.cso.py.txt',
      'utf8',
    );
    if (kind === 'conditional')
      fixture = replaceFixture(
        fixture,
        ' / 2',
        ' / 2 if input_value > 0 else 0',
      );
    if (kind === 'qualified')
      fixture = replaceFixture(fixture, 'x_{src}', 'x_{src,bs}');
    writeFileSync(source, fixture);
    const unchecked = run(
      'html',
      source,
      'polynomial',
      join(directory, `${kind}-preview.html`),
      ['--no-evidence'],
      false,
    );
    expect(unchecked.status, unchecked.stdout).toBe(0);
    const issues = assertLayoutRejected(source, kind);
    expect(
      issues.every(
        (item) =>
          item.layout?.sourcePlacementId &&
          item.layout.selector.includes('data-source-placement'),
      ),
    ).toBe(true);
  },
  30_000,
);

test('preserves HTML on evidence-write failure and explains it without claiming browser checks', () => {
  const output = join(directory, 'obstructed.html');
  writeFileSync(output, 'previous HTML');
  writeFileSync(`${output}.evidence`, 'obstruction');
  const result = run(
    'html',
    join(panels, 'estimate.cso.py'),
    'estimate',
    output,
    [],
    false,
  );
  expect(result.status).toBe(1);
  expect(readFileSync(output, 'utf8')).toBe('previous HTML');
  expect(result.report.checks.rendering.status).toBe('not_applicable');
  expect(
    result.report.diagnostics.some(
      (item) => item.code === 'HTML_PUBLICATION_FAILED',
    ),
  ).toBe(true);
});

test('rejects title text beyond the sheet even when it fits the browser viewport', async () => {
  const source = join(directory, 'title.cso.py');
  const fixture = readFileSync(
    'tests/integration/installed/fixtures/overflow.cso.py.txt',
    'utf8',
  );
  const titled = replaceFixture(
    fixture,
    'Synthetic layout regression',
    'W'.repeat(45),
  );
  writeFileSync(
    source,
    replaceFixture(titled, /\(input_value \*\* 1.*\) \/ 2/, 'input_value / 2'),
  );
  const preview = join(directory, 'title-preview.html');
  const unchecked = run('html', source, 'polynomial', preview, [
    '--no-evidence',
  ]);
  expect(unchecked.status, unchecked.stdout).toBe(0);
  await inspectMedia(preview, async (page) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const bounds = await page.evaluate(() => {
      const title = document.querySelector('h1');
      const sheet = document.querySelector('[data-formula-sheet]');
      if (!title || !sheet) throw new Error('Missing title or sheet');
      const range = document.createRange();
      range.selectNodeContents(title);
      return {
        textRight: range.getBoundingClientRect().right,
        sheetRight: sheet.getBoundingClientRect().right,
        viewportRight: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(bounds.textRight).toBeGreaterThan(bounds.sheetRight + 2);
    expect(bounds.textRight).toBeLessThan(bounds.viewportRight);
    expect(bounds.scrollWidth).toBe(bounds.viewportRight);
  });
  const issues = assertLayoutRejected(source, 'title');
  expect(
    issues.every((item) => item.layout?.selector === '[data-formula-sheet]'),
  ).toBe(true);
}, 30_000);
