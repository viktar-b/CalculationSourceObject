import {
  type CalculationSourceSectionItem,
  type CalculationSourceSymbol,
  createSheetFromCalculationSourceObject,
  formatNumerical,
  type PreparedDocument,
  PreparedDocumentSchema,
  type PreparedDocumentSection,
  type PreparedMethodContent,
  type PreparedMethodHelper,
  type SheetDocument,
} from '@cs-object/core';
import { Fragment, type ReactElement } from 'react';
import { EngineeringMetadata } from './EngineeringMetadata.tsx';
import { FormulaSheetSymbolRow } from './formula-sheet/FormulaSheetSymbolRow.tsx';
import { GlyphMathBlock } from './mathml/GlyphMathBlock.tsx';
import { InlineFormulaMath } from './mathml/InlineFormulaMath.tsx';
import { UnitMathBlock } from './mathml/UnitMathBlock.tsx';

export interface PreparedFormulaSheetProps {
  readonly document: PreparedDocument;
  readonly showSourceDetails?: boolean;
}

// SheetDocument supplies only the existing mathematical notation renderer.
// PreparedDocument remains the sole content and placement authority.
const mathSheet = (document: PreparedDocument): SheetDocument =>
  createSheetFromCalculationSourceObject(
    {
      schemaVersion: '1.0.0',
      title: document.title,
      source: { id: 'prepared-math', metadata: {} },
      rootSectionIds: document.rootSectionIds,
      sections: document.sections.map((section) => ({
        id: section.id,
        title: section.title,
        items: section.items.flatMap((item): CalculationSourceSectionItem[] => {
          if (item.kind === 'externalCall') {
            return [...item.call.inputs, ...item.call.outputs].map(
              (quantity) => ({ kind: 'symbolRef', id: quantity.symbolId }),
            );
          }
          if (item.kind === 'section') {
            return [{ kind: 'section', id: item.id }];
          }
          if (item.kind === 'symbol') {
            return [{ kind: 'symbol', symbol: item.symbol }];
          }
          if (item.kind === 'symbolRef') {
            return [{ kind: 'symbolRef', id: item.id }];
          }
          return [];
        }),
      })),
      detachedItems: document.detachedSymbols.map((symbol) => ({
        kind: 'symbol',
        symbol,
      })),
    },
    { id: 'prepared-math', label: document.title },
  ).sheet;

const requiredItem = <T,>(items: ReadonlyMap<string, T>, id: string): T => {
  const item = items.get(id);
  if (!item) {
    throw new Error(`Missing prepared item '${id}'`);
  }
  return item;
};

const notationSheet = (
  id: string,
  symbols: readonly CalculationSourceSymbol[],
) => {
  const sheet = createSheetFromCalculationSourceObject(
    {
      schemaVersion: '1.0.0',
      title: id,
      source: { id, metadata: {} },
      rootSectionIds: [id],
      sections: [
        {
          id,
          title: id,
          items: symbols.map((symbol) => ({ kind: 'symbol', symbol })),
        },
      ],
      detachedItems: [],
    },
    { id, label: id },
  ).sheet;
  const byId = new Map(sheet.symbols.map((symbol) => [symbol.id, symbol]));
  return {
    row: (symbolId: string, index: number): ReactElement => (
      <FormulaSheetSymbolRow
        sheet={sheet}
        item={requiredItem(byId, symbolId)}
        sheetItemIndex={index}
        symbolicOnly={true}
      />
    ),
    description: (symbolId: string): string =>
      requiredItem(byId, symbolId).description,
    formula: (symbolId: string, showGlyph = true): ReactElement => (
      <InlineFormulaMath
        sheet={sheet}
        symbol={requiredItem(byId, symbolId)}
        showGlyph={showGlyph}
      />
    ),
  };
};
type Notation = ReturnType<typeof notationSheet>;

const numberText = (value: number): string =>
  Object.is(value, -0) ? '-0' : formatNumerical(value);

export const PreparedFormulaSheet = ({
  document: input,
  showSourceDetails = true,
}: PreparedFormulaSheetProps): ReactElement => {
  const document = PreparedDocumentSchema.parse(input);
  const sheet = mathSheet(document);
  const sections = new Map(
    document.sections.map((section) => [section.id, section]),
  );
  const assets = new Map(
    document.assets.map((asset) => [asset.asset.id, asset]),
  );
  const symbols = new Map(sheet.symbols.map((symbol) => [symbol.id, symbol]));
  let symbolIndex = 0;
  const renderMethodContent = (
    content: readonly PreparedMethodContent[],
    helpers: readonly PreparedMethodHelper[],
    notation: Notation,
    shown: Set<string>,
  ): ReactElement[] => {
    const helperById = new Map<string, PreparedMethodHelper>();
    const indexHelpers = (records: readonly PreparedMethodHelper[]): void => {
      for (const helper of records) {
        helperById.set(helper.id, helper);
        indexHelpers(helper.helpers);
      }
    };
    indexHelpers(helpers);
    const renderItems = (
      items: readonly PreparedMethodContent[],
    ): ReactElement[] =>
      items.map((item, index) => {
        if (item.kind === 'check' || item.kind === 'applicability') {
          return (
            <p
              key={`${item.kind}-${item.localId}-${index}`}
              className="cso-branch-note"
              data-check={item.kind === 'check' ? item.localId : undefined}
              data-applicability={
                item.kind === 'applicability' ? item.localId : undefined
              }
              data-formula={item.predicateText}
            >
              {item.explanation}{' '}
              {notation.formula(item.predicateSymbolId, false)}
            </p>
          );
        }
        if (item.kind === 'quantity') {
          return (
            <div
              key={`quantity-${item.selectionName}-${index}`}
              className="cso-method-quantity"
              data-quantity={item.selectionName}
              data-formula={item.formulaText || undefined}
            >
              {notation.row(item.symbolId, symbolIndex++)}
            </div>
          );
        }
        if (item.kind === 'text') {
          return (
            <p
              key={`text-${item.localId}`}
              className="cso-method-text"
              data-method-text={item.localId}
            >
              {item.content}
            </p>
          );
        }
        if (item.kind === 'figure') {
          const asset = assets.get(item.assetId);
          if (!asset) {
            throw new Error(`Missing method asset '${item.assetId}'`);
          }
          return (
            <figure
              key={`figure-${item.localId}`}
              className="cso-figure"
              data-method-figure={item.localId}
            >
              <img src={asset.dataUrl} alt={item.alt} />
              {item.caption ? <figcaption>{item.caption}</figcaption> : null}
            </figure>
          );
        }
        if (item.kind === 'section') {
          return (
            <section
              key={`section-${item.localId}`}
              className="cso-method-section"
              data-method-section={item.localId}
            >
              <h4>{item.title}</h4>
              <EngineeringMetadata entries={item.context ?? []} />
              {renderItems(item.content)}
            </section>
          );
        }
        const helper = helperById.get(item.helperId);
        let explanation: ReactElement | null = null;
        if (helper && !shown.has(helper.id)) {
          shown.add(helper.id);
          explanation = (
            <div className="cso-method-helper" data-helper={helper.function}>
              <h4>{helper.function}</h4>
              <EngineeringMetadata entries={helper.context ?? []} />
              {renderItems(helper.content)}
            </div>
          );
        }
        return (
          <div
            key={`call-${item.binding}`}
            className="cso-method-call"
            data-call={item.binding}
          >
            {explanation}
            <p>
              {item.binding}:{' '}
              {item.inputs.map((input, inputIndex) => (
                <Fragment key={input.name}>
                  {inputIndex > 0 ? ', ' : null}
                  <span data-formula={input.formulaText}>
                    {notation.formula(input.symbolId)}
                  </span>
                </Fragment>
              ))}
            </p>
          </div>
        );
      });
    return renderItems(content);
  };
  const renderSection = (section: PreparedDocumentSection): ReactElement => (
    <section
      key={section.id}
      data-section-id={section.id}
      className="cso-section"
    >
      <h2
        data-source-placement={section.sourcePlacementId}
        className="cso-section-heading"
      >
        {section.title}
      </h2>
      <EngineeringMetadata entries={section.context} />
      {section.engineeringChecks?.map((check) => (
        <p
          key={check.id}
          className="cso-branch-note"
          data-check={check.id}
          data-check-result={
            check.reasons ? 'not-applicable' : check.value ? 'pass' : 'fail'
          }
          data-formula={check.predicateText}
        >
          {check.reasons
            ? `Not applicable. ${check.reasons.join(' ')}`
            : `${check.value ? 'Pass' : 'Fail'}. ${check.explanation} ${check.predicateText}`}
        </p>
      ))}
      {section.items.map((item) => {
        switch (item.kind) {
          case 'externalCall': {
            const quantityRow = (
              quantity: (typeof item.call.outputs)[number],
              role: string,
            ) => {
              const symbol = requiredItem(symbols, quantity.symbolId);
              return (
                <tr
                  key={`${role}-${quantity.name}`}
                  data-external-quantity={quantity.name}
                  data-symbol-id={quantity.symbolId}
                >
                  <td colSpan={2} className="cso-external-quantity-cell">
                    <FormulaSheetSymbolRow
                      sheet={sheet}
                      item={symbol}
                      sheetItemIndex={symbolIndex++}
                      showFormula={false}
                    />
                  </td>
                </tr>
              );
            };
            return (
              <section
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-external-call={item.call.id}
                className="cso-external-call"
              >
                <table>
                  <thead>
                    <tr>
                      <th colSpan={2}>
                        <h3>{item.title}</h3>
                        <p>
                          External source: {item.call.adapter.moduleId},{' '}
                          {item.call.adapter.function}
                        </p>
                        <p>
                          External algorithm excluded from CSO formula
                          verification.
                        </p>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th colSpan={2}>Inputs</th>
                    </tr>
                    {item.call.inputs.map((quantity) =>
                      quantityRow(quantity, 'input'),
                    )}
                    <tr>
                      <th colSpan={2}>Method</th>
                    </tr>
                    {item.call.description
                      .split(/\n\s*\n/u)
                      .map((paragraph, index) => (
                        <tr key={`method-${index}`}>
                          <td colSpan={2}>{paragraph}</td>
                        </tr>
                      ))}
                    <tr>
                      <th colSpan={2}>Outputs</th>
                    </tr>
                    {item.call.outputs.map((quantity) =>
                      quantityRow(quantity, 'output'),
                    )}
                    {item.call.warnings.map((warning, index) => (
                      <tr key={`warning-${index}`}>
                        <td colSpan={2}>{warning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {document.verification?.externalCoverage ? (
                  <p className="cso-external-coverage">
                    External-result consistency:{' '}
                    {
                      document.verification.checks.externalResultConsistency
                        ?.status
                    }
                    . Formula checks:{' '}
                    {document.verification.checks.formulaConsistency.counts
                      ?.checked ?? 0}
                    . Captured external calls:{' '}
                    {document.verification.externalCoverage.calls}. External
                    results: {document.verification.externalCoverage.results}.
                  </p>
                ) : null}
                <EngineeringMetadata entries={item.context} />
              </section>
            );
          }
          case 'section': {
            const child = requiredItem(sections, item.id);
            return (
              <div
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
              >
                <EngineeringMetadata entries={item.context} />
                {renderSection(child)}
              </div>
            );
          }
          case 'text': {
            return (
              <div
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                className="cso-text"
              >
                {item.text.content}
                <EngineeringMetadata entries={item.context} />
              </div>
            );
          }
          case 'figure': {
            const asset = requiredItem(assets, item.figure.assetId);
            return (
              <figure
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-asset-sha256={asset.asset.sha256}
                className="cso-figure"
              >
                <img
                  src={asset.dataUrl}
                  alt={item.figure.alt}
                  style={
                    item.figure.width === undefined
                      ? undefined
                      : { width: item.figure.width }
                  }
                />
                {item.figure.caption && (
                  <figcaption>{item.figure.caption}</figcaption>
                )}
                <EngineeringMetadata entries={item.context} />
              </figure>
            );
          }
          case 'method': {
            return (
              <section
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-method-id={item.id}
                className="cso-method"
              >
                <h3>{item.title}</h3>
                <EngineeringMetadata entries={item.context} />
                {renderMethodContent(
                  item.content,
                  item.helpers,
                  notationSheet(item.id, item.symbols),
                  new Set(),
                )}
              </section>
            );
          }
          case 'table': {
            const quantityHeading = (
              quantity: (typeof item.groups)[number]['rows'][number],
            ) => (
              <span className="cso-comparison-quantity">
                <span className="cso-comparison-description">
                  {quantity.description}
                </span>
                <span className="cso-comparison-notation">
                  <GlyphMathBlock glyph={quantity.glyph} />
                  {quantity.unit ? (
                    <span className="cso-comparison-unit">
                      <UnitMathBlock unit={quantity.unit} />
                    </span>
                  ) : null}
                </span>
              </span>
            );
            const shownCell = (
              cell: (typeof item.groups)[number]['rows'][number]['cells'][number],
            ) =>
              cell.applicability ? 'Not applicable' : numberText(cell.value);
            const notation = item.symbols
              ? notationSheet(item.id, item.symbols)
              : undefined;
            const quantityColumn = new Map<string, number>();
            for (const group of item.groups) {
              for (const row of group.rows) {
                quantityColumn.set(
                  `${group.role}:${row.quantity}`,
                  quantityColumn.size,
                );
              }
            }
            const groupColumns = (group: (typeof item.groups)[number]) =>
              group.rows
                .map((row) =>
                  quantityColumn.get(`${group.role}:${row.quantity}`),
                )
                .join(',');
            return (
              <div
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-comparison-id={item.id}
                data-cases-axis={item.casesAxis}
                data-column-cap={item.columnCap}
                className="cso-comparison"
              >
                <h3>{item.title}</h3>
                {item.engineeringChecks?.map((check) =>
                  check.results.map((result) => (
                    <p
                      key={`${check.id}-${result.invocationId}`}
                      className="cso-branch-note"
                      data-check={check.id}
                      data-check-result={
                        result.reasons
                          ? 'not-applicable'
                          : result.value
                            ? 'pass'
                            : 'fail'
                      }
                      data-case={result.heading}
                      data-formula={check.predicateText}
                    >
                      {result.heading}
                      {result.callPath ? ` / ${result.callPath}` : ''}:{' '}
                      {result.reasons
                        ? `Not applicable. ${result.reasons.join(' ')}`
                        : `${result.value ? 'Pass' : 'Fail'}. ${check.explanation}`}
                    </p>
                  )),
                )}
                {item.applicabilityNotes?.map((condition) =>
                  condition.results.map((result) => (
                    <p
                      key={`${condition.id}-${result.invocationId}`}
                      className="cso-branch-note"
                      data-applicability={condition.id}
                      data-applicability-result={
                        result.value ? 'applicable' : 'not-applicable'
                      }
                      data-case={result.heading}
                      data-formula={condition.predicateText}
                    >
                      {result.heading}
                      {result.callPath ? ` / ${result.callPath}` : ''}:{' '}
                      {result.reasons
                        ? `Not applicable. ${result.reasons.join(' ')}`
                        : condition.explanation}
                    </p>
                  )),
                )}
                {item.branchNotes?.map((note) => (
                  <p
                    key={`${note.invocationId}-${note.symbolId}-${note.nodeKey}`}
                    className="cso-branch-note"
                    data-branch-note={note.heading}
                    data-case={note.heading}
                    data-symbol-id={note.symbolId}
                    data-node-key={note.nodeKey}
                    data-formula={note.label}
                  >
                    {note.heading}
                    {note.callPath ? ` / ${note.callPath}` : ''}:{' '}
                    {notation?.description(note.branchSymbolId)}{' '}
                    {notation?.formula(note.branchSymbolId)}, because{' '}
                    {notation?.formula(note.conditionSymbolId, false)}{' '}
                    {note.conditionHolds ? 'holds' : 'does not hold'}.
                  </p>
                ))}
                {item.emptyState ? (
                  <p className="cso-comparison-empty">{item.emptyState}</p>
                ) : null}
                {item.casesAxis === 'rows' ? (
                  <div
                    className="cso-comparison-scroll"
                    data-comparison-scroll=""
                  >
                    <table data-comparison-table="screen">
                      <thead>
                        <tr>
                          <th scope="col" data-comparison-label="">
                            Case
                          </th>
                          {item.groups.map((group) => (
                            <th
                              key={group.role}
                              scope="colgroup"
                              colSpan={group.rows.length}
                              data-comparison-columns={groupColumns(group)}
                            >
                              {group.label}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th scope="col" data-comparison-label="">
                            Quantity
                          </th>
                          {item.groups.flatMap((group) =>
                            group.rows.map((row) => (
                              <th
                                key={`${group.role}-${row.quantity}`}
                                scope="col"
                                data-quantity={row.quantity}
                                data-comparison-column={quantityColumn.get(
                                  `${group.role}:${row.quantity}`,
                                )}
                              >
                                {quantityHeading(row)}
                              </th>
                            )),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {item.cases.map((caseItem) => (
                          <tr key={caseItem.invocationId}>
                            <th
                              scope="row"
                              data-comparison-label=""
                              data-case-heading={caseItem.heading}
                            >
                              {caseItem.heading}
                            </th>
                            {item.groups.flatMap((group) =>
                              group.rows.map((row) => {
                                const cell = row.cells.find(
                                  (candidate) =>
                                    candidate.invocationId ===
                                    caseItem.invocationId,
                                );
                                if (!cell) {
                                  throw new Error(
                                    `Missing ${row.quantity} for ${caseItem.heading}`,
                                  );
                                }
                                return (
                                  <td
                                    key={`${caseItem.invocationId}-${row.quantity}`}
                                    data-quantity={row.quantity}
                                    data-case={caseItem.heading}
                                    data-symbol-id={cell.symbolId}
                                    data-value={cell.value}
                                    data-comparison-column={quantityColumn.get(
                                      `${group.role}:${row.quantity}`,
                                    )}
                                    data-applicability={
                                      cell.applicability
                                        ? 'not-applicable'
                                        : undefined
                                    }
                                  >
                                    {shownCell(cell)}
                                  </td>
                                );
                              }),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div
                    className="cso-comparison-scroll"
                    data-comparison-scroll=""
                  >
                    <table data-comparison-table="screen">
                      <thead>
                        <tr>
                          <th scope="col" data-comparison-label="">
                            Quantity
                          </th>
                          {item.cases.map((caseItem, index) => (
                            <th
                              key={caseItem.invocationId}
                              scope="col"
                              data-case-heading={caseItem.heading}
                              data-comparison-column={index}
                            >
                              {caseItem.heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {item.groups.map((group) => (
                          <Fragment key={group.role}>
                            <tr>
                              <th
                                scope="colgroup"
                                colSpan={item.cases.length + 1}
                                data-comparison-banner=""
                              >
                                {group.label}
                              </th>
                            </tr>
                            {group.rows.map((row) => (
                              <tr key={`${group.role}-${row.quantity}`}>
                                <th
                                  scope="row"
                                  data-quantity={row.quantity}
                                  data-comparison-label=""
                                >
                                  {quantityHeading(row)}
                                </th>
                                {row.cells.map((cell, index) => (
                                  <td
                                    key={cell.invocationId}
                                    data-quantity={row.quantity}
                                    data-case={cell.heading}
                                    data-symbol-id={cell.symbolId}
                                    data-value={cell.value}
                                    data-comparison-column={index}
                                    data-applicability={
                                      cell.applicability
                                        ? 'not-applicable'
                                        : undefined
                                    }
                                  >
                                    {shownCell(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <EngineeringMetadata entries={item.context} />
              </div>
            );
          }
          case 'symbol':
          case 'symbolRef': {
            const symbolId = item.kind === 'symbol' ? item.symbol.id : item.id;
            const symbol = requiredItem(symbols, symbolId);
            const index = symbolIndex++;
            return (
              <div
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-symbol-id={symbolId}
                className="cso-symbol-placement"
              >
                <EngineeringMetadata entries={item.context} />
                {'applicability' in item && item.applicability ? (
                  <p
                    className="cso-branch-note"
                    data-applicability="not-applicable"
                    data-symbol-id={symbolId}
                  >
                    Not applicable. {item.applicability.reasons.join(' ')}
                  </p>
                ) : null}
                {item.operands.map(({ symbolId: id, context }) => (
                  <EngineeringMetadata
                    key={id}
                    entries={context}
                    subject={
                      <>
                        Operand{' '}
                        <GlyphMathBlock
                          glyph={requiredItem(symbols, id).glyph}
                        />
                      </>
                    }
                  />
                ))}
                <FormulaSheetSymbolRow
                  sheet={sheet}
                  item={symbol}
                  sheetItemIndex={index}
                />
              </div>
            );
          }
          default: {
            const exhaustive: never = item;
            return exhaustive;
          }
        }
      })}
    </section>
  );
  return (
    <article
      data-formula-sheet="true"
      data-prepared-document="true"
      className="cso-document"
    >
      <header className="cso-document-header">
        <h1>{document.title}</h1>
        {showSourceDetails && (
          <p>
            {document.source.kind === 'legacy'
              ? 'Development preservation rendering. Numerical agreement has not been verified.'
              : 'Execution-bound document. Numerical verification is reported separately.'}
          </p>
        )}
        {showSourceDetails && document.source.kind === 'execution' && (
          <p>
            Function {document.source.function}. Inputs{' '}
            {Object.entries(document.source.resolvedInputs)
              .map(
                ([key, value]) =>
                  `${key} = ${Object.is(value, -0) ? '-0' : value}`,
              )
              .join(', ')}
            .
          </p>
        )}
      </header>
      <EngineeringMetadata entries={document.context} />
      {document.rootSectionIds.map((id) => {
        const section = sections.get(id);
        if (!section) {
          throw new Error(`Missing prepared root '${id}'`);
        }
        return renderSection(section);
      })}
    </article>
  );
};
