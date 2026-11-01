/**
 * Leaf MathML components for value-tree rendering.
 *
 * The recursive renderer decides which value-tree node is being displayed.
 * This file keeps the small MathML fragments for literals, symbol glyphs,
 * groups, binary operators, and draft placeholders in one place.
 */

import type { SheetBinaryOperator, SheetLiteral } from '@cs-object/core';
import { assertNever, formatNumerical } from '@cs-object/core';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { AsciiMathView } from '../../ascii-math/AsciiMathView.tsx';
import type { MathMLGlobalAttributes } from '../attributes.ts';

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
  readonly empty?: 'omit' | 'fence';
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
  return position !== undefined && isDraftPositionValid({ draft, position }) ? (
    <mrow>
      {position > 0 && <mtext>{draft.substring(0, position)}</mtext>}
      {position < draft.length && <mtext>{draft.substring(position)}</mtext>}
    </mrow>
  ) : (
    <mrow>
      <mtext>{draft}</mtext>
    </mrow>
  );
};

export const SymbolValueLiteralMathmlView = ({
  literal,
}: SymbolValueLiteralMathmlViewProps): ReactElement => {
  switch (literal?.kind) {
    case undefined:
    case 'empty':
      return <mi>{'▢'}</mi>;
    case 'boolean':
      return <mi>{literal.value ? 'true' : 'false'}</mi>;
    case 'number':
      return <mn>{formatNumerical(literal.value)}</mn>;
    case 'string':
      return <mtext>{literal.value}</mtext>;
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
  empty = 'omit',
}: SymbolValueGroupMathmlViewProps): ReactElement => {
  const mathProps: MathMLGlobalAttributes = {
    mathbackground: cursor ? 'lightgray' : undefined,
  };
  return (
    <mrow {...mathProps}>
      {prefix}
      {(children.length > 0 || empty === 'fence') && (
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
  const spacing =
    operator.id === 'fg.and' || operator.id === 'fg.or' ? '0.3em' : undefined;
  return (
    <mrow>
      {argLeft}
      <mo lspace={spacing} rspace={spacing}>
        {operator.glyph}
      </mo>
      {argRight}
    </mrow>
  );
};
