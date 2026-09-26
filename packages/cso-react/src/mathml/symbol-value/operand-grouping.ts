import {
  getSymbolById,
  type SheetDocument,
  type SheetLiteral,
  type SheetValueNode,
} from '@cs-object/core';
import { displayedLiteralDraft } from './literal-display.ts';

interface ExplicitOperandGroupInput {
  readonly sheet: SheetDocument;
  readonly node: SheetValueNode;
  readonly numerical: boolean;
  readonly literalsAsDrafts: boolean;
  readonly parentFunctionId: Extract<SheetValueNode, { kind: 'function' }>['functionId'];
  readonly argumentIndex: number;
}

export const requiresExplicitOperandGroup = ({
  sheet,
  node,
  numerical,
  literalsAsDrafts,
  parentFunctionId,
  argumentIndex,
}: ExplicitOperandGroupInput): boolean => {
  let literal: SheetLiteral | undefined;
  let draft: string | undefined;
  switch (node.kind) {
    case 'literal':
      draft = displayedLiteralDraft({ node, literalsAsDrafts });
      literal = node.value;
      break;
    case 'symbol':
      literal = numerical
        ? getSymbolById(sheet, node.symbolId)?.valueTree.result
        : undefined;
      break;
    case 'function':
      break;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
  const negative =
    draft !== undefined
      ? /^\s*[-−]/u.test(draft)
      : literal?.kind === 'number' &&
        (literal.value < 0 || Object.is(literal.value, -0));

  return (
    (argumentIndex === 0 &&
      ((parentFunctionId === 'fg.pow' &&
        (node.kind === 'function' || negative)) ||
        (parentFunctionId === 'fg.uminus' && node.kind === 'function'))) ||
    (argumentIndex === 1 &&
      (parentFunctionId === 'fg.add' ||
        parentFunctionId === 'fg.multiply' ||
        parentFunctionId === 'fg.subtract') &&
      (negative || (node.kind === 'function' && node.functionId === 'fg.uminus')))
  );
};
