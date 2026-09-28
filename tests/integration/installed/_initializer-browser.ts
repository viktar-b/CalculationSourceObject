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
  readonly reportId: string;
  readonly reportTitle: string;
}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
    });
    await page.goto(options.origin, { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: options.reportTitle, exact: true })
      .click();
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
    const reportMatch = new RegExp(
      `^/api/reports/${options.reportId}/runs/([\\da-f-]{36})/report\\.html$`,
    ).exec(reportPath ?? '');
    assert(reportMatch?.[1]);
    const runBase = `/api/reports/${options.reportId}/runs/${reportMatch[1]}`;
    assert.equal(pdfPath, `${runBase}/report.pdf`);
    assert.equal(evidencePath, `${runBase}/evidence.json`);
    assert.match(
      await page.locator('#checks').innerText(),
      /Human visual inspection:\s*pending/i,
    );
    if (options.reportId === 'rectangle-area')
      assert.match(
        await page.locator('#checks').innerText(),
        /Independent reference agreement:\s*pending, no matching reference/i,
      );
    await page.setViewportSize({ width: 950, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    const narrowInputs = await page.locator('#inputs').boundingBox();
    const narrowReport = await page.locator('#report').boundingBox();
    assert(narrowInputs && narrowReport && narrowReport.y > narrowInputs.y);
    await page.setViewportSize({ width: 1400, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    const wideInputs = await page.locator('#inputs').boundingBox();
    const wideReport = await page.locator('#report').boundingBox();
    assert(wideInputs && wideReport && wideReport.x > wideInputs.x);
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
    if (options.reportId === 'rectangle-area') {
      await page.locator('[name=width]').fill('-0');
      assert.match(await page.locator('#curl').innerText(), /"width":-0\.0/);
      await page.locator('#calculate').click();
      await page.locator('#outputs').filter({ hasText: '-0.0' }).waitFor();
      const signedReportPath = await page
        .locator('iframe#report')
        .getAttribute('src');
      const signedRun = /\/runs\/([\da-f-]{36})\/report\.html$/.exec(
        signedReportPath ?? '',
      );
      assert(signedRun?.[1]);
      const signedEvidence = EvidenceSchema.parse(
        await (
          await fetch(
            new URL(
              `/api/reports/rectangle-area/runs/${signedRun[1]}/evidence.json`,
              options.origin,
            ),
          )
        ).json(),
      );
      assert(
        Object.is(
          signedEvidence.execution.execution.entry.resolvedInputs.width,
          -0,
        ),
      );
    }
  } finally {
    await browser.close();
  }
}

export async function exerciseFailureFeedback(origin: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('[name=height]').fill('0');
    await page.locator('#calculate').click();
    await page
      .locator('#status')
      .filter({ hasText: /ZeroDivisionError: division by zero/ })
      .waitFor();
    await page
      .getByRole('button', { name: 'Two-panel estimate', exact: true })
      .click();
    await page.locator('a#pdf').waitFor({ state: 'visible' });
    await page.locator('a#pdf').click();
    await page
      .locator('#status')
      .filter({ hasText: /Executable doesn't exist/ })
      .waitFor();
    assert.match(
      await page.locator('#checks').innerText(),
      /PDF layout:\s*failed/i,
    );
    const evidencePath = await page.locator('a#evidence').getAttribute('href');
    assert(evidencePath);
    const evidenceResponse = await fetch(new URL(evidencePath, origin));
    assert.equal(evidenceResponse.status, 200);
    await evidenceResponse.arrayBuffer();
  } finally {
    await browser.close();
  }
}
