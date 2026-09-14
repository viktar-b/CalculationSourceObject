'use client';

import { FormulaSheet, PreparedFormulaSheet } from '@viktar-b/cso-react';
import { useId, useState } from 'react';
import type { GalleryExample } from '../../src/examples/gallery.ts';
import { CodeBlock } from '../CodePanel.tsx';
import styles from './examples.module.css';

function ExampleView({ example }: { readonly example: GalleryExample }) {
  const files = example.kind === 'prepared' ? example.pythonFiles : [];
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.moduleId);
  const [view, setView] = useState<'document' | 'python'>('document');
  const selectedFile =
    files.find((file) => file.moduleId === selectedFileId) ?? files[0];
  const id = useId();

  return (
    <>
      {selectedFile && (
        <fieldset className={styles.viewTabs}>
          <legend className="sr-only">Example view</legend>
          <button
            type="button"
            aria-pressed={view === 'document'}
            aria-controls={`${id}-document`}
            onClick={() => setView('document')}
          >
            Calculation
          </button>
          <button
            type="button"
            aria-pressed={view === 'python'}
            aria-controls={`${id}-python`}
            onClick={() => setView('python')}
          >
            Python
          </button>
        </fieldset>
      )}
      <div
        className={`${styles.workspace} ${selectedFile ? styles.withSource : ''}`}
        data-view={view}
      >
        {selectedFile && (
          <section
            id={`${id}-python`}
            className={styles.sourcePane}
            aria-label="Python source"
          >
            <div className={styles.paneHeader}>
              <label htmlFor={`${id}-file`}>Python source</label>
              <select
                id={`${id}-file`}
                aria-label="Python source file"
                value={selectedFile.moduleId}
                onChange={(event) => setSelectedFileId(event.target.value)}
              >
                {files.map((file) => (
                  <option key={file.moduleId} value={file.moduleId}>
                    {file.moduleId}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.codeScroll} key={selectedFile.moduleId}>
              <CodeBlock language="python">{selectedFile.code}</CodeBlock>
            </div>
          </section>
        )}
        <section
          id={`${id}-document`}
          className={styles.documentPane}
          aria-label="Calculation document"
        >
          {selectedFile && (
            <div className={styles.paneHeader}>Calculation document</div>
          )}
          <div className={styles.documentScroll}>
            {example.kind === 'prepared' ? (
              <PreparedFormulaSheet
                document={example.document}
                showSourceDetails={false}
              />
            ) : (
              <FormulaSheet sheet={example.sheet} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function ExamplesClient({
  examples,
}: { readonly examples: readonly GalleryExample[] }) {
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0]?.id);
  const selectedExample =
    examples.find((example) => example.id === selectedExampleId) ?? examples[0];
  if (!selectedExample) {
    return <p>No calculations have been supplied.</p>;
  }
  return (
    <section className={styles.examples}>
      {examples.length > 1 && (
        <label className={styles.examplePicker}>
          Calculation
          <select
            value={selectedExample.id}
            onChange={(event) => setSelectedExampleId(event.target.value)}
          >
            {examples.map((example) => (
              <option key={example.id} value={example.id}>
                {example.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedExample.kind === 'sheet' && (
        <p className={styles.projectionNote}>
          This mathematical view omits figures and standalone prose.
        </p>
      )}
      <ExampleView key={selectedExample.id} example={selectedExample} />
    </section>
  );
}
