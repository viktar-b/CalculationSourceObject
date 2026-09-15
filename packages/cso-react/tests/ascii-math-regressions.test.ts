import type { SheetDocument } from '@cs-object/core';
import { AsciiMathView, FormulaSheet } from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

const renderNotation = (expression: string, optional = false): string =>
  renderToStaticMarkup(createElement(AsciiMathView, { expression, optional }));

const textContent = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replaceAll('&quot;', '"');

describe('ASCII notation regressions', () => {
  test('classifies complete punctuation aliases before fraction and script syntax', () => {
    const solidus = renderNotation('a // b');
    const angle = renderNotation('a /_ b');
    const triangle = renderNotation('a /_\\ b');
    const conjunction = renderNotation('a ^^ b');
    const bottom = renderNotation('x _|_ y');

    expect(solidus).not.toContain('<mfrac>');
    expect(solidus).toContain('<mo>/</mo>');
    expect(angle).not.toContain('<mfrac>');
    expect(angle).toContain('<mo>∠</mo>');
    expect(triangle).not.toContain('<mfrac>');
    expect(triangle).toContain('<mo>△</mo>');
    expect(conjunction).not.toContain('<msup>');
    expect(conjunction).toContain('<mo>∧</mo>');
    expect(bottom).not.toContain('<msub>');
    expect(bottom).toContain('<mo>⊥</mo>');
  });

  test('keeps complete words and unsupported backslash commands literal', () => {
    for (const expression of ['oxygen', 'ooops', 'xxValue', '\\ox']) {
      expect(textContent(renderNotation(expression))).toBe(expression);
    }
  });

  test('renders corrected relations and number sets', () => {
    expect(textContent(renderNotation('ll gg'))).toBe('≪≫');
    expect(textContent(renderNotation('CC NN QQ RR ZZ'))).toBe('ℂℕℚℝℤ');
  });

  test('retains scalar roles in MathML', () => {
    const html = renderNotation('123 + sum "x"');

    expect(html).toContain('<mn>123</mn>');
    expect(html).toContain('<mo>+</mo>');
    expect(html).toContain('<mo>∑</mo>');
    expect(html).toContain('<mtext>x</mtext>');
  });

  test('renders fractions, groups, visible fences, and scripts', () => {
    const fraction = renderNotation('{height+width}/{2}');
    const scripts = renderNotation('A_{rect} mm^{2} x_1^2');
    const fences = renderNotation('(a+b) [c+d]');

    expect(fraction).toContain('<mfrac>');
    expect(fraction).not.toContain('fence="true">{');
    expect(scripts).toContain('<msub>');
    expect(scripts).toContain('<msup>');
    expect(scripts).toContain('<msubsup>');
    expect(fences).toContain('<mo fence="true">(</mo>');
    expect(fences).toContain('<mo fence="true">)</mo>');
    expect(fences).toContain('<mo fence="true">[</mo>');
    expect(fences).toContain('<mo fence="true">]</mo>');
  });

  test('renders transparent groups with the same operator context as their identity', () => {
    expect(renderNotation('{+}a')).toBe(renderNotation('+a'));
    expect(renderNotation('a{+}')).toBe(renderNotation('a+'));
    expect(renderNotation('{a {b c}}')).toBe(renderNotation('{a b c}'));
  });

  test('keeps supplementary Unicode scalars intact', () => {
    expect(renderNotation('𝛼')).toContain('<mi>𝛼</mi>');
  });

  test('shows an error for malformed supplied notation but permits an absent optional value', () => {
    expect(textContent(renderNotation('N/', true))).toBe('?');
    expect(textContent(renderNotation('   ', true))).toBe('?');
    expect(textContent(renderNotation('', true))).toBe('');
  });

  test('handles long flat input without a recursive sequence overflow', () => {
    const html = renderNotation('x '.repeat(10_000));

    expect(html).not.toContain('mathcolor="red"');
    expect(textContent(html).length).toBe(10_000);
  });

  test('renders unit identifiers upright', () => {
    const sheet: SheetDocument = {
      id: 'unit-rendering',
      title: 'Unit rendering',
      rootSectionId: 'root',
      sections: [
        {
          id: 'root',
          title: 'Unit rendering',
          items: [{ kind: 'symbol', id: 'force' }],
        },
      ],
      symbols: [
        {
          id: 'force',
          glyph: 'F',
          description: 'Force',
          unit: 'N',
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
    };
    const html = renderToStaticMarkup(createElement(FormulaSheet, { sheet }));

    expect(html).toContain('<mi mathvariant="normal">N</mi>');
  });
});
