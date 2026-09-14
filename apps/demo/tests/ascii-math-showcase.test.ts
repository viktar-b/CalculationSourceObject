import {
  assertNever,
  parseNotation,
  type NotationExpression,
  type NotationNode,
  type SheetDocument,
} from '@viktar-b/cso-core';
import { AsciiMathView, FormulaSheet } from '@viktar-b/cso-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import AsciiMathPage from '../app/ascii/page.tsx';
vi.mock('../app/RoutePrefetcher.tsx', () => ({ RoutePrefetcher: () => null }));
import {
  asciiMathObservedGroups,
  asciiMathShowcaseSummary,
  type AsciiMathShowcaseExample,
} from '../src/ascii-math/showcase.ts';

type MathElementName =
  | 'mi'
  | 'mn'
  | 'mo'
  | 'mtext'
  | 'mfrac'
  | 'msub'
  | 'msup'
  | 'msubsup';

type MathElementCounts = Record<MathElementName, number>;

const mathElementNames: readonly MathElementName[] = [
  'mi',
  'mn',
  'mo',
  'mtext',
  'mfrac',
  'msub',
  'msup',
  'msubsup',
];

const emptyElementCounts = (): MathElementCounts => ({
  mi: 0,
  mn: 0,
  mo: 0,
  mtext: 0,
  mfrac: 0,
  msub: 0,
  msup: 0,
  msubsup: 0,
});

const addNodeCounts = (counts: MathElementCounts, node: NotationNode): void => {
  switch (node.kind) {
    case 'identifier': {
      counts.mi += 1;
      return;
    }
    case 'number': {
      counts.mn += 1;
      return;
    }
    case 'operator': {
      counts.mo += 1;
      return;
    }
    case 'text': {
      counts.mtext += 1;
      return;
    }
    case 'group': {
      if (node.fence !== 'none') {
        counts.mo += 2;
      }
      addExpressionCounts(counts, node.body);
      return;
    }
    case 'fraction': {
      counts.mfrac += 1;
      addNodeCounts(counts, node.numerator);
      addNodeCounts(counts, node.denominator);
      return;
    }
    case 'subscript': {
      counts.msub += 1;
      addNodeCounts(counts, node.base);
      addNodeCounts(counts, node.subscript);
      return;
    }
    case 'superscript': {
      counts.msup += 1;
      addNodeCounts(counts, node.base);
      addNodeCounts(counts, node.superscript);
      return;
    }
    case 'subsup': {
      counts.msubsup += 1;
      addNodeCounts(counts, node.base);
      addNodeCounts(counts, node.subscript);
      addNodeCounts(counts, node.superscript);
      return;
    }
    default:
      assertNever(node);
  }
};

const addExpressionCounts = (
  counts: MathElementCounts,
  expression: NotationExpression,
): void => {
  for (const node of expression) {
    addNodeCounts(counts, node);
  }
};

const countElements = (html: string, element: MathElementName): number =>
  html.match(new RegExp(`<${element}(?: |>)`, 'g'))?.length ?? 0;

const renderExample = (example: AsciiMathShowcaseExample): string =>
  renderToStaticMarkup(
    createElement(AsciiMathView, {
      expression: example.expression,
      optional: example.consumer === 'optional-unit',
    }),
  );

const sheetWithUnit = (unit: string): SheetDocument => ({
  id: 'optional-unit-consumer',
  title: 'Optional unit consumer',
  rootSectionId: 'root',
  sections: [
    {
      id: 'root',
      title: 'Optional unit consumer',
      items: [{ kind: 'symbol', id: 'force' }],
    },
  ],
  symbols: [
    {
      id: 'force',
      glyph: 'F',
      description: 'Force',
      unit,
      valueTree: {
        rootKey: 'value',
        result: { kind: 'number', value: 1 },
        nodes: [
          {
            kind: 'literal',
            key: 'value',
            value: { kind: 'number', value: 1 },
          },
        ],
      },
    },
  ],
});

describe('ASCII showcase observations', () => {
  test('renders upright units on the actual review page', () => {
    const html = renderToStaticMarkup(createElement(AsciiMathPage));
    const units = html.split('<tbody id="units">')[1]?.split('</tbody>')[0];
    expect(units).toBeDefined();
    expect(units).toContain('<mi mathvariant="normal">m</mi>');
    expect(units).toContain('<mi mathvariant="normal">N</mi>');
    expect(units).toContain('<mi mathcolor="red">?</mi>');
  });

  test('reports the authored and observed totals separately', () => {
    expect(asciiMathShowcaseSummary).toEqual({
      total: 125,
      authored: { supported: 94, literal: 22, error: 9 },
      observed: { rendered: 116, error: 9 },
      semanticChecks: 116,
      matches: 125,
      mismatches: 0,
    });
  });

  test('renders every successfully parsed node with its matching MathML element', () => {
    for (const group of asciiMathObservedGroups) {
      for (const observation of group.examples) {
        const html = renderExample(observation.example);
        expect(observation.matchesExpectation, observation.example.label).toBe(
          true,
        );

        const parsed = parseNotation(observation.example.expression);
        if (!parsed.ok) {
          expect(html, observation.example.label).toContain(
            '<mi mathcolor="red">?</mi>',
          );
          continue;
        }

        expect(html, observation.example.label).not.toContain(
          'mathcolor="red"',
        );
        const expectedCounts = emptyElementCounts();
        addExpressionCounts(expectedCounts, parsed.value);
        for (const element of mathElementNames) {
          expect(
            countElements(html, element),
            `${observation.example.label}: ${element}`,
          ).toBe(expectedCounts[element]);
        }
      }
    }
  });

  test('renders every unit case through the FormulaSheet optional-unit path', () => {
    const optionalUnitCases = asciiMathObservedGroups
      .flatMap((group) => group.examples)
      .filter(({ example }) => example.consumer === 'optional-unit');
    expect(optionalUnitCases).toHaveLength(9);

    for (const { example, observed } of optionalUnitCases) {
      const html = renderToStaticMarkup(
        createElement(FormulaSheet, {
          sheet: sheetWithUnit(example.expression),
        }),
      );
      const parsed = parseNotation(example.expression);

      if (observed.status === 'error') {
        expect(html, example.label).toContain('<mi mathcolor="red">?</mi>');
        continue;
      }

      expect(parsed.ok, example.label).toBe(true);
      if (!parsed.ok) {
        continue;
      }
      const expectedCounts = emptyElementCounts();
      addExpressionCounts(expectedCounts, parsed.value);
      const uprightIdentifierCount =
        html.match(/<mi mathvariant="normal">/g)?.length ?? 0;
      expect(uprightIdentifierCount, example.label).toBe(expectedCounts.mi);
    }

    const emptyHtml = renderToStaticMarkup(
      createElement(FormulaSheet, { sheet: sheetWithUnit('') }),
    );

    expect(emptyHtml).not.toContain('<mi mathcolor="red">?</mi>');
  });
});
