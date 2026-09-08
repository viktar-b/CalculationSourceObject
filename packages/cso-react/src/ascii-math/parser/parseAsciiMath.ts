import type {
  AsciiMathExpression,
  AsciiMathExpressionDivision,
  AsciiMathExpressionSimple,
  AsciiMathSubscriptSuperscript,
} from './types.ts';

const whitespacePattern = /\s/;
const numberPattern = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/;
const wordPattern = /^[A-Za-z]+/;

const greekLetterNames = new Set([
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Phi',
  'Psi',
  'Omega',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
]);

const knownWordNames = new Set([
  'sum',
  'prod',
  'int',
  'oint',
  'grad',
  'aleph',
  'vdots',
  'ddots',
  'frown',
  'diamond',
  'square',
  'CC',
  'NN',
  'QQ',
  'RR',
  'ZZ',
  'sub',
  'subset',
  'sube',
  'subseteq',
  'sup',
  'supset',
  'supe',
  'supseteq',
  'prop',
  'propto',
  'in',
  'and',
  'or',
  'not',
  'if',
  'AA',
  'EE',
  'TT',
  'uarr',
  'uparrow',
  'darr',
  'downarrow',
  'rarr',
  'rightarrow',
  'to',
  'rightarrowtail',
  'twoheadrightarrow',
  'twoheadrightarrowtail',
  'mapsto',
  'larr',
  'leftarrow',
  'harr',
  'leftrightarrow',
  'rArr',
  'Rightarrow',
  'lArr',
  'Leftarrow',
  'hArr',
  'Leftrightarrow',
  'mlt',
  'mgt',
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'sech',
  'csch',
  'coth',
  'exp',
  'log',
  'ln',
  'det',
  'dim',
  'mod',
  'gcd',
  'lcm',
  'lub',
  'glb',
  'min',
  'max',
]);

const knownAliasNames = new Set([
  'cdot',
  'ast',
  'star',
  'backslash',
  'setminus',
  'times',
  'div',
  'ltimes',
  'rtimes',
  'bowtie',
  'circ',
  'oplus',
  'otimes',
  'odot',
  'wedge',
  'bigwedge',
  'vee',
  'bigvee',
  'cap',
  'bigcap',
  'cup',
  'bigcup',
  'del',
  'partial',
  'nabla',
  'pm',
  'emptyset',
  'infty',
  'therefore',
  'because',
  'angle',
  'triangle',
  'lfloor',
  'rfloor',
  'lceiling',
  'rceiling',
  'ne',
  'lt',
  'gt',
  'le',
  'ge',
  'll',
  'gg',
  'prec',
  'preceq',
  'succ',
  'succeq',
  'notin',
  'equiv',
  'cong',
  'approx',
  'neg',
  'implies',
  'iff',
  'forall',
  'exists',
  'bot',
  'top',
  'vdash',
  'models',
]);

const knownSymbolTokens = [
  '|><|',
  '>->>',
  '->>',
  '>->',
  '|->',
  '<=>',
  '|--',
  '|==',
  '_|_',
  '|><',
  '><|',
  '|cdots|',
  '|...|',
  '|__',
  '__|',
  '|~',
  '~|',
  '/_\\',
  '***',
  '^^^',
  'vvv',
  'nnn',
  'uuu',
  '//',
  'xx',
  'o+',
  'ox',
  'o.',
  '-:',
  '+-',
  'O/',
  'oo',
  ':.',
  ":'",
  '/_',
  '!=',
  '<=',
  '>=',
  '-<=',
  '>-=',
  '>-',
  '-<',
  '!in',
  '-=',
  '~=',
  '~~',
  '=>',
  '->',
  '**',
  '^^',
  'vv',
  'nn',
  'uu',
  '*',
  '=',
  '<',
  '>',
  '@',
  ':',
  ',',
  '+',
  '-',
] as const;

class SheetAsciiMathParser {
  private readonly input: string;
  private index = 0;
  private literalWordIndex: number | undefined;

  constructor(input: string) {
    this.input = input;
  }

  parse(): AsciiMathExpression {
    this.skipWhitespace();
    const expression = this.parseExpression();
    this.skipWhitespace();

    if (this.index < this.input.length) {
      throw new Error(`Unexpected token at index ${this.index}`);
    }

    return expression;
  }

  private parseExpression(stopChar?: string): AsciiMathExpression {
    const firstItem = this.parseItem(stopChar);
    let left: AsciiMathSubscriptSuperscript | AsciiMathExpressionDivision =
      firstItem;

    this.skipWhitespace();
    if (this.peek() === '/') {
      this.index += 1;
      const denominator = this.parseItem(stopChar);
      left = {
        type: 'ExpressionDivision',
        numerator: firstItem,
        denominator,
      };
    }

    this.skipWhitespace();
    const right =
      this.index < this.input.length && this.peek() !== stopChar
        ? this.parseExpression(stopChar)
        : undefined;

    return {
      type: 'ExpressionSequence',
      left,
      right,
    };
  }

  private parseItem(stopChar?: string): AsciiMathSubscriptSuperscript {
    const base = this.parseSimple(stopChar);
    let subscript: AsciiMathExpressionSimple | undefined;
    let superscript: AsciiMathExpressionSimple | undefined;

    this.skipWhitespace();
    if (this.peek() === '_' && this.canParseScriptArgument(stopChar)) {
      this.index += 1;
      subscript = this.parseSimple(stopChar);
    }

    this.skipWhitespace();
    if (this.peek() === '^' && this.canParseScriptArgument(stopChar)) {
      this.index += 1;
      superscript = this.parseSimple(stopChar);
    }

    return {
      type: 'SubscriptSuperscript',
      base,
      subscript,
      superscript,
    };
  }

  private parseSimple(stopChar?: string): AsciiMathExpressionSimple {
    this.skipWhitespace();
    const char = this.input[this.index];

    if (char === undefined || char === stopChar) {
      throw new Error(`Expected glyph token at index ${this.index}`);
    }

    if (char === '{') {
      return this.parseDelimitedGroup('{', '}');
    }

    if (char === '(') {
      return this.parseDelimitedGroup('(', ')');
    }

    if (char === '[') {
      return this.parseDelimitedGroup('[', ']');
    }

    if (char === '"') {
      return this.parseQuotedString();
    }

    if (char === '\\') {
      return this.parseBackslashToken();
    }

    const number = this.matchNumber();
    if (number) {
      return {
        type: number.includes('.') ? 'NumberFloat' : 'NumberInteger',
        value: number,
      };
    }

    const knownSymbol = this.matchKnownSymbol();
    if (knownSymbol) {
      return { type: 'StrLine', value: knownSymbol };
    }

    const word = this.matchWord();
    if (word) {
      return this.parseWordToken(word);
    }

    this.literalWordIndex = undefined;
    this.index += 1;
    return { type: 'StrChar', value: char };
  }

  private parseBackslashToken(): AsciiMathExpressionSimple {
    const word = this.matchWordAt(this.index + 1);
    if (word && greekLetterNames.has(word)) {
      this.index += word.length + 1;
      this.literalWordIndex = undefined;
      return { type: 'StrLine', value: word };
    }

    this.index += 1;
    this.literalWordIndex = this.index;
    return { type: 'StrChar', value: '\\' };
  }

  private parseWordToken(word: string): AsciiMathExpressionSimple {
    const isBackslashCommandText =
      this.literalWordIndex === this.index - word.length;
    this.literalWordIndex = undefined;

    return {
      type:
        !isBackslashCommandText && this.isKnownPlainWord(word)
          ? 'StrLine'
          : 'StrVarname',
      value: word,
    };
  }

  private parseDelimitedGroup(
    lBracket: string,
    rBracket: string,
  ): AsciiMathExpressionSimple {
    this.index += 1;
    const expression = this.parseExpression(rBracket);

    if (this.peek() !== rBracket) {
      throw new Error(`Expected closing '${rBracket}' at index ${this.index}`);
    }

    this.index += 1;
    return {
      type: 'CmdGroup',
      lBracket,
      expression,
      rBracket,
    };
  }

  private parseQuotedString(): AsciiMathExpressionSimple {
    const start = this.index;
    this.index += 1;

    while (this.index < this.input.length) {
      const char = this.input[this.index];
      if (char === '\\') {
        this.index += 2;
        continue;
      }
      if (char === '"') {
        this.index += 1;
        return {
          type: 'StrQuoted',
          value: this.input.slice(start, this.index),
        };
      }
      this.index += 1;
    }

    throw new Error(`Expected closing quote at index ${start}`);
  }

  private canParseScriptArgument(stopChar?: string): boolean {
    let argumentIndex = this.index + 1;
    while (whitespacePattern.test(this.input[argumentIndex] ?? '')) {
      argumentIndex += 1;
    }

    const next = this.input[argumentIndex];
    return (
      next !== undefined &&
      next !== stopChar &&
      next !== '(' &&
      next !== '[' &&
      next !== ')' &&
      next !== ']'
    );
  }

  private matchNumber(): string | undefined {
    const match = numberPattern.exec(this.input.slice(this.index));

    if (!match) {
      return undefined;
    }

    this.index += match[0].length;
    return match[0];
  }

  private matchKnownSymbol(): string | undefined {
    const match = knownSymbolTokens.find((token) =>
      this.input.startsWith(token, this.index),
    );

    if (!match) {
      return undefined;
    }

    this.index += match.length;
    return match;
  }

  private matchWord(): string | undefined {
    const match = this.matchWordAt(this.index);

    if (!match) {
      return undefined;
    }

    this.index += match.length;
    return match;
  }

  private matchWordAt(index: number): string | undefined {
    return wordPattern.exec(this.input.slice(index))?.[0];
  }

  private isKnownPlainWord(word: string): boolean {
    return (
      greekLetterNames.has(word) ||
      knownWordNames.has(word) ||
      knownAliasNames.has(word)
    );
  }

  private skipWhitespace(): void {
    while (whitespacePattern.test(this.peek() ?? '')) {
      this.index += 1;
    }
  }

  private peek(): string | undefined {
    return this.input[this.index];
  }
}

export const parseAsciiMath = (asciiMathStr: string): AsciiMathExpression => {
  return new SheetAsciiMathParser(asciiMathStr).parse();
};
