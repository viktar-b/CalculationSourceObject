import type { PreparedDocument } from '@viktar-b/cso-core';
import { join } from 'node:path';
import { loadPreparedDocumentEntries } from './prepared-gallery.ts';
import { loadPythonSource, type PythonSourceFile } from './python-source.ts';
import { createSheetExamples, type SheetExample } from './sheet-gallery.ts';

type PreparedGalleryExample = {
  readonly kind: 'prepared';
  readonly id: string;
  readonly label: string;
  readonly document: PreparedDocument;
  readonly pythonFiles: readonly PythonSourceFile[];
};

type SheetGalleryExample = SheetExample & {
  readonly kind: 'sheet';
};

export type GalleryExample = PreparedGalleryExample | SheetGalleryExample;
const preparedSuffix = /\.prepared\.json$/;

export const loadExamples = ({
  galleryDirectory = process.env.CSO_GALLERY_DIRECTORY,
  examplesDirectory = process.env.CSO_EXAMPLES_DIRECTORY,
}: {
  readonly galleryDirectory?: string;
  readonly examplesDirectory?: string;
} = {}): GalleryExample[] => {
  if (galleryDirectory !== undefined) {
    return createSheetExamples(galleryDirectory).map((example) => ({
      ...example,
      kind: 'sheet',
    }));
  }
  return loadPreparedDocumentEntries(examplesDirectory ?? '').map(
    ({ name, document }, index) => ({
      kind: 'prepared',
      id: `prepared-${index}`,
      label: document.title || 'Untitled calculation',
      document,
      pythonFiles: loadPythonSource({
        path: join(
          examplesDirectory ?? '',
          name.replace(preparedSuffix, '.source.json'),
        ),
        document,
      }),
    }),
  );
};
