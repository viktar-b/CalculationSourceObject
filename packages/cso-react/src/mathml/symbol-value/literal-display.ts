import { isSheetLiteralEmpty, type SheetValueNode } from '@cs-object/core';

export const displayedLiteralDraft = ({
  node,
  literalsAsDrafts,
}: {
  readonly node: Extract<SheetValueNode, { kind: 'literal' }>;
  readonly literalsAsDrafts?: boolean;
}): string | undefined =>
  (literalsAsDrafts || isSheetLiteralEmpty(node.value)) &&
  (node.draft ?? '').length > 0
    ? node.draft
    : undefined;
