import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as esm from '@cs-object/core';
const require = createRequire(import.meta.url);
const mode = process.argv[2];
const cjs = require('@cs-object/core');
const values = [];
for (const width of [2, 4]) {
  // Independently calculated expectations for the synthetic rectangle fixture.
  const expected = { w: width, h: 3, A: width * 3, P: 2 * (width + 3) };
  for (const api of [esm, cjs]) {
    const input = JSON.parse(readFileSync(`rectangle-${width}.json`, 'utf8'));
    const source = api.CalculationSourceObjectSchema.parse(input);
    const symbols = source.sections.flatMap((section) =>
      section.items
        .filter((item) => item.kind === 'symbol')
        .map((item) => item.symbol),
    );
    assert.equal(symbols.length, 4);
    assert.deepEqual(
      new Set(symbols.map((symbol) => symbol.glyph)),
      new Set(Object.keys(expected)),
    );
    for (const symbol of symbols) {
      const actual = symbol.valueTree.result;
      assert.equal(actual.kind, 'number');
      const target = expected[symbol.glyph];
      const tolerance = Math.max(
        1e-9,
        1e-12 * Math.max(Math.abs(actual.value), Math.abs(target)),
      );
      assert(
        Math.abs(actual.value - target) <= tolerance,
        `${symbol.glyph}: ${actual.value} vs ${target}`,
      );
      if (api === esm)
        values.push({
          width,
          glyph: symbol.glyph,
          actual: actual.value,
          expected: target,
          absoluteTolerance: 1e-9,
          relativeTolerance: 1e-12,
        });
    }
    const { sheet, diagnostics } = api.createSheetFromCalculationSourceObject(
      source,
      { id: 'rectangle', label: source.title },
    );
    assert.equal(sheet.symbols.length, 4);
    assert.equal(diagnostics.unresolvedReferences, 0);
    if (mode === 'react' && api === esm) {
      const React = await import('react');
      const { renderToStaticMarkup } = await import('react-dom/server');
      const renderer = await import('@cs-object/react');
      const html = renderToStaticMarkup(
        React.createElement(renderer.FormulaSheet, { sheet }),
      );
      assert(html.includes('<math'));
      assert(html.includes(width === 2 ? '6.00' : '12.00'));
      const css = readFileSync(
        require.resolve('@cs-object/react/style.css'),
        'utf8',
      );
      assert(css.includes('formula-sheet-printing'));
      writeFileSync(
        `render-${width}.html`,
        `<!doctype html><style>${css}</style>${html}`,
      );
    }
    if (mode === 'cli') {
      assert.deepEqual(
        JSON.parse(readFileSync(`cli-${width}.json`, 'utf8')),
        input,
      );
    }
  }
}
for (const dependency of mode === 'core'
  ? ['react', 'react-dom', 'playwright', 'next', '@cs-object/cli']
  : mode === 'react'
    ? ['playwright', 'next', '@cs-object/cli']
    : ['next', 'tsx', 'typescript', 'vitest']) {
  assert.throws(
    () => require.resolve(dependency),
    `${dependency} must be absent`,
  );
}
assert.throws(() => require.resolve('@cs-object/core/src/index.ts'));
if (mode === 'cli') {
  const typo = esm.CommandReportSchema.parse(
    JSON.parse(readFileSync('unknown-command.json', 'utf8')),
  );
  assert.equal(typo.command, undefined);
  assert.equal(typo.diagnostics[0].code, 'UNKNOWN_COMMAND');
  const rectangle = esm.CalculationSourceObjectSchema.parse(
    JSON.parse(readFileSync('rectangle.json', 'utf8')),
  );
  const results = rectangle.sections.flatMap((section) =>
    section.items
      .filter((item) => item.kind === 'symbol')
      .map((item) => item.symbol.valueTree.result.value),
  );
  assert.deepEqual(
    results,
    [2, 3, 6, 10],
    'Distinct repeated inputs reach the real installed Python function',
  );
  const unicode = esm.CalculationSourceObjectSchema.parse(
    JSON.parse(readFileSync('unicode.json', 'utf8')),
  );
  const unicodeResults = unicode.sections.flatMap((section) =>
    section.items
      .filter((item) => item.kind === 'symbol')
      .map((item) => item.symbol.valueTree.result.value),
  );
  assert.deepEqual(
    unicodeResults,
    [2, 3, 6, 10],
    'Unicode function/input names reach the installed Python function',
  );
  const compatibility = esm.CalculationSourceObjectSchema.parse(
    JSON.parse(readFileSync('compatibility.json', 'utf8')),
  );
  const compatibilityResults = compatibility.sections.flatMap((section) =>
    section.items
      .filter((item) => item.kind === 'symbol')
      .map((item) => item.symbol.valueTree.result.value),
  );
  assert.deepEqual(
    compatibilityResults,
    [2, 3, 6, 10],
    'Python NFKC identifiers resolve through the installed exporter',
  );
  for (const command of ['verify', 'pdf']) {
    const report = esm.CommandReportSchema.parse(
      JSON.parse(readFileSync(`${command}-unavailable.json`, 'utf8')),
    );
    assert.equal(report.ok, false);
    assert.equal(report.output, undefined);
    assert(
      Object.values(report.checks).every(
        (check) => check.status === 'not_applicable',
      ),
    );
  }
}
writeFileSync('rectangle-comparisons.json', JSON.stringify(values, null, 2));
process.stdout.write(
  `PASS ${mode} installed consumer, all four rectangle values at widths 2 and 4\n`,
);
