'use client';
import type { PreparedDocument } from '@viktar-b/cso-core';
import { PreparedFormulaSheet, printFormulaSheet } from '@viktar-b/cso-react';
import { useState } from 'react';

export function PreservationClient({
  documents,
}: { readonly documents: readonly PreparedDocument[] }) {
  const [selected, setSelected] = useState(0);
  const [printError, setPrintError] = useState<string>();
  const document = documents[selected];
  if (!document) return <p>No prepared documents have been supplied.</p>;
  return (
    <div>
      <div className="my-4 flex flex-wrap gap-3">
        <label>
          Calculation{' '}
          <select
            className="ml-2 max-w-[600px] border p-2"
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {documents.map((document, index) => (
              <option key={document.title} value={index}>
                {document.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="border px-4 py-2"
          type="button"
          onClick={() => {
            setPrintError(undefined);
            printFormulaSheet({
              title: document?.title,
              onError: () =>
                setPrintError('The figure could not be prepared for printing.'),
            });
          }}
        >
          Print selected document
        </button>
      </div>
      {printError && <p role="alert">{printError}</p>}
      <div className="overflow-x-auto">
        {document && <PreparedFormulaSheet document={document} />}
      </div>
    </div>
  );
}
