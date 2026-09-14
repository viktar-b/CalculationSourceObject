import type { PreparedDocument } from '@viktar-b/cso-core';
import { loadPreparedDocuments } from './prepared-gallery.ts';
import { createSheetExamples, type SheetExample } from './sheet-gallery.ts';

type PreparedGalleryExample = {
  readonly kind: 'prepared';
  readonly id: string;
  readonly label: string;
  readonly document: PreparedDocument;
};

type SheetGalleryExample = SheetExample & {
  readonly kind: 'sheet';
};

export type GalleryExample = PreparedGalleryExample | SheetGalleryExample;

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
  return loadPreparedDocuments(examplesDirectory ?? '').map(
    (document, index) => ({
      kind: 'prepared',
      id: `prepared-${index}`,
      label: document.title || 'Untitled calculation',
      document,
    }),
  );
};
