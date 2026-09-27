import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  assertOutputs,
  EvidenceSchema,
  hashBytes,
  RunSchema,
} from './_initializer-evidence.ts';

export async function exerciseBrowser(options: {
  readonly origin: string;
  readonly width: string;
  readonly expectedText: readonly string[];
  readonly screenshot: string;
  readonly downloadPath: string;
  readonly initialText?: readonly string[];
  readonly inputs: Readonly<Record<string, number>>;
  readonly outputs: Readonly<Record<string, number>>;
}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(options.origin, { waitUntil: 'networkidle' });
    await page.locator('#outputs').waitFor({ state: 'visible' });
    await page.waitForFunction((values) => {
      const content = document.querySelector('#outputs')?.textContent ?? '';
      return values.every((value) => content.includes(value));
    }, options.initialText ?? []);
    await page.locator('iframe#report').waitFor({ state: 'visible' });
    assert(await page.locator('iframe#report').getAttribute('src'));
    await page.locator('[name=width]').fill(options.width);
    assert.equal(await page.locator('a#pdf').isHidden(), true);
    assert.equal(await page.locator('iframe#report').isHidden(), true);
    await page.locator('#calculate').click();
    await page.waitForFunction((values) => {
      const content = document.querySelector('#outputs')?.textContent ?? '';
      return values.every((value) => content.includes(value));
    }, options.expectedText);
    const reportPath = await page.locator('iframe#report').getAttribute('src');
    const pdfPath = await page.locator('a#pdf').getAttribute('href');
    const evidencePath = await page.locator('a#evidence').getAttribute('href');
    const reportMatch = /^\/api\/runs\/([\da-f-]{36})\/report\.html$/.exec(
      reportPath ?? '',
    );
    assert(reportMatch?.[1]);
    const runBase = `/api/runs/${reportMatch[1]}`;
    assert.equal(pdfPath, `${runBase}/report.pdf`);
    assert.equal(evidencePath, `${runBase}/evidence.json`);
    assert.match(
      await page.locator('#checks').innerText(),
      /Human visual inspection:\s*pending/i,
    );
    await page.screenshot({ path: options.screenshot, fullPage: true });
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator('a#pdf').click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    await download.saveAs(options.downloadPath);
    assert.equal(
      new TextDecoder().decode(
        readFileSync(options.downloadPath).subarray(0, 5),
      ),
      '%PDF-',
    );
    await page
      .locator('#status')
      .filter({ hasText: /PDF ready.*pending/i })
      .waitFor({ state: 'visible' });
    const summaryResponse = await fetch(new URL(runBase, options.origin));
    assert.equal(summaryResponse.status, 200);
    const summary = RunSchema.parse(await summaryResponse.json());
    assert.equal(summary.id, reportMatch[1]);
    assertOutputs(summary.outputs, options.outputs);
    const evidenceResponse = await fetch(
      new URL(`${runBase}/evidence.json`, options.origin),
    );
    assert.equal(evidenceResponse.status, 200);
    const evidence = EvidenceSchema.parse(await evidenceResponse.json());
    assert.deepEqual(
      evidence.execution.execution.entry.resolvedInputs,
      options.inputs,
    );
    assert.equal(
      evidence.artifacts.pdf?.sha256,
      hashBytes(readFileSync(options.downloadPath)),
    );
  } finally {
    await browser.close();
  }
}
