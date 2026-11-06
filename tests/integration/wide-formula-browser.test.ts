import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createSheetFromCalculationSourceObject,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import {
  FormulaSheet,
  PreparedFormulaSheet,
  prepareExecutionDocument,
} from '@cs-object/react';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

test('wide conditionals fit the row and every equals sign stays with its expression', async () => {
  const source = fileURLToPath(
    new URL('./fixtures/wide-conditional.cso.py', import.meta.url),
  );
  const captured = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-m', 'cso_python', 'execute', source, '--function', 'calculate'],
    { encoding: 'utf8' },
  );
  expect(captured.status, captured.stdout + captured.stderr).toBe(0);
  const response = ExecutionResponseSchema.parse(JSON.parse(captured.stdout));
  if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
  expect(verifyExecution({ execution: response.execution }).ok).toBe(true);
  const { sheet } = createSheetFromCalculationSourceObject(
    response.execution.cso,
    { id: 'wide', label: 'Wide conditional regression' },
  );
  const preparedDocument = prepareExecutionDocument({
    execution: response.execution,
    assets: [],
  });
  // The original issue used SheetDocument literals without source drafts.
  const legacySheet = {
    ...sheet,
    symbols: sheet.symbols.map((symbol) => ({
      ...symbol,
      valueTree: {
        ...symbol.valueTree,
        nodes: symbol.valueTree.nodes.map((node) =>
          node.kind === 'literal' ? { ...node, draft: undefined } : node,
        ),
      },
    })),
  };
  const css = readFileSync(
    new URL(import.meta.resolve('@cs-object/react/style.css')),
    'utf8',
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 1400 },
    });
    for (const markup of [
      renderToStaticMarkup(createElement(FormulaSheet, { sheet: legacySheet })),
      renderToStaticMarkup(createElement(FormulaSheet, { sheet })),
      renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document: preparedDocument }),
      ),
    ]) {
      await page.setContent(`<style>${css}</style>${markup}`);
      await page.evaluate(() => document.fonts.ready);
      for (const media of ['screen', 'print'] as const) {
        await page.emulateMedia({ media });
        const row = page.locator('.cso-symbol-row').last();
        const measurement = await row.evaluate((row) => {
          const bounds = row.getBoundingClientRect();
          const maths = [...row.querySelectorAll('math')];
          return {
            overflow: Math.max(
              ...maths
                .flatMap((math) => [math, ...math.querySelectorAll('*')])
                .map(
                  (node) => node.getBoundingClientRect().right - bounds.right,
                ),
            ),
            isolatedEquals: maths.filter((math, index) => {
              if (math.textContent?.trim() !== '=') return false;
              const next = maths[index + 1]?.getBoundingClientRect();
              const sign = math.getBoundingClientRect();
              return (
                !next || next.top >= sign.bottom || sign.top >= next.bottom
              );
            }).length,
            equals: [...row.querySelectorAll('mo')].filter(
              (node) => node.textContent === '=',
            ).length,
          };
        });
        expect.soft(measurement, media).toMatchObject({
          isolatedEquals: 0,
          equals: 2,
        });
        expect
          .soft(measurement.overflow, `${media} row overflow`)
          .toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await browser.close();
  }
});
