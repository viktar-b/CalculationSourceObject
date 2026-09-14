import { presentationEquivalentIdentifiers } from './presentation.ts';
import type {
  NotationExpression,
  NotationGroup,
  NotationNode,
} from './types.ts';

type Identity = string | readonly Identity[];

const scalarIdentity = (
  value: string,
  style: 'italic' | 'normal',
  normalizePresentation = false,
): Identity => [
  'scalar',
  style,
  normalizePresentation
    ? (presentationEquivalentIdentifiers.get(value) ?? value)
    : value,
];

const flattenTransparentGroups = (
  expression: NotationExpression,
): readonly NotationNode[] =>
  expression.flatMap((node) =>
    node.kind === 'group' && node.fence === 'none'
      ? flattenTransparentGroups(node.body)
      : [node],
  );

const expressionBodyIdentity = (expression: NotationExpression): Identity => {
  const nodes = flattenTransparentGroups(expression).map(nodeIdentity);
  return nodes.length === 1 && nodes[0] !== undefined
    ? nodes[0]
    : ['sequence', ...nodes];
};

const groupIdentity = (group: NotationGroup): Identity =>
  group.fence === 'none'
    ? expressionBodyIdentity(group.body)
    : ['group', group.fence, expressionBodyIdentity(group.body)];

const nodeIdentity = (node: NotationNode): Identity => {
  switch (node.kind) {
    case 'identifier':
      return scalarIdentity(
        node.value,
        [...node.value].length === 1 ? 'italic' : 'normal',
        true,
      );
    case 'number':
    case 'text':
      return scalarIdentity(node.value, 'normal');
    case 'operator':
      return ['operator', node.value];
    case 'group':
      return groupIdentity(node);
    case 'fraction':
      return [
        'fraction',
        nodeIdentity(node.numerator),
        nodeIdentity(node.denominator),
      ];
    case 'subscript':
      return [
        'subscript',
        nodeIdentity(node.base),
        nodeIdentity(node.subscript),
      ];
    case 'superscript':
      return [
        'superscript',
        nodeIdentity(node.base),
        nodeIdentity(node.superscript),
      ];
    case 'subsup':
      return [
        'subsup',
        nodeIdentity(node.base),
        nodeIdentity(node.subscript),
        nodeIdentity(node.superscript),
      ];
  }
};

export const notationIdentity = (expression: NotationExpression): string =>
  JSON.stringify(['notation', expressionBodyIdentity(expression)]);
