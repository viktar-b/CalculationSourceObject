import type { ReactNode } from 'react';

export type CodeLanguage = 'html' | 'json' | 'python' | 'tsx';

type CodeTokenKind =
  | 'attribute'
  | 'comment'
  | 'decorator'
  | 'function'
  | 'keyword'
  | 'literal'
  | 'number'
  | 'operator'
  | 'property'
  | 'punctuation'
  | 'string'
  | 'tag';

type CodeToken = {
  readonly kind?: CodeTokenKind;
  readonly text: string;
};

type CodeTokenRule = {
  readonly kind?:
    | CodeTokenKind
    | ((
        text: string,
        source: string,
        endIndex: number,
      ) => CodeTokenKind | undefined);
  readonly pattern: RegExp;
};

const tokenClassNames: Record<CodeTokenKind, string> = {
  attribute: 'text-[#b45309]',
  comment: 'text-gray-400 italic',
  decorator: 'font-semibold text-[#be123c]',
  function: 'text-[#0369a1]',
  keyword: 'font-semibold text-[#7c3aed]',
  literal: 'text-[#b45309]',
  number: 'text-[#b45309]',
  operator: 'text-gray-500',
  property: 'text-[#1d4ed8]',
  punctuation: 'text-gray-500',
  string: 'text-[#047857]',
  tag: 'text-[#9333ea]',
};

const pythonKeywords = new Set([
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const tsxKeywords = new Set([
  'as',
  'const',
  'export',
  'from',
  'function',
  'import',
  'interface',
  'let',
  'readonly',
  'return',
  'satisfies',
  'type',
  'var',
]);

const pythonLiterals = new Set(['False', 'None', 'True']);
const tsxLiterals = new Set(['false', 'null', 'true', 'undefined']);

const attributePattern = /^[A-Za-z_$][\w$-]*(?==)/;
const decoratorPattern = /^@[A-Za-z_][\w.]*/;
const identifierPattern = /^[A-Za-z_$][\w$]*/;
const jsonLiteralPattern = /^(?:false|null|true)\b/;
const markupTagPattern = /^<\/?[A-Za-z][\w.:-]*/;
const numberPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const operatorPattern = /^[+\-*/%=<>!&|]+/;
const punctuationPattern = /^[()[\]{}.,:;]/;
const quotedStringPattern =
  /^"""[\s\S]*?"""|^'''[\s\S]*?'''|^"[^"\\]*(?:\\.[^"\\]*)*"|^'[^'\\]*(?:\\.[^'\\]*)*'/;
const pythonStringPattern =
  /^[rRuUbBfF]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/;
const singleLineCommentPattern = /^#[^\n]*/;
const tagClosePattern = /^\/?>/;
const tsxCommentPattern = /^\/\/[^\n]*/;
const whitespacePattern = /^\s+/;

const nextNonWhitespace = (source: string, index: number) => {
  const match = source.slice(index).match(whitespacePattern);
  return source[index + (match?.[0].length ?? 0)];
};

const resolvePythonIdentifier = (
  text: string,
  source: string,
  endIndex: number,
) => {
  if (pythonKeywords.has(text)) {
    return 'keyword';
  }

  if (pythonLiterals.has(text)) {
    return 'literal';
  }

  return nextNonWhitespace(source, endIndex) === '(' ? 'function' : undefined;
};

const resolveTsxIdentifier = (
  text: string,
  source: string,
  endIndex: number,
) => {
  if (tsxKeywords.has(text)) {
    return 'keyword';
  }

  if (tsxLiterals.has(text)) {
    return 'literal';
  }

  if (nextNonWhitespace(source, endIndex) === '(') {
    return 'function';
  }

  return nextNonWhitespace(source, endIndex) === ':' ? 'property' : undefined;
};

const resolveJsonString = (_text: string, source: string, endIndex: number) =>
  nextNonWhitespace(source, endIndex) === ':' ? 'property' : 'string';

const commonCodeRules = [
  { pattern: whitespacePattern },
  { kind: 'string', pattern: quotedStringPattern },
  { kind: 'number', pattern: numberPattern },
  { kind: 'punctuation', pattern: punctuationPattern },
  { kind: 'operator', pattern: operatorPattern },
] satisfies readonly CodeTokenRule[];

const markupRules = [
  { pattern: whitespacePattern },
  { kind: 'tag', pattern: markupTagPattern },
  { kind: 'attribute', pattern: attributePattern },
  { kind: 'string', pattern: quotedStringPattern },
  { kind: 'punctuation', pattern: tagClosePattern },
  { kind: 'operator', pattern: operatorPattern },
  { kind: 'punctuation', pattern: punctuationPattern },
] satisfies readonly CodeTokenRule[];

const languageRules = {
  html: markupRules,
  json: [
    { pattern: whitespacePattern },
    { kind: resolveJsonString, pattern: quotedStringPattern },
    { kind: 'literal', pattern: jsonLiteralPattern },
    { kind: 'number', pattern: numberPattern },
    { kind: 'punctuation', pattern: punctuationPattern },
  ],
  python: [
    { pattern: whitespacePattern },
    { kind: 'comment', pattern: singleLineCommentPattern },
    { kind: 'decorator', pattern: decoratorPattern },
    { kind: 'string', pattern: pythonStringPattern },
    { kind: 'number', pattern: numberPattern },
    { kind: resolvePythonIdentifier, pattern: identifierPattern },
    { kind: 'punctuation', pattern: punctuationPattern },
    { kind: 'operator', pattern: operatorPattern },
  ],
  tsx: [
    { kind: 'comment', pattern: tsxCommentPattern },
    ...markupRules,
    { kind: resolveTsxIdentifier, pattern: identifierPattern },
    ...commonCodeRules,
  ],
} satisfies Record<CodeLanguage, readonly CodeTokenRule[]>;

const resolveTokenKind = (
  rule: CodeTokenRule,
  text: string,
  source: string,
  endIndex: number,
) => {
  if (typeof rule.kind === 'function') {
    return rule.kind(text, source, endIndex);
  }

  return rule.kind;
};

const readCodeToken = (
  source: string,
  index: number,
  rules: readonly CodeTokenRule[],
): CodeToken => {
  const rest = source.slice(index);

  for (const rule of rules) {
    const match = rest.match(rule.pattern);

    if (match) {
      const text = match[0];
      return {
        kind: resolveTokenKind(rule, text, source, index + text.length),
        text,
      };
    }
  }

  return { text: source[index] };
};

const tokenizeCode = (source: string, language: CodeLanguage) => {
  const tokens: CodeToken[] = [];
  const rules = languageRules[language];
  let index = 0;

  while (index < source.length) {
    const token = readCodeToken(source, index, rules);
    tokens.push(token);
    index += token.text.length;
  }

  return tokens;
};

const highlightCode = (source: string, language: CodeLanguage): ReactNode[] =>
  tokenizeCode(source, language).map((token, index) => {
    if (!token.kind) {
      return token.text;
    }

    return (
      <span
        className={tokenClassNames[token.kind]}
        key={`${index}-${token.kind}-${token.text}`}
      >
        {token.text}
      </span>
    );
  });

export function CodeBlock({
  children,
  language,
}: {
  readonly children: string;
  readonly language: CodeLanguage;
}) {
  return (
    <pre className="max-w-full overflow-x-auto px-4 py-4 font-mono text-[12px] leading-5 text-gray-700">
      <code>{highlightCode(children, language)}</code>
    </pre>
  );
}

export function CodePanel({
  children,
  language,
  title,
}: {
  readonly children: string;
  readonly language: CodeLanguage;
  readonly title: string;
}) {
  return (
    <div className="min-w-0 border border-gray-300 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-300 px-4 py-3">
        <h3 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold text-gray-950">
          {title}
        </h3>
        <span className="font-mono text-[11px] uppercase text-gray-500">
          {language}
        </span>
      </div>
      <CodeBlock language={language}>{children}</CodeBlock>
    </div>
  );
}
