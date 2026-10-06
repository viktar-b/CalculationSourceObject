export type ComparisonMeasurement = {
  comparisonId: string;
  sourcePlacementId: string;
  labelWidth: number;
  columnWidths: number[];
  availableWidth: number;
  cap?: number;
};

export type ComparisonPartPlan = ComparisonMeasurement & {
  groups: number[][];
  unfit?: { column: number; required: number; available: number };
};

export type ComparisonLayoutDiagnostic = {
  code: 'DOCUMENT_LAYOUT_OVERFLOW';
  message: string;
  stage: 'rendering';
  check: 'rendering';
  layout: {
    media: 'print';
    sourcePlacementId?: string;
    selector: string;
    left: number;
    right: number;
    containerLeft: number;
    containerRight: number;
    overflowPx: number;
  };
};

const FIT_TOLERANCE_PX = 2;

export function partitionColumnAxis(
  columnWidths: readonly number[],
  labelWidth: number,
  availableWidth: number,
  cap?: number,
): { groups: number[][]; unfit?: ComparisonPartPlan['unfit'] } {
  if (columnWidths.length === 0 || availableWidth <= 0) {
    return {
      groups: columnWidths.length
        ? [columnWidths.map((_, index) => index)]
        : [],
    };
  }
  const limit = cap && cap > 0 ? cap : Number.POSITIVE_INFINITY;
  const groups: number[][] = [];
  let current: number[] = [];
  let used = labelWidth;
  for (let index = 0; index < columnWidths.length; index += 1) {
    const width = columnWidths[index] ?? 0;
    const alone = labelWidth + width;
    if (alone > availableWidth + FIT_TOLERANCE_PX) {
      return {
        groups: [],
        unfit: { column: index, required: alone, available: availableWidth },
      };
    }
    if (
      current.length > 0 &&
      (current.length >= limit ||
        used + width > availableWidth + FIT_TOLERANCE_PX)
    ) {
      groups.push(current);
      current = [];
      used = labelWidth;
    }
    current.push(index);
    used += width;
  }
  if (current.length > 0) groups.push(current);
  return { groups };
}

export function planComparisonParts(
  measurements: readonly ComparisonMeasurement[],
): ComparisonPartPlan[] {
  return measurements.map((measurement) => {
    const partitioned = partitionColumnAxis(
      measurement.columnWidths,
      measurement.labelWidth,
      measurement.availableWidth,
      measurement.cap,
    );
    return {
      ...measurement,
      groups: partitioned.groups,
      ...(partitioned.unfit ? { unfit: partitioned.unfit } : {}),
    };
  });
}

export function measureComparisons(root?: ParentNode): ComparisonMeasurement[] {
  const scope = root ?? document;
  const measurements: ComparisonMeasurement[] = [];
  for (const comparison of scope.querySelectorAll<HTMLElement>(
    '[data-comparison-id]',
  )) {
    const table = comparison.querySelector<HTMLTableElement>(
      'table[data-comparison-table="screen"]',
    );
    const scroll = comparison.querySelector<HTMLElement>(
      '[data-comparison-scroll]',
    );
    if (
      !table ||
      !scroll ||
      typeof table.getBoundingClientRect !== 'function'
    ) {
      continue;
    }
    const labelWidth = [
      ...table.querySelectorAll<HTMLElement>('[data-comparison-label]'),
    ].reduce(
      (max, cell) => Math.max(max, cell.getBoundingClientRect().width),
      0,
    );
    const columnWidths: number[] = [];
    for (const cell of table.querySelectorAll<HTMLElement>(
      'thead [data-comparison-column]',
    )) {
      const index = Number(cell.getAttribute('data-comparison-column'));
      if (!Number.isInteger(index) || columnWidths[index] !== undefined)
        continue;
      columnWidths[index] = cell.getBoundingClientRect().width;
    }
    const cap = Number(comparison.getAttribute('data-column-cap'));
    const measurement: ComparisonMeasurement = {
      comparisonId: comparison.getAttribute('data-comparison-id') || '',
      sourcePlacementId: comparison.getAttribute('data-source-placement') || '',
      labelWidth,
      columnWidths,
      availableWidth: scroll.clientWidth,
    };
    if (Number.isInteger(cap) && cap > 0) measurement.cap = cap;
    measurements.push(measurement);
  }
  return measurements;
}

export function renderComparisonParts(
  plans: readonly ComparisonPartPlan[],
  root?: ParentNode,
): ComparisonLayoutDiagnostic[] {
  const noteMatches = (
    note: Element,
    comparison: Element,
    kept: ReadonlySet<number>,
  ): boolean => {
    if (comparison.getAttribute('data-cases-axis') === 'rows') return true;
    const heading = note.getAttribute('data-case');
    if (!heading) return true;
    const header = [
      ...comparison.querySelectorAll<HTMLElement>(
        'thead [data-case-heading][data-comparison-column]',
      ),
    ].find((cell) => cell.getAttribute('data-case-heading') === heading);
    if (!header) return true;
    return kept.has(Number(header.getAttribute('data-comparison-column')));
  };
  const keepColumn = (cell: Element, kept: ReadonlySet<number>): boolean => {
    if (cell.hasAttribute('data-comparison-label')) return true;
    if (cell.hasAttribute('data-comparison-banner')) {
      (cell as HTMLTableCellElement).colSpan = kept.size + 1;
      return true;
    }
    const listed = cell.getAttribute('data-comparison-columns');
    if (listed !== null) {
      const next = listed.split(',').filter((value) => kept.has(Number(value)));
      if (next.length === 0) return false;
      (cell as HTMLTableCellElement).colSpan = next.length;
      cell.setAttribute('data-comparison-columns', next.join(','));
      return true;
    }
    const index = cell.getAttribute('data-comparison-column');
    return index === null || kept.has(Number(index));
  };
  const scope = root ?? document;
  const diagnostics: ComparisonLayoutDiagnostic[] = [];
  for (const [comparisonIndex, plan] of plans.entries()) {
    const comparison = [
      ...scope.querySelectorAll<HTMLElement>('[data-comparison-id]'),
    ].find(
      (element) =>
        element.getAttribute('data-comparison-id') === plan.comparisonId,
    );
    if (!comparison) continue;
    comparison.querySelector('[data-comparison-parts]')?.remove();
    const selector = `[data-source-placement=${JSON.stringify(plan.sourcePlacementId)}]`;
    if (plan.unfit) {
      const overflowPx = Math.max(
        0,
        plan.unfit.required - plan.unfit.available,
      );
      const layout: ComparisonLayoutDiagnostic['layout'] = {
        media: 'print',
        selector,
        left: 0,
        right: plan.unfit.required,
        containerLeft: 0,
        containerRight: plan.unfit.available,
        overflowPx,
      };
      if (plan.sourcePlacementId) {
        layout.sourcePlacementId = plan.sourcePlacementId;
      }
      diagnostics.push({
        code: 'DOCUMENT_LAYOUT_OVERFLOW',
        stage: 'rendering',
        check: 'rendering',
        message: `Comparison column ${plan.unfit.column + 1} cannot fit with its labels in print layout: ${selector}, required ${plan.unfit.required.toFixed(2)}px, available ${plan.unfit.available.toFixed(2)}px.`,
        layout,
      });
      continue;
    }
    const table = comparison.querySelector<HTMLTableElement>(
      'table[data-comparison-table="screen"]',
    );
    if (!table || plan.groups.length === 0) continue;
    const parts = document.createElement('div');
    parts.setAttribute('data-comparison-parts', '');
    parts.className = 'cso-comparison-parts';
    plan.groups.forEach((group, partIndex) => {
      const kept = new Set(group);
      const part = document.createElement('section');
      part.className = 'cso-comparison-part';
      part.setAttribute('data-comparison-part', String(partIndex + 1));
      part.setAttribute('data-part-count', String(plan.groups.length));
      if (plan.groups.length > 1) {
        const label = document.createElement('p');
        label.className = 'cso-branch-note';
        label.setAttribute('data-comparison-part-label', '');
        label.textContent = `Part ${partIndex + 1} of ${plan.groups.length}`;
        part.appendChild(label);
      }
      for (const note of comparison.querySelectorAll(
        ':scope > p.cso-branch-note',
      )) {
        if (noteMatches(note, comparison, kept))
          part.appendChild(note.cloneNode(true));
      }
      const clone = table.cloneNode(true) as HTMLTableElement;
      clone.removeAttribute('data-comparison-table');
      clone.setAttribute('data-comparison-part-table', String(partIndex + 1));
      for (const row of clone.querySelectorAll('tr')) {
        for (const cell of [...row.children]) {
          if (!keepColumn(cell, kept)) cell.remove();
        }
      }
      let rowNumber = 0;
      for (const row of clone.querySelectorAll('tr')) {
        const label = row.querySelector<HTMLElement>('[data-comparison-label]');
        if (!label) continue;
        const rowId = `cso-c${comparisonIndex}-p${partIndex}-r${rowNumber}`;
        rowNumber += 1;
        label.id = rowId;
        for (const cell of row.querySelectorAll<HTMLTableCellElement>(
          '[data-comparison-column]',
        )) {
          const column = cell.getAttribute('data-comparison-column');
          const header = clone.querySelector<HTMLElement>(
            `thead [data-comparison-column="${column}"]`,
          );
          if (header && !header.id) {
            header.id = `cso-c${comparisonIndex}-p${partIndex}-c${column}`;
          }
          if (cell.tagName === 'TD' && header?.id) {
            cell.setAttribute('headers', `${rowId} ${header.id}`);
          }
        }
      }
      part.appendChild(clone);
      parts.appendChild(part);
    });
    comparison.appendChild(parts);
  }
  return diagnostics;
}
