import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type {
  SheetDocument,
  SheetSymbol,
  SheetValueNode,
} from '@cs-object/core';
import { FormulaSheet } from '@cs-object/react';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

type Expression =
  | number
  | string
  | {
      readonly operation: string;
      readonly args: readonly Expression[];
    };
const operation = (id: string, ...args: Expression[]): Expression => ({
  operation: `fg.${id}`,
  args,
});
const condition = operation('gt', 'area', 'width');
const formulas = {
  simple: operation('cnd', condition, 'area', 'width'),
  tall: operation(
    'cnd',
    condition,
    operation('divide', operation('pow', 'area', 2), 'width'),
    operation('sqrt', 'factor'),
  ),
  nested: operation(
    'cnd',
    condition,
    operation('cnd', condition, 'area', 'width'),
    'factor',
  ),
  fractional: operation(
    'pow',
    operation('add', 'area', 'width'),
    operation('divide', 1, operation('add', 'factor', 2)),
  ),
  powers: operation('pow', 'area', operation('pow', 'width', 'factor')),
  square: operation('pow', 'area', 2),
};

const valueTree = (expression: Expression): SheetSymbol['valueTree'] => {
  const nodes: SheetValueNode[] = [];
  let nextKey = 0;
  const lower = (expression: Expression): string => {
    const key = `node-${nextKey++}`;
    if (typeof expression === 'number') {
      nodes.push({
        kind: 'literal',
        key,
        value: { kind: 'number', value: expression },
      });
    } else if (typeof expression === 'string') {
      nodes.push({ kind: 'symbol', key, symbolId: expression });
    } else {
      const argKeys = expression.args.map(lower);
      nodes.push({
        kind: 'function',
        key,
        functionId: expression.operation,
        argKeys,
      });
    }
    return key;
  };
  return {
    rootKey: lower(expression),
    nodes,
    result: {
      kind: 'number',
      value: typeof expression === 'number' ? expression : 0,
    },
  };
};

// Supplied results are placeholders. This fixture verifies layout, not arithmetic.
const inputSymbols: SheetSymbol[] = [
  {
    id: 'area',
    glyph: 'A_{eff}',
    description: 'Area',
    unit: '',
    valueTree: valueTree(1234.56),
  },
  {
    id: 'width',
    glyph: 'b_{web}',
    description: 'Width',
    unit: '',
    valueTree: valueTree(78.9),
  },
  {
    id: 'factor',
    glyph: 'gamma_{M0}',
    description: 'Factor',
    unit: '',
    valueTree: valueTree(1.25),
  },
];
const require = createRequire(import.meta.url);
const css = readFileSync(require.resolve('@cs-object/react/style.css'), 'utf8');
const markup = Object.entries(formulas)
  .map(([id, expression]) => {
    const sheet: SheetDocument = {
      id,
      title: `Synthetic ${id} layout probe`,
      rootSectionId: 'root',
      sections: [{ id: 'root', title: id, items: [{ kind: 'symbol', id }] }],
      symbols: [
        ...inputSymbols,
        {
          id,
          glyph: `Q_{${id === 'square' ? 'sqr' : id}}`,
          description: id,
          unit: '',
          valueTree: valueTree(expression),
        },
      ],
    };
    return `<section data-probe="${id}">${renderToStaticMarkup(createElement(FormulaSheet, { sheet }))}</section>`;
  })
  .join('');

test('conditional branches and power scripts stay legible in screen and print', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style>${markup}`);
    for (const media of ['screen', 'print'] as const) {
      await page.emulateMedia({ media });
      await page.evaluate(() => document.fonts.ready);
      const branches = await page.locator('mtable').evaluateAll((tables) =>
        tables.map((table) => {
          const rows = [...table.querySelectorAll(':scope > mtr')];
          const contentBounds = (row: Element) =>
            [...row.children].map((cell) => {
              const range = document.createRange();
              range.selectNodeContents(cell);
              return range.getBoundingClientRect();
            });
          const first = rows[0];
          const second = rows[1];
          if (!first || !second) throw new Error('Missing conditional branch');
          const firstBounds = contentBounds(first);
          const secondBounds = contentBounds(second);
          const value = firstBounds[0];
          const label = firstBounds[1];
          if (!value || !label)
            throw new Error('Missing branch value or label');
          return {
            vertical:
              Math.min(...secondBounds.map((b) => b.top)) -
              Math.max(...firstBounds.map((b) => b.bottom)),
            horizontal: label.left - value.right,
          };
        }),
      );
      expect(branches.length).toBeGreaterThan(0);
      for (const gap of branches) {
        expect(gap.vertical, `${media} branch gap`).toBeGreaterThanOrEqual(4);
        expect(gap.vertical, `${media} excessive branch gap`).toBeLessThan(16);
        expect(
          gap.horizontal,
          `${media} value/condition gap`,
        ).toBeGreaterThanOrEqual(7);
      }
      const scripts = await page.locator('msup').evaluateAll((powers) =>
        powers.map((power) => {
          const base = power.children[0];
          const exponent = power.children[1];
          if (!base || !exponent) throw new Error('Missing power operand');
          const baseBounds = base.getBoundingClientRect();
          const exponentBounds = exponent.getBoundingClientRect();
          return {
            gap: exponentBounds.left - baseBounds.right,
            raised: baseBounds.bottom - exponentBounds.bottom,
            baseSize: Number.parseFloat(getComputedStyle(base).fontSize),
            exponentSize: Number.parseFloat(
              getComputedStyle(exponent).fontSize,
            ),
            leaves: [...exponent.querySelectorAll('mi, mn, mtext')].map(
              (leaf) => Number.parseFloat(getComputedStyle(leaf).fontSize),
            ),
          };
        }),
      );
      for (const script of scripts) {
        expect(script.gap, `${media} detached exponent`).toBeLessThan(3);
        expect(
          script.gap,
          `${media} colliding exponent`,
        ).toBeGreaterThanOrEqual(-0.5);
        expect(script.raised, `${media} exponent position`).toBeGreaterThan(2);
        expect(script.exponentSize, `${media} script size`).toBeLessThan(
          script.baseSize,
        );
        for (const size of script.leaves) {
          expect(size, `${media} exponent leaf size`).toBeLessThanOrEqual(
            script.exponentSize,
          );
          expect(size, `${media} exponent legibility`).toBeGreaterThanOrEqual(
            7,
          );
        }
      }
      // Compound bases and fractional/nested exponents retain their grouping.
      expect(
        await page.locator('[data-probe="fractional"] msup mfrac').count(),
      ).toBeGreaterThan(0);
      expect(
        await page.locator('[data-probe="powers"] msup msup').count(),
      ).toBeGreaterThan(0);
      expect(
        await page
          .locator('[data-probe="fractional"] msup > :first-child')
          .first()
          .textContent(),
      ).toMatch(/\(.*\)/);
    }
  } finally {
    await browser.close();
  }
});
