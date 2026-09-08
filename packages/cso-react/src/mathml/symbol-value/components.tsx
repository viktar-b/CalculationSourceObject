/**
 * Leaf MathML components for value-tree rendering.
 *
 * The recursive renderer decides which value-tree node is being displayed.
 * This file keeps the small MathML fragments for literals, symbol glyphs,
 * groups, binary operators, and draft placeholders in one place.
 */
import { AsciiMathView } from '../../ascii-math/AsciiMathView.tsx';
import type { MathMLGlobalAttributes } from '../attributes.ts';
import { MATHML_FONT_SIZE } from '../constants.ts';
import type { SheetBinaryOperator } from '@viktar-b/cso-core';
import type { SheetLiteral } from '@viktar-b/cso-core';
import { assertNever } from '@viktar-b/cso-core';
import { formatNumerical } from '@viktar-b/cso-core';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

interface SymbolValueBinaryOperatorMathmlViewProps {
  readonly operator: SheetBinaryOperator;
  readonly argLeft: ReactNode;
  readonly argRight: ReactNode;
}

interface SymbolValueDraftMathmlViewProps {
  readonly draft: string;
  readonly position?: number;
}

interface SymbolValueGlyphMathmlViewProps {
  readonly glyph: string;
}

interface SymbolValueGroupMathmlViewProps {
  readonly prefix?: ReactNode;
  readonly children: readonly ReactNode[];
  readonly cursor?: unknown;
}

interface SymbolValueLiteralMathmlViewProps {
  readonly literal: SheetLiteral;
}

interface SymbolValueRootMathmlViewProps {
  readonly children?: ReactElement;
}

const isDraftPositionValid = ({
  draft,
  position,
}: {
  readonly draft: string;
  readonly position: number;
}): boolean => {
  return !Number.isNaN(position) && position >= 0 && position <= draft.length;
};

const stableReactNodeKey = (node: unknown): string => {
  if (node === null) {
    return 'null';
  }
  if (node === undefined) {
    return 'undefined';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (typeof node === 'boolean') {
    return node ? 'true' : 'false';
  }
  if (isValidElement(node)) {
    if (node.key != null) {
      return String(node.key);
    }
    if (typeof node.type === 'string') {
      return node.type;
    }
    const maybeNamed = node.type as { displayName?: string; name?: string };
    return maybeNamed.displayName ?? maybeNamed.name ?? 'component';
  }
  return 'node';
};

export const SymbolValueRootMathmlView = ({
  children,
}: SymbolValueRootMathmlViewProps): ReactElement => {
  return <math>{children ?? 'Tree Without Root'}</math>;
};

export const SymbolValueDraftMathmlView = ({
  draft,
  position,
}: SymbolValueDraftMathmlViewProps): ReactElement => {
  const textStyle = { fontSize: MATHML_FONT_SIZE };
  return position !== undefined && isDraftPositionValid({ draft, position }) ? (
    <mrow style={{ fontSize: MATHML_FONT_SIZE }}>
      {position > 0 && (
        <mtext style={textStyle}>{draft.substring(0, position)}</mtext>
      )}
      {position < draft.length && (
        <mtext style={textStyle}>{draft.substring(position)}</mtext>
      )}
    </mrow>
  ) : (
    <mrow style={{ fontSize: MATHML_FONT_SIZE }}>
      <mtext style={textStyle}>{draft}</mtext>
    </mrow>
  );
};

export const SymbolValueLiteralMathmlView = ({
  literal,
}: SymbolValueLiteralMathmlViewProps): ReactElement => {
  const mathProps: MathMLGlobalAttributes = {
    style: { fontSize: MATHML_FONT_SIZE },
  };
  switch (literal?.kind) {
    case undefined:
    case 'empty':
      return <mi {...mathProps}>{'▢'}</mi>;
    case 'boolean':
      return <mi {...mathProps}>{literal.value ? 'true' : 'false'}</mi>;
    case 'number':
      return <mn {...mathProps}>{formatNumerical(literal.value)}</mn>;
    case 'string':
      return <mtext {...mathProps}>{literal.value}</mtext>;
    default:
      return assertNever(literal);
  }
};

export const SymbolValueGlyphMathmlView = ({
  glyph,
}: SymbolValueGlyphMathmlViewProps): ReactElement => {
  const mathProps: MathMLGlobalAttributes = {};
  return <AsciiMathView expression={glyph} {...mathProps} />;
};

export const SymbolValueGroupMathmlView = ({
  prefix,
  children,
  cursor,
}: SymbolValueGroupMathmlViewProps): ReactElement => {
  const mathProps: MathMLGlobalAttributes = {
    mathbackground: cursor ? 'lightgray' : undefined,
  };
  return (
    <mrow {...mathProps}>
      {prefix}
      {children.length > 0 && (
        <>
          <mo fence={'true'}>{'('}</mo>
          {children.flatMap((child, argIndex, arr) => {
            const next = arr[argIndex + 1];
            const separatorKey = `sep-${stableReactNodeKey(child)}-to-${stableReactNodeKey(next)}`;
            return [
              child,
              ...(argIndex < arr.length - 1
                ? [
                    <mo key={separatorKey} separator={'true'}>
                      {','}
                    </mo>,
                  ]
                : []),
            ];
          })}
          <mo fence={'true'}>{')'}</mo>
        </>
      )}
    </mrow>
  );
};

export const SymbolValueBinaryOperatorMathmlView = ({
  operator,
  argLeft,
  argRight,
}: SymbolValueBinaryOperatorMathmlViewProps): ReactElement => {
  return (
    <mrow>
      {argLeft}
      <mo>{operator.glyph}</mo>
      {argRight}
    </mrow>
  );
};
