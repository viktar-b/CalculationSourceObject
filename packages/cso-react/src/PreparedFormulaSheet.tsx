import {
  type CalculationSourceSectionItem,
  createSheetFromCalculationSourceObject,
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
        if (item.kind === 'quantity') {
          return (
            <p
              key={`quantity-${item.selectionName}-${index}`}
              className="cso-method-quantity"
              data-quantity={item.selectionName}
            >
              <GlyphMathBlock glyph={item.glyph} /> {item.description}{' '}
              {item.unit}
              {item.formulaText ? (
                <span data-formula={item.formulaText}>
                  {' '}
                  = {item.formulaText}
                </span>
              ) : null}
            </p>
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
              {item.inputs
                .map((input) => `${input.name} = ${input.formulaText}`)
                .join(', ')}
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
      {section.items.map((item) => {
        switch (item.kind) {
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
                {renderMethodContent(item.content, item.helpers, new Set())}
                <EngineeringMetadata entries={item.context} />
              </section>
            );
          }
          case 'table': {
            const quantityHeading = (
              quantity: (typeof item.groups)[number]['rows'][number],
            ) => (
              <>
                <GlyphMathBlock glyph={quantity.glyph} /> {quantity.description}{' '}
                {quantity.unit}
              </>
            );
            const cellText = (value: number) =>
              Object.is(value, -0) ? '-0' : value;
            return (
              <div
                key={item.sourcePlacementId}
                data-source-placement={item.sourcePlacementId}
                data-comparison-id={item.id}
                data-cases-axis={item.casesAxis}
                className="cso-comparison"
              >
                <h3>{item.title}</h3>
                {item.emptyState ? (
                  <p className="cso-comparison-empty">{item.emptyState}</p>
                ) : null}
                {item.casesAxis === 'rows' ? (
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Case</th>
                        {item.groups.map((group) => (
                          <th
                            key={group.role}
                            scope="colgroup"
                            colSpan={group.rows.length}
                          >
                            {group.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th scope="col">Quantity</th>
                        {item.groups.flatMap((group) =>
                          group.rows.map((row) => (
                            <th
                              key={`${group.role}-${row.quantity}`}
                              scope="col"
                              data-quantity={row.quantity}
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
                          <th scope="row" data-case-heading={caseItem.heading}>
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
                                >
                                  {cellText(cell.value)}
                                </td>
                              );
                            }),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Quantity</th>
                        {item.cases.map((caseItem) => (
                          <th
                            key={caseItem.invocationId}
                            scope="col"
                            data-case-heading={caseItem.heading}
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
                            >
                              {group.label}
                            </th>
                          </tr>
                          {group.rows.map((row) => (
                            <tr key={`${group.role}-${row.quantity}`}>
                              <th scope="row" data-quantity={row.quantity}>
                                {quantityHeading(row)}
                              </th>
                              {row.cells.map((cell) => (
                                <td
                                  key={cell.invocationId}
                                  data-quantity={row.quantity}
                                  data-case={cell.heading}
                                  data-symbol-id={cell.symbolId}
                                >
                                  {cellText(cell.value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
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
