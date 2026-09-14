import { assertNever } from '@viktar-b/cso-core';
import type { NotationExpression, NotationNode } from '@viktar-b/cso-core';

const nodeSemantic = (node: NotationNode): string => {
  switch (node.kind) {
    case 'identifier':
      return `identifier(${JSON.stringify(node.value)})`;
    case 'number':
      return `number(${JSON.stringify(node.value)})`;
    case 'operator':
      return `operator(${JSON.stringify(node.value)})`;
    case 'text':
      return `text(${JSON.stringify(node.value)})`;
    case 'group':
      return `group(${node.fence},${notationSemantic(node.body)})`;
    case 'fraction':
      return `fraction(${nodeSemantic(node.numerator)},${nodeSemantic(node.denominator)})`;
    case 'subscript':
      return `subscript(${nodeSemantic(node.base)},${nodeSemantic(node.subscript)})`;
    case 'superscript':
      return `superscript(${nodeSemantic(node.base)},${nodeSemantic(node.superscript)})`;
    case 'subsup':
      return `subsup(${nodeSemantic(node.base)},${nodeSemantic(node.subscript)},${nodeSemantic(node.superscript)})`;
    default:
      return assertNever(node);
  }
};

export const notationSemantic = (expression: NotationExpression): string =>
  `sequence(${expression.map(nodeSemantic).join(',')})`;
