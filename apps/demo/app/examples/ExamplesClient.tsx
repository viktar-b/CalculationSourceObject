'use client';

import { FormulaSheet } from '@viktar-b/cso-react';
import type { SheetExample } from '../../src/examples/sheet-gallery.ts';
import { printFormulaSheet } from '@viktar-b/cso-react';
import { useState } from 'react';

export function ExamplesClient({
  examples,
}: { readonly examples: SheetExample[] }) {
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0]?.id);
  const selectedExample =
    examples.find((example) => example.id === selectedExampleId) ?? examples[0];
  if (!selectedExample) return <p>No calculations have been supplied.</p>;
  const selectedSourceLabel = selectedExample.label;
  const handlePrintSelectedSheet = (): void => {
    printFormulaSheet({ title: selectedSourceLabel });
  };

  return (
    <section className="grid gap-5 min-xl:grid-cols-[260px_minmax(0,1fr)]">
      <p className="text-sm text-gray-600 min-xl:col-span-2">
        This gallery is a mathematical projection. Figures and standalone prose
        are omitted here.{' '}
        <a className="underline" href="/preservation">
          Open the supplied prepared documents
        </a>
        . Browser printing is for development; use cso pdf for verified PDF
        publication with evidence.
      </p>
      <aside className="min-xl:sticky min-xl:top-6 min-xl:self-start">
        <div className="flex max-h-[320px] min-h-0 flex-col border border-gray-300 bg-white min-xl:max-h-[calc(100vh-180px)]">
          <div className="flex items-center justify-between gap-3 border-b border-gray-300 px-4 py-3">
            <h2 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Sources
            </h2>
            <span className="font-mono text-[12px] text-gray-500">
              {examples.length}
            </span>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {examples.map((example, exampleIndex) => {
              const selected = example.id === selectedExample.id;
              const sourceLabel = example.label;
              return (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => setSelectedExampleId(example.id)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`Select ${sourceLabel}`}
                  className={`grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-gray-200 px-3 py-2 text-left font-['Plus_Jakarta_Sans'] transition-colors last:border-b-0 ${
                    selected
                      ? 'bg-gray-950 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-950'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center border font-mono text-[11px] ${
                      selected
                        ? 'border-white/25 bg-white/10 text-white'
                        : 'border-gray-300 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {exampleIndex + 1}
                  </span>
                  <span className="block min-w-0 truncate text-[13px] font-semibold leading-5">
                    {sourceLabel}
                  </span>
                  {example.diagnostics && (
                    <span
                      className={`font-mono text-[11px] ${
                        selected ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {example.diagnostics.formulaCount} fx
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="grid min-w-0 gap-3 bg-[#f6f5f1] px-0 py-0 min-md:grid-cols-[minmax(0,auto)_auto] min-md:items-start min-md:px-8">
        <div className="order-2 min-w-0 max-w-full overflow-x-auto overscroll-x-contain px-4 pb-3 min-md:order-1 min-md:px-0">
          <FormulaSheet
            key={selectedExample.id}
            sheet={selectedExample.sheet}
          />
        </div>
        <div className="order-1 flex min-w-0 items-start justify-end px-4 min-md:order-2 min-md:px-0">
          <button
            type="button"
            onClick={handlePrintSelectedSheet}
            aria-label={`Print ${selectedSourceLabel}`}
            className="border border-gray-300 bg-white px-3 py-2 font-['Plus_Jakarta_Sans'] text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-700 transition-colors hover:bg-gray-950 hover:text-white"
          >
            Browser print
          </button>
        </div>
      </div>
    </section>
  );
}
