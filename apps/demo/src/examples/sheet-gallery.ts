import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type SheetDocument,
  type ValueTreeSheetDiagnostics,
  createSheetFromCalculationSourceObject,
  parseCalculationSourceJson,
} from '@viktar-b/cso-core';

export interface SheetExample {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sheet: SheetDocument;
  readonly diagnostics?: ValueTreeSheetDiagnostics;
}

/** The host supplies optional calculation data; the app owns no engineering catalog. */
export const createSheetExamples = (
  directory = process.env.CSO_GALLERY_DIRECTORY,
): SheetExample[] => {
  if (!directory) return [];
  return readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        !name.startsWith('_') &&
        !name.startsWith('.'),
    )
    .sort()
    .map((name) => {
      const description = `CalculationSourceObject from ${name}`;
      const source = parseCalculationSourceJson(
        JSON.parse(readFileSync(join(directory, name), 'utf8')),
        description,
      );
      return createSheetFromCalculationSourceObject(source, {
        id: name.slice(0, -5),
        label: source.title,
        description,
      });
    });
};
