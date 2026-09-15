import { readFileSync } from 'node:fs';
import {
  createSheetFromCalculationSourceObject,
  ExecutionResponseSchema,
} from '@cs-object/core';
import { FormulaSheet } from '@cs-object/react';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

test('packaged styles retain sheet utilities, responsive spacing and print dimensions', async () => {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../fixtures/contract-cases/two-panel-success.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  if (!response.ok) {
    throw new Error('Expected the synthetic calculation to succeed');
  }
  const { sheet } = createSheetFromCalculationSourceObject(
    response.execution.cso,
    {
      id: 'style-check',
      label: 'Synthetic style check',
    },
  );
  const css = readFileSync(
    new URL(import.meta.resolve('@cs-object/react/style.css')),
    'utf8',
  );
  const html = renderToStaticMarkup(createElement(FormulaSheet, { sheet }));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.setContent(`<style>${css}</style>${html}`);
    const element = page.locator('[data-formula-sheet]');
    const dimensions = await element.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        width: node.getBoundingClientRect().width,
        padding: Number.parseFloat(style.paddingLeft),
        border: style.borderTopWidth,
      };
    });
    expect(dimensions.width).toBeCloseTo((210 * 96) / 25.4, 1);
    expect(dimensions.padding).toBeCloseTo((5 * 96) / 25.4, 1);
    expect(dimensions.border).toBe('1px');
    const section = page.locator('[class~="min-md:px-0"]').first();
    expect(
      await section.evaluate((node) => getComputedStyle(node).borderTopWidth),
    ).toBe('1px');
    expect(
      await section.evaluate((node) => getComputedStyle(node).paddingLeft),
    ).toBe('0px');
    await page.setViewportSize({ width: 390, height: 1000 });
    expect(
      await section.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingLeft),
      ),
    ).toBeCloseTo((3 * 96) / 25.4, 1);
    await page.emulateMedia({ media: 'print' });
    expect(
      await element.evaluate((node) => node.getBoundingClientRect().width),
    ).toBeCloseTo((190 * 96) / 25.4, 1);
    expect(
      await element.evaluate((node) => getComputedStyle(node).paddingLeft),
    ).toBe('0px');
  } finally {
    await browser.close();
  }
});
