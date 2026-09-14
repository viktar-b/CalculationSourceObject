import {
  backslashNotationAliases,
  canonicalNotationScalars,
  notationAliases,
  punctuationNotationAliases,
} from './aliases.ts';
import { isExplicitNotationIdentifierScalar } from './presentation.ts';
import type {
  NotationDiagnostic,
  NotationExpression,
  NotationNode,
  NotationParseDiagnosticCode,
  NotationParseResult,
} from './types.ts';

const SOURCE_LIMIT = 32_768;
const NODE_LIMIT = 16_384;
const DEPTH_LIMIT = 64;
const asciiLetterPattern = /^[A-Za-z]$/;
const digitPattern = /^[0-9]$/;
const whitespacePattern = /^\s$/u;

class NotationParseFailure extends Error {
  readonly diagnostic: NotationDiagnostic;

  constructor(diagnostic: NotationDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

class NotationParser {
  private readonly characters: readonly string[];
  private index = 0;
  private nodeCount = 0;

  constructor(source: string) {
    if (source.length > SOURCE_LIMIT * 2) {
      this.fail(
        'NOTATION_SOURCE_LIMIT',
        SOURCE_LIMIT,
        `Notation exceeds ${SOURCE_LIMIT} Unicode scalar values`,
      );
    }
    this.characters = [...source];
    for (const [offset, value] of this.characters.entries()) {
      const codePoint = value.codePointAt(0);
      if (
        codePoint !== undefined &&
        codePoint >= 0xd800 &&
        codePoint <= 0xdfff
      ) {
        this.fail(
          'INVALID_UNICODE',
          offset,
          'Notation contains an isolated UTF-16 surrogate',
        );
      }
      if (codePoint === 0) {
        this.fail(
          'INVALID_CONTROL_CHARACTER',
          offset,
          'Notation contains a NUL control character',
        );
      }
    }
    if (this.characters.length > SOURCE_LIMIT) {
      this.fail(
        'NOTATION_SOURCE_LIMIT',
        SOURCE_LIMIT,
        `Notation exceeds ${SOURCE_LIMIT} Unicode scalar values`,
      );
    }
  }

  parse(): NotationExpression {
    this.skipWhitespace();
    if (this.peek() === undefined)
      this.fail('EMPTY_EXPRESSION', this.index, 'Notation is empty');

    const expression = this.parseExpression(undefined, 0);
    this.skipWhitespace();
    return expression;
  }

  private parseExpression(
    stopCharacter: string | undefined,
    depth: number,
  ): NotationExpression {
    const nodes: NotationNode[] = [];
    while (true) {
      this.skipWhitespace();
      if (this.peek() === undefined || this.peek() === stopCharacter) break;
      if (this.peek() === '}' || this.peek() === ')' || this.peek() === ']') {
        this.fail(
          'UNEXPECTED_CLOSING_GROUP',
          this.index,
          `Unexpected closing group '${this.peek()}'`,
        );
      }

      const numerator = this.parseScripted(stopCharacter, depth);
      this.skipWhitespace();
      if (
        this.peek() === '/' &&
        this.matchPunctuationAliasAt(this.index) === undefined
      ) {
        this.index += 1;
        this.skipWhitespace();
        if (this.peek() === undefined || this.peek() === stopCharacter) {
          this.fail(
            'MISSING_FRACTION_DENOMINATOR',
            this.index,
            'Fraction is missing a denominator',
          );
        }
        nodes.push(
          this.node({
            kind: 'fraction',
            numerator,
            denominator: this.parseScripted(stopCharacter, depth),
          }),
        );
      } else {
        nodes.push(numerator);
      }
    }

    if (nodes.length === 0) {
      this.fail(
        stopCharacter === undefined ? 'EMPTY_EXPRESSION' : 'EMPTY_GROUP',
        this.index,
        stopCharacter === undefined
          ? 'Notation is empty'
          : 'Notation group is empty',
      );
    }
    return nodes;
  }

  private parseScripted(
    stopCharacter: string | undefined,
    depth: number,
  ): NotationNode {
    const base = this.parseAtom(depth);
    let subscript: NotationNode | undefined;
    let superscript: NotationNode | undefined;

    this.skipWhitespace();
    if (
      this.peek() === '_' &&
      this.matchPunctuationAliasAt(this.index) === undefined &&
      this.canParseScriptArgument(stopCharacter)
    ) {
      this.index += 1;
      subscript = this.parseAtomAfterWhitespace(depth);
    }

    this.skipWhitespace();
    if (
      this.peek() === '^' &&
      this.matchPunctuationAliasAt(this.index) === undefined &&
      this.canParseScriptArgument(stopCharacter)
    ) {
      this.index += 1;
      superscript = this.parseAtomAfterWhitespace(depth);
    }

    if (subscript && superscript)
      return this.node({ kind: 'subsup', base, subscript, superscript });
    if (subscript) return this.node({ kind: 'subscript', base, subscript });
    if (superscript)
      return this.node({ kind: 'superscript', base, superscript });
    return base;
  }

  private parseAtomAfterWhitespace(depth: number): NotationNode {
    this.skipWhitespace();
    return this.parseAtom(depth);
  }

  private parseAtom(depth: number): NotationNode {
    const character = this.peek();
    if (character === undefined)
      this.fail('EMPTY_EXPRESSION', this.index, 'Expected a notation token');
    if (character === '}' || character === ')' || character === ']') {
      this.fail(
        'UNEXPECTED_CLOSING_GROUP',
        this.index,
        `Unexpected closing group '${character}'`,
      );
    }

    if (character === '{') return this.parseGroup('}', 'none', depth);
    if (character === '(') return this.parseGroup(')', 'round', depth);
    if (character === '[') return this.parseGroup(']', 'square', depth);
    if (character === '"') return this.parseQuotedText();

    const number = this.parseNumber();
    if (number !== undefined)
      return this.node({ kind: 'number', value: number });

    const punctuation = this.matchPunctuationAliasAt(this.index);
    if (punctuation !== undefined) {
      this.index += [...punctuation].length;
      const resolved = notationAliases.get(punctuation);
      if (resolved !== undefined) return this.node({ ...resolved });
    }

    if (character === '\\') return this.parseBackslashWord();

    const word = this.parseWord();
    if (word !== undefined) {
      const resolved = notationAliases.get(word);
      return this.node(
        resolved === undefined
          ? { kind: 'identifier', value: word }
          : { ...resolved },
      );
    }

    this.index += 1;
    const canonical = canonicalNotationScalars.get(character);
    if (canonical !== undefined) return this.node({ ...canonical });
    return this.node({
      kind: isExplicitNotationIdentifierScalar(character)
        ? 'identifier'
        : 'text',
      value: character,
    });
  }

  private parseGroup(
    closing: string,
    fence: 'none' | 'round' | 'square',
    depth: number,
  ): NotationNode {
    if (depth >= DEPTH_LIMIT) {
      this.fail(
        'NOTATION_DEPTH_LIMIT',
        this.index,
        `Notation exceeds ${DEPTH_LIMIT} nested groups`,
      );
    }
    const openingOffset = this.index;
    this.index += 1;
    const body = this.parseExpression(closing, depth + 1);
    if (this.peek() !== closing) {
      this.fail(
        'UNCLOSED_GROUP',
        openingOffset,
        `Notation group is missing '${closing}'`,
      );
    }
    this.index += 1;
    return this.node({ kind: 'group', fence, body });
  }

  private parseQuotedText(): NotationNode {
    const openingOffset = this.index;
    const value: string[] = [];
    this.index += 1;
    while (this.peek() !== undefined) {
      const character = this.peek();
      if (character === '"') {
        this.index += 1;
        return this.node({ kind: 'text', value: value.join('') });
      }
      if (character === '\\' && this.peek(1) !== undefined) {
        value.push(this.peek(1) ?? '');
        this.index += 2;
      } else {
        value.push(character ?? '');
        this.index += 1;
      }
    }
    this.fail(
      'UNCLOSED_QUOTE',
      openingOffset,
      'Notation text is missing a closing quote',
    );
  }

  private parseBackslashWord(): NotationNode {
    const start = this.index;
    this.index += 1;
    const word = this.parseWord();
    if (word !== undefined && backslashNotationAliases.has(word)) {
      const resolved = notationAliases.get(word);
      if (resolved !== undefined) return this.node({ ...resolved });
    }
    return this.node({
      kind: 'identifier',
      value: this.characters.slice(start, this.index).join(''),
    });
  }

  private parseNumber(): string | undefined {
    const start = this.index;
    let cursor = start;
    if (this.characters[cursor] === '-') cursor += 1;

    const integerStart = cursor;
    while (digitPattern.test(this.characters[cursor] ?? '')) cursor += 1;
    const hasInteger = cursor > integerStart;
    if (this.characters[cursor] === '.') {
      cursor += 1;
      const fractionStart = cursor;
      while (digitPattern.test(this.characters[cursor] ?? '')) cursor += 1;
      if (!hasInteger && cursor === fractionStart) return undefined;
    } else if (!hasInteger) {
      return undefined;
    }

    this.index = cursor;
    return this.characters.slice(start, cursor).join('');
  }

  private parseWord(): string | undefined {
    const start = this.index;
    while (asciiLetterPattern.test(this.peek() ?? '')) this.index += 1;
    return this.index === start
      ? undefined
      : this.characters.slice(start, this.index).join('');
  }

  private canParseScriptArgument(stopCharacter: string | undefined): boolean {
    let cursor = this.index + 1;
    while (whitespacePattern.test(this.characters[cursor] ?? '')) cursor += 1;
    const next = this.characters[cursor];
    return (
      next !== undefined &&
      next !== stopCharacter &&
      next !== '(' &&
      next !== '[' &&
      next !== ')' &&
      next !== ']'
    );
  }

  private matchPunctuationAliasAt(index: number): string | undefined {
    return punctuationNotationAliases.find((spelling) => {
      const length = [...spelling].length;
      const matches =
        this.characters.slice(index, index + length).join('') === spelling;
      const endsWithLetter = asciiLetterPattern.test(
        this.characters[index + length - 1] ?? '',
      );
      const followedByLetter = asciiLetterPattern.test(
        this.characters[index + length] ?? '',
      );
      return matches && !(endsWithLetter && followedByLetter);
    });
  }

  private node<T extends NotationNode>(node: T): T {
    this.nodeCount += 1;
    if (this.nodeCount > NODE_LIMIT) {
      this.fail(
        'NOTATION_NODE_LIMIT',
        this.index,
        `Notation exceeds ${NODE_LIMIT} parsed nodes`,
      );
    }
    return node;
  }

  private skipWhitespace(): void {
    while (whitespacePattern.test(this.peek() ?? '')) this.index += 1;
  }

  private peek(ahead = 0): string | undefined {
    return this.characters[this.index + ahead];
  }

  private fail(
    code: NotationParseDiagnosticCode,
    offset: number,
    message: string,
  ): never {
    throw new NotationParseFailure({ code, offset, message });
  }
}

export const parseNotation = (source: string): NotationParseResult => {
  try {
    return { ok: true, value: new NotationParser(source).parse() };
  } catch (error) {
    if (error instanceof NotationParseFailure)
      return { ok: false, diagnostic: error.diagnostic };
    throw error;
  }
};
