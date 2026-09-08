import {
  type CalculationSourceSectionItem,
  type PreparedDocument,
  PreparedDocumentSchema,
  type PreparedDocumentSection,
  type SheetDocument,
  createSheetFromCalculationSourceObject,
} from '@viktar-b/cso-core';
import type { ReactElement } from 'react';
import { GlyphMathBlock } from './mathml/GlyphMathBlock.tsx';
import { EngineeringMetadata } from './EngineeringMetadata.tsx';
import { FormulaSheetSymbolRow } from './formula-sheet/FormulaSheetSymbolRow.tsx';

export interface PreparedFormulaSheetProps {
  readonly document: PreparedDocument;
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
        <p>
          {document.source.kind === 'legacy'
            ? 'Development preservation rendering. Numerical agreement has not been verified.'
            : 'Execution-bound document. Numerical verification is reported separately.'}
        </p>
        {document.source.kind === 'execution' && (
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
