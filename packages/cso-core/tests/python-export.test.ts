import {
  createCalculationFromValueTreeJson,
  createPythonFromCalculation,
  createPythonFromSheetDocument,
  createPythonFromValueTreeJson,
  createSheetFromValueTreeJson,
} from '@cs-object/core';
import { describe, expect, test } from 'vitest';

const beamDocument = {
  title: 'Beam',
  sections: [
    {
      title: 'Inputs',
      symbols: [
        {
          id: 'width',
          glyph: 'b',
          unit: 'mm',
          description: 'Width',
          result: 300,
          valueTree: [{ key: 'width-value', literal: 300 }],
        },
        {
          id: 'depth',
          glyph: 'h',
          unit: 'mm',
          description: 'Depth',
          result: 500,
          valueTree: [{ key: 'depth-value', literal: 500 }],
        },
        {
          id: 'area',
          glyph: 'A',
          unit: 'mm^2',
          description: 'Area',
          result: 150000,
          valueTree: [
            {
              key: 'area-root',
              function: 'fg.multiply',
              arguments: ['area-width', 'area-depth'],
            },
            { key: 'area-width', symbol: 'width' },
            { key: 'area-depth', symbol: 'depth' },
          ],
        },
      ],
    },
  ],
};

describe('Python export', () => {
  test.each([
    [2, 'float', '2.0'],
    [-0, 'float', '-0.0'],
    [-0, 'int', '0'],
    [-0, undefined, '0'],
    [1e20, 'float', '100000000000000000000.0'],
    [1e308, 'float', '1e+308'],
    [2, 'int', '2'],
  ] as const)(
    'exports numeric literal %s with kind %s as %s',
    (value, numericKind, expected) => {
      const { sheet } = createSheetFromValueTreeJson(beamDocument, {
        id: 'numbers',
        label: 'Numbers',
      });
      const node = sheet.symbols[0].valueTree.nodes[0];
      if (node.kind !== 'literal') throw new Error('Expected input literal');
      node.value = { kind: 'number', value, numericKind };
      expect(createPythonFromSheetDocument(sheet)).toContain(
        `b = ${expected}\n`,
      );
    },
  );

  test.each([
    [-0, 'float', '(-0.0) ** 2'],
    [-2, 'float', '(-2.0) ** 2'],
    [-2, 'int', '(-2) ** 2'],
    [-2, undefined, '(-2) ** 2'],
  ] as const)(
    'groups a negative literal %s with kind %s as the base of %s',
    (value, numericKind, expected) => {
      const { sheet } = createSheetFromValueTreeJson(beamDocument, {
        id: 'powers',
        label: 'Powers',
      });
      sheet.symbols[0].valueTree = {
        rootKey: 'power',
        result: { kind: 'empty' },
        nodes: [
          {
            key: 'power',
            kind: 'function',
            functionId: 'fg.pow',
            argKeys: ['base', 'exponent'],
          },
          {
            key: 'base',
            kind: 'literal',
            value: { kind: 'number', value, numericKind },
          },
          {
            key: 'exponent',
            kind: 'literal',
            value: { kind: 'number', value: 2, numericKind: 'int' },
          },
        ],
      };
      expect(createPythonFromSheetDocument(sheet)).toContain(
        `b = ${expected}\n`,
      );
    },
  );

  test('normalizes long separator runs in public identifiers', () => {
    const separators = '_'.repeat(100_000);
    const calculation = createCalculationFromValueTreeJson(beamDocument, {
      id: `--Beam${separators}Document--`,
      label: 'Beam',
    });
    const code = createPythonFromCalculation(calculation, {
      functionName: `__Calculate${separators}Beam__`,
    });

    expect(calculation.sheet.id).toBe('beam-document-sheet');
    expect(code).toContain('def calculate_beam() -> dict[str, object]:');
  });

  test('exports Python from the central calculation object', () => {
    const calculation = createCalculationFromValueTreeJson(beamDocument, {
      id: 'beam',
      label: 'Beam',
    });
    const code = createPythonFromCalculation(calculation, {
      functionName: 'calculate_beam',
    });

    expect(calculation.sheet.symbols.map((symbol) => symbol.id)).toEqual([
      'width',
      'depth',
      'area',
    ]);
    expect(code).toContain('def calculate_beam() -> dict[str, object]:');
    expect(code).toContain('a = b * h');
  });

  test('exports value-tree JSON as dependency-ordered Python code', () => {
    const code = createPythonFromValueTreeJson(beamDocument, {
      id: 'beam',
      label: 'Beam',
      functionName: 'calculate_beam',
    });

    expect(code).toContain('def calculate_beam() -> dict[str, object]:');
    expect(code).toContain('b = 300');
    expect(code).toContain('h = 500');
    expect(code).toContain('a = b * h');
    expect(code).toContain('"area": a');
    expect(code.indexOf('b = 300')).toBeLessThan(code.indexOf('a = b * h'));
  });

  test('exports supported math functions and future-safe Python identifiers', () => {
    const sheet = createSheetFromValueTreeJson(
      {
        title: 'Math',
        sections: [
          {
            symbols: [
              {
                id: 'input-depth',
                result: 16,
                valueTree: [{ key: 'depth-value', literal: 16 }],
              },
              {
                id: 'sqrt-depth',
                result: 4,
                valueTree: [
                  {
                    key: 'root',
                    function: 'fg.sqrt',
                    arguments: ['depth'],
                  },
                  { key: 'depth', symbol: 'input-depth' },
                ],
              },
              {
                id: 'pass',
                result: true,
                valueTree: [
                  {
                    key: 'root',
                    function: 'fg.ge',
                    arguments: ['actual', 'limit'],
                  },
                  { key: 'actual', symbol: 'sqrt-depth' },
                  { key: 'limit', literal: 4 },
                ],
              },
            ],
          },
        ],
      },
      { id: 'math', label: 'Math' },
    );

    const code = createPythonFromSheetDocument(sheet.sheet);

    expect(code).toContain('import math');
    expect(code).toContain('input_depth = 16');
    expect(code).toContain('sqrt_depth = math.sqrt(input_depth)');
    expect(code).toContain('pass_value = sqrt_depth >= 4');
    expect(code).toContain('"pass": pass_value');
  });

  test('exports absolute value as a builtin and floor through math', () => {
    const { sheet } = createSheetFromValueTreeJson(
      {
        title: 'Scalar functions',
        sections: [
          {
            symbols: [
              {
                id: 'input-value',
                result: -1.2,
                valueTree: [{ key: 'input', literal: -1.2 }],
              },
              {
                id: 'absolute-value',
                result: 1.2,
                valueTree: [
                  {
                    key: 'absolute',
                    function: 'fg.abs',
                    arguments: ['value'],
                  },
                  { key: 'value', symbol: 'input-value' },
                ],
              },
              {
                id: 'floor-value',
                result: -2,
                valueTree: [
                  {
                    key: 'floor',
                    function: 'fg.floor',
                    arguments: ['value'],
                  },
                  { key: 'value', symbol: 'input-value' },
                ],
              },
            ],
          },
        ],
      },
      { id: 'scalar-functions', label: 'Scalar functions' },
    );
    const code = createPythonFromSheetDocument(sheet);

    expect(code).toContain('import math');
    expect(code).toContain('absolute_value = abs(input_value)');
    expect(code).toContain('floor_value = math.floor(input_value)');

    const absoluteRoot = sheet.symbols
      .find((symbol) => symbol.id === 'absolute-value')
      ?.valueTree.nodes.find((node) => node.key === 'absolute');
    if (absoluteRoot?.kind !== 'function') {
      throw new Error('Expected an absolute-value function node');
    }
    for (const argKeys of [[], ['value', 'value']]) {
      absoluteRoot.argKeys = argKeys;
      expect(() => createPythonFromSheetDocument(sheet)).toThrow(
        `Cannot export function 'fg.abs' with ${argKeys.length} args to Python`,
      );
    }
  });

  test('exports source fixture function ids used by canonical assets', () => {
    const code = createPythonFromSheetDocument({
      id: 'source-functions',
      title: 'Source functions',
      rootSectionId: 'root',
      sections: [
        {
          id: 'root',
          title: 'Calculations',
          items: [
            { kind: 'symbol', id: 'or-result' },
            { kind: 'symbol', id: 'and-result' },
            { kind: 'symbol', id: 'stub-result' },
            { kind: 'symbol', id: 'ceil-result' },
            { kind: 'symbol', id: 'round-result' },
            { kind: 'symbol', id: 'deg-result' },
          ],
        },
      ],
      symbols: [
        {
          id: 'or-result',
          glyph: 'or_result',
          description: 'Or result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'boolean', value: true },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.or',
                argKeys: ['left', 'right'],
              },
              {
                kind: 'literal',
                key: 'left',
                value: { kind: 'boolean', value: false },
              },
              {
                kind: 'literal',
                key: 'right',
                value: { kind: 'boolean', value: true },
              },
            ],
          },
        },
        {
          id: 'and-result',
          glyph: 'and_result',
          description: 'And result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'boolean', value: false },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.and',
                argKeys: ['left', 'right'],
              },
              {
                kind: 'literal',
                key: 'left',
                value: { kind: 'boolean', value: true },
              },
              {
                kind: 'literal',
                key: 'right',
                value: { kind: 'boolean', value: false },
              },
            ],
          },
        },
        {
          id: 'stub-result',
          glyph: 'stub_result',
          description: 'Stub result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'number', value: 65 },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.stub',
                argKeys: [],
                result: { kind: 'number', value: 65 },
              },
            ],
          },
        },
        {
          id: 'ceil-result',
          glyph: 'ceil_result',
          description: 'Ceil result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'number', value: 3 },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.ceil',
                argKeys: ['value'],
              },
              {
                kind: 'literal',
                key: 'value',
                value: { kind: 'number', value: 2.2 },
              },
            ],
          },
        },
        {
          id: 'round-result',
          glyph: 'round_result',
          description: 'Round result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'number', value: 2 },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.round',
                argKeys: ['value'],
              },
              {
                kind: 'literal',
                key: 'value',
                value: { kind: 'number', value: 2.2 },
              },
            ],
          },
        },
        {
          id: 'deg-result',
          glyph: 'deg_result',
          description: 'Degrees result',
          valueTree: {
            rootKey: 'root',
            result: { kind: 'number', value: 90 },
            nodes: [
              {
                kind: 'function',
                key: 'root',
                functionId: 'fg.deg',
                argKeys: ['value'],
              },
              {
                kind: 'literal',
                key: 'value',
                value: { kind: 'number', value: 1.5707963267948966 },
              },
            ],
          },
        },
      ],
    });

    expect(code).toContain('or_result = False or True');
    expect(code).toContain('and_result = True and False');
    expect(code).toContain('stub_result = 65');
    expect(code).toContain('ceil_result = math.ceil(2.2)');
    expect(code).toContain('round_result = round(2.2)');
    expect(code).toContain('deg_result = math.degrees(1.5707963267948966)');
  });

  test('preserves nested non-associative operation grouping', () => {
    const code = createPythonFromValueTreeJson(
      {
        title: 'Grouping',
        sections: [
          {
            symbols: [
              {
                id: 'a',
                result: 10,
                valueTree: [{ key: 'a-root', literal: 10 }],
              },
              {
                id: 'b',
                result: 4,
                valueTree: [{ key: 'b-root', literal: 4 }],
              },
              {
                id: 'c',
                result: 7,
                valueTree: [
                  {
                    key: 'c-root',
                    function: 'fg.subtract',
                    arguments: ['a-ref', 'nested-subtract'],
                  },
                  { key: 'a-ref', symbol: 'a' },
                  {
                    key: 'nested-subtract',
                    function: 'fg.subtract',
                    arguments: ['b-ref', 'one'],
                  },
                  { key: 'b-ref', symbol: 'b' },
                  { key: 'one', literal: 1 },
                ],
              },
            ],
          },
        ],
      },
      { id: 'grouping', label: 'Grouping' },
    );

    expect(code).toContain('c = a - (b - 1)');
  });

  test('uses glyph code names derived from plaintext, glyph, then id', () => {
    const sheet = createSheetFromValueTreeJson(
      {
        title: 'Glyph code names',
        sections: [
          {
            symbols: [
              {
                id: 'wsy-width',
                glyph: 'ignored',
                glyphPlaintext: 'beam_width',
                result: 2,
                valueTree: [{ key: 'width-root', literal: 2 }],
              },
              {
                id: 'wsy-radius',
                glyph: 'K_(y_1)',
                result: 3,
                valueTree: [{ key: 'radius-root', literal: 3 }],
              },
              {
                id: 'fallback-id',
                glyph: '∅',
                result: 4,
                valueTree: [{ key: 'fallback-root', literal: 4 }],
              },
            ],
          },
        ],
      },
      { id: 'glyph-code-names', label: 'Glyph code names' },
    );
    const code = createPythonFromSheetDocument(sheet.sheet);

    expect(sheet.sheet.symbols.map((symbol) => symbol.glyphCodeName)).toEqual([
      'beam_width',
      'K_y_1',
      'fallback_id',
    ]);
    expect(code).toContain('beam_width = 2');
    expect(code).toContain('k_y_1 = 3');
    expect(code).toContain('fallback_id = 4');
    expect(code).toContain('"wsy-width": beam_width');
  });

  test('rejects unresolved Python export dependencies', () => {
    const sheet = createSheetFromValueTreeJson(beamDocument, {
      id: 'beam',
      label: 'Beam',
    }).sheet;
    const cyclicSheet = {
      ...sheet,
      symbols: [
        {
          ...sheet.symbols[0],
          valueTree: {
            rootKey: 'root',
            result: { kind: 'empty' as const },
            nodes: [{ kind: 'symbol' as const, key: 'root', symbolId: 'area' }],
          },
        },
        sheet.symbols[1],
        sheet.symbols[2],
      ],
    };

    expect(() => createPythonFromSheetDocument(cyclicSheet)).toThrow(
      'Could not resolve Python export order for symbols: width, area',
    );
  });
});
