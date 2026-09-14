import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PreparedDocumentSchema } from '@viktar-b/cso-core';

export const loadPreparedDocuments = (
  directory: string,
) => {
  if (!directory) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.prepared.json'))
    .sort()
    .map((name) =>
      PreparedDocumentSchema.parse(
        JSON.parse(readFileSync(join(directory, name), 'utf8')),
      ),
    );
};
