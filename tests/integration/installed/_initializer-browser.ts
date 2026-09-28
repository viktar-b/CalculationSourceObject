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
    const context = await browser.newContext({
      viewport: { width: 950, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const startupFailurePage = await context.newPage();
    await startupFailurePage.route('**/api/reports', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Catalog unavailable' }),
      }),
    );
    await startupFailurePage.goto(options.origin, { waitUntil: 'networkidle' });
    const startupError = startupFailurePage.locator('#problem');
    await startupError.waitFor({ state: 'visible' });
    assert.equal(await startupError.innerText(), 'Catalog unavailable');
    assert.equal(
      await startupFailurePage.locator('[data-slot=sheet-content]').count(),
      0,
    );
    await startupFailurePage.close();
    const page = await context.newPage();
    await page.goto(options.origin, { waitUntil: 'networkidle' });
    const reportMenu = page.getByRole('button', { name: 'Choose report' });
    await reportMenu.click();
    const menu = page.locator('[data-slot=dropdown-menu-content]');
    await menu.waitFor({ state: 'visible' });
    const menuBox = await menu.boundingBox();
    assert(menuBox && menuBox.width >= 250 && menuBox.x + menuBox.width <= 950);
    const navbarBox = await page.locator('header').boundingBox();
    assert(navbarBox && menuBox.y >= navbarBox.y + navbarBox.height);
    assert.equal(
      await menu.evaluate((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return 0;
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3];
      }),
      255,
      'The report must not show through the dropdown',
    );
    assert(
      await menu.evaluate((element) => {
        const menuTop = element.getBoundingClientRect().top;
        const navbarBottom = document
          .querySelector('header')
          ?.getBoundingClientRect().bottom;
        return (
          navbarBottom !== undefined &&
          (menuTop >= navbarBottom ||
            element.contains(
              document.elementFromPoint(
                element.getBoundingClientRect().left + 12,
                menuTop + 4,
              ),
            ))
        );
      }),
      'The dropdown must paint above the navbar where they overlap',
    );
    assert(
      await page
        .getByRole('menuitem')
        .evaluateAll((items) =>
          items.every((item) => item.getBoundingClientRect().height < 40),
        ),
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    await reportMenu.focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('menuitem', { name: options.reportTitle, exact: true })
      .click();
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await page.locator('[data-slot=sheet-content]').waitFor();
    assert.equal(await page.locator('[data-slot=sheet-overlay]').count(), 0);
    await page.locator('iframe#report').waitFor({ state: 'visible' });
    assert(await page.locator('iframe#report').getAttribute('src'));
    const initialReportText = await page
      .frameLocator('iframe#report')
      .locator('body')
      .innerText();
    assert(
      (options.initialText ?? []).every((value) =>
        initialReportText.includes(value),
      ),
    );
    assert.equal(await page.locator('#outputs').count(), 0);
    assert.equal(await page.locator('#fields p').count(), 0);
    assert.equal(
      await page
        .getByText('Reload after changing the Python input definitions.')
        .count(),
      0,
    );
    await page.locator('[name=width]').fill(options.width);
    assert.equal(await page.locator('button#pdf').isDisabled(), true);
    assert.equal(await page.locator('iframe#report').isHidden(), true);
    await page.locator('#calculate').click();
    await page.locator('iframe#report').waitFor({ state: 'visible' });
    const reportText = await page
      .frameLocator('iframe#report')
      .locator('body')
      .innerText();
    assert(options.expectedText.every((value) => reportText.includes(value)));
    const reportPath = await page.locator('iframe#report').getAttribute('src');
    const evidencePath = await page.locator('a#evidence').getAttribute('href');
    const reportMatch = new RegExp(
      `^/api/reports/${options.reportId}/runs/([\\da-f-]{36})/report\\.html$`,
    ).exec(reportPath ?? '');
    assert(reportMatch?.[1]);
    const runBase = `/api/reports/${options.reportId}/runs/${reportMatch[1]}`;
    assert.equal(evidencePath, `${runBase}/evidence.json`);
    assert.match(
      await page.locator('#checks').innerText(),
      /Human inspection\s+WIP/i,
    );
    if (options.reportId === 'rectangle-area')
      assert.match(
        await page.locator('#checks').innerText(),
        /Independent reference\s+WIP/i,
      );
    await page.setViewportSize({ width: 950, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    const narrowSheet = await page
      .locator('[data-slot=sheet-content]')
      .boundingBox();
    const narrowReport = await page.locator('#report').boundingBox();
    assert(narrowSheet && narrowReport && narrowSheet.x > narrowReport.x);
    await page.evaluate(() => window.scrollTo(0, 300));
    assert((await page.evaluate(() => window.scrollY)) > 0);
    await page.setViewportSize({ width: 950, height: 300 });
    await page.locator('#calculation-sheet-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    assert(
      (await page
        .locator('#calculation-sheet-scroll')
        .evaluate((element) => element.scrollTop)) > 0,
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    const wideSheet = await page
      .locator('[data-slot=sheet-content]')
      .boundingBox();
    const wideReport = await page.locator('#report').boundingBox();
    assert(wideSheet && wideReport && wideSheet.x > wideReport.x);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: options.screenshot, fullPage: true });
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator('button#pdf').click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    await download.saveAs(options.downloadPath);
    assert.equal(
      new TextDecoder().decode(
        readFileSync(options.downloadPath).subarray(0, 5),
      ),
      '%PDF-',
    );
    await page.waitForFunction(() =>
      document.querySelector('#status')?.textContent?.includes('PDF ready'),
    );
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
      await page.getByRole('button', { name: 'API', exact: true }).click();
      const command = await page.locator('#curl').innerText();
      assert.match(command, /"width":-0\.0/);
      assert.match(command, /curl -sS --fail-with-body \\\n/);
      assert((await page.locator('#curl [data-syntax]').count()) > 4);
      await page.locator('#copy-curl').click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        command,
      );
      await page.locator('#copy-curl').filter({ hasText: 'Copied' }).waitFor();
      await page.getByRole('button', { name: 'Inputs', exact: true }).click();
      await page.locator('#calculate').click();
      await page.locator('iframe#report').waitFor({ state: 'visible' });
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
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await page.locator('[name=height]').fill('0');
    await page.locator('#calculate').click();
    await page
      .locator('#problem')
      .filter({ hasText: /ZeroDivisionError: division by zero/ })
      .waitFor();
    await page.getByRole('button', { name: 'Choose report' }).click();
    await page
      .getByRole('menuitem', { name: 'Two-panel estimate', exact: true })
      .click();
    await page.locator('button#pdf:enabled').waitFor();
    await page.getByRole('button', { name: 'Inputs', exact: true }).click();
    await page.locator('button#pdf').click();
    await page
      .locator('#problem')
      .filter({ hasText: /Executable doesn't exist/ })
      .waitFor();
    assert.match(
      await page.locator('#checks').innerText(),
      /PDF layout\s+Failed/i,
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
