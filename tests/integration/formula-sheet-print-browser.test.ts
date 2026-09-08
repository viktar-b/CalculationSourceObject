import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { printFormulaSheet } from '../../packages/cso-react/src/formula-sheet/print';

declare global {
  interface Window {
    specPrint: typeof printFormulaSheet;
    printProbe: {
      pending: { resolve: () => void; reject: (error: Error) => void }[];
      errors: string[];
      prints: number;
      listeners: Set<EventListenerOrEventListenerObject>;
    };
  }
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

const setup = async (): Promise<Page> => {
  const page = await browser.newPage();
  await page.clock.install();
  await page.setContent(
    '<title>Original</title><article data-formula-sheet><img></article>',
  );
  const source = readFileSync(
    new URL(
      '../../packages/cso-react/src/formula-sheet/print.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const { outputText } = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2020,
    },
  });
  await page.addScriptTag({
    content: `window.specPrint = (() => { const exports = {}; ${outputText}; return exports.printFormulaSheet; })();`,
  });
  await page.evaluate(() => {
    window.printProbe = {
      pending: [],
      errors: [],
      prints: 0,
      listeners: new Set(),
    };
    window.print = () => {
      window.printProbe.prints++;
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      ...args: Parameters<EventTarget['addEventListener']>
    ) {
      if (this === window && args[0] === 'afterprint' && args[1])
        window.printProbe.listeners.add(args[1]);
      return add.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (
      ...args: Parameters<EventTarget['removeEventListener']>
    ) {
      if (this === window && args[0] === 'afterprint' && args[1])
        window.printProbe.listeners.delete(args[1]);
      return remove.apply(this, args);
    };
    HTMLImageElement.prototype.decode = () =>
      new Promise<void>((resolve, reject) => {
        window.printProbe.pending.push({ resolve, reject });
      });
  });
  return page;
};
const start = (page: Page, title = 'First') =>
  page.evaluate(
    (title) =>
      window.specPrint({
        title,
        onError: (error) => window.printProbe.errors.push(String(error)),
      }),
    title,
  );
const snapshot = (page: Page) =>
  page.evaluate(() => ({
    roots: document.querySelectorAll('[data-formula-sheet-print-root]').length,
    printing: document.body.classList.contains('formula-sheet-printing'),
    title: document.title,
    listeners: window.printProbe.listeners.size,
    prints: window.printProbe.prints,
    errors: [...window.printProbe.errors],
  }));
const clean = { roots: 0, printing: false, title: 'Original', listeners: 0 };

test.each(['resolve', 'reject'] as const)(
  'timeout releases ownership and ignores late %s during retry',
  async (settlement) => {
    const page = await setup();
    try {
      expect(await start(page)).toBe(true);
      expect(await start(page, 'Concurrent')).toBe(false);
      await page.clock.runFor(14_000);
      expect(await snapshot(page)).toMatchObject({
        roots: 1,
        printing: true,
        title: 'First',
        listeners: 1,
        prints: 0,
        errors: [],
      });
      await page.clock.runFor(1_100);
      expect(await snapshot(page)).toEqual({
        ...clean,
        prints: 0,
        errors: ['Error: Image preparation timed out before printing.'],
      });
      expect(await start(page, 'Second')).toBe(true);
      const second = await snapshot(page);
      await page.evaluate((settlement) => {
        const pending = window.printProbe.pending[0];
        if (settlement === 'resolve') pending?.resolve();
        else pending?.reject(new Error('Late failure'));
      }, settlement);
      expect(await snapshot(page)).toEqual(second);
      await page.evaluate(() => window.printProbe.pending[1]?.resolve());
      expect(await snapshot(page)).toMatchObject({
        roots: 1,
        title: 'Second',
        prints: 1,
      });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await page.clock.runFor(30_000);
      expect(await snapshot(page)).toEqual({
        ...clean,
        prints: 1,
        errors: second.errors,
      });
    } finally {
      await page.close();
    }
  },
);

test('ready images print once and fallback cleanup cancels preparation timeout', async () => {
  const page = await setup();
  try {
    await start(page);
    await page.evaluate(() => window.printProbe.pending[0]?.resolve());
    expect(await snapshot(page)).toMatchObject({ roots: 1, prints: 1 });
    await page.clock.runFor(1_100);
    expect(await snapshot(page)).toEqual({ ...clean, prints: 1, errors: [] });
    await page.clock.runFor(30_000);
    expect(await snapshot(page)).toEqual({ ...clean, prints: 1, errors: [] });
  } finally {
    await page.close();
  }
});

test.each(['reject', 'throw', 'print'] as const)(
  '%s errors clean up and report once',
  async (failure) => {
    const page = await setup();
    try {
      await page.evaluate((failure) => {
        HTMLImageElement.prototype.decode = () => {
          if (failure === 'throw') throw new Error('Decode failure');
          return failure === 'reject'
            ? Promise.reject(new Error('Decode failure'))
            : Promise.resolve();
        };
        if (failure === 'print')
          window.print = () => {
            throw new Error('Print failure');
          };
      }, failure);
      await start(page);
      await page.clock.runFor(30_000);
      expect(await snapshot(page)).toEqual({
        ...clean,
        prints: 0,
        errors: [
          failure === 'print'
            ? 'Error: Print failure'
            : 'Error: Decode failure',
        ],
      });
    } finally {
      await page.close();
    }
  },
);
