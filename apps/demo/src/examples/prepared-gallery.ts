import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PreparedDocumentSchema } from '@viktar-b/cso-core';

export const loadPreparedDocumentEntries = (directory: string) => {
  if (!directory) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.prepared.json'))
    .sort()
    .map((name) => ({
      name,
      document: PreparedDocumentSchema.parse(
        JSON.parse(readFileSync(join(directory, name), 'utf8')),
      ),
    }));
};

export const loadPreparedDocuments = (directory: string) =>
  loadPreparedDocumentEntries(directory).map(({ document }) => document);
