import { describe, expect, test } from 'vitest';
import { parseAsciiMath } from '../src/ascii-math/parser/parseAsciiMath.ts';

describe('vendored AsciiMath parser', () => {
  test('parses numbers, divisions, and grouped subscripts', () => {
    expect(parseAsciiMath('123')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'NumberInteger',
          value: '123',
        },
      },
    });

    expect(parseAsciiMath('1 / 3 5')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'ExpressionDivision',
        numerator: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'NumberInteger',
            value: '1',
          },
        },
        denominator: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'NumberInteger',
            value: '3',
          },
        },
      },
      right: {
        type: 'ExpressionSequence',
        left: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'NumberInteger',
            value: '5',
          },
        },
      },
    });

    expect(parseAsciiMath('omega_{abc}delta')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'StrLine',
          value: 'omega',
        },
        subscript: {
          type: 'CmdGroup',
          lBracket: '{',
          expression: {
            type: 'ExpressionSequence',
            left: {
              type: 'SubscriptSuperscript',
              base: {
                type: 'StrVarname',
                value: 'abc',
              },
            },
          },
          rBracket: '}',
        },
      },
      right: {
        type: 'ExpressionSequence',
        left: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'StrLine',
            value: 'delta',
          },
        },
      },
    });

    expect(parseAsciiMath('(M1+M2)/m_3')).toMatchObject({
      left: {
        type: 'ExpressionDivision',
        numerator: {
          base: {
            type: 'CmdGroup',
            lBracket: '(',
            rBracket: ')',
          },
        },
        denominator: {
          base: {
            type: 'StrVarname',
            value: 'm',
          },
          subscript: {
            type: 'NumberInteger',
            value: '3',
          },
        },
      },
    });

    expect(parseAsciiMath('{M1+M2}/m_3')).toMatchObject({
      left: {
        type: 'ExpressionDivision',
        numerator: {
          base: {
            type: 'CmdGroup',
            lBracket: '{',
            rBracket: '}',
          },
        },
        denominator: {
          base: {
            type: 'StrVarname',
            value: 'm',
          },
          subscript: {
            type: 'NumberInteger',
            value: '3',
          },
        },
      },
    });
  });

  test('supports backslash Greek letters but keeps unsupported commands as text', () => {
    expect(parseAsciiMath('sqrt x')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'StrVarname',
          value: 'sqrt',
        },
      },
      right: {
        type: 'ExpressionSequence',
        left: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'StrVarname',
            value: 'x',
          },
        },
      },
    });

    expect(parseAsciiMath('\\sqrt x')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'StrChar',
          value: '\\',
        },
      },
      right: {
        type: 'ExpressionSequence',
        left: {
          type: 'SubscriptSuperscript',
          base: {
            type: 'StrVarname',
            value: 'sqrt',
          },
        },
        right: {
          type: 'ExpressionSequence',
          left: {
            type: 'SubscriptSuperscript',
            base: {
              type: 'StrVarname',
              value: 'x',
            },
          },
        },
      },
    });

    expect(parseAsciiMath('\\delta')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'StrLine',
          value: 'delta',
        },
      },
    });

    expect(parseAsciiMath('\\Delta')).toEqual({
      type: 'ExpressionSequence',
      left: {
        type: 'SubscriptSuperscript',
        base: {
          type: 'StrLine',
          value: 'Delta',
        },
      },
    });
  });
});
