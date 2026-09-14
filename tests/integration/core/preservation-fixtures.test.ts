import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BoundPreparedDocumentSchema,
  ExecutionResponseSchema,
  PreparedDocumentSchema,
} from '@viktar-b/cso-core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const preservationDirectory = resolve(
  repositoryRoot,
  'tests/integration/fixtures/demo-preservation',
);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

const preparedFixtureNames = readdirSync(preservationDirectory)
  .filter((name) => name.endsWith('.prepared.json'))
  .sort();

const sourceDerivedFixtures = [
  'two-panel-success',
  'two-panel-width-1',
] as const;

const HistoricalSymbolsSchema = z.object({
  symbols: z.array(z.object({ id: z.string(), glyph: z.string() })),
});

describe('demo preservation fixtures', () => {
  it.each(preparedFixtureNames)(
    '%s satisfies the prepared document contract',
    (name) => {
      const document = readJson(resolve(preservationDirectory, name));

      expect(PreparedDocumentSchema.safeParse(document).success).toBe(true);
    },
  );

  it.each(sourceDerivedFixtures)(
    '%s remains bound to its source contract symbols',
    (name) => {
      const response = ExecutionResponseSchema.parse(
        readJson(
          resolve(repositoryRoot, `tests/fixtures/contract-cases/${name}.json`),
        ),
      );
      if (!response.ok) {
        throw new Error(`${name} must be a successful execution fixture`);
      }
      const document = PreparedDocumentSchema.parse(
        readJson(resolve(preservationDirectory, `${name}.prepared.json`)),
      );

      expect(
        BoundPreparedDocumentSchema.safeParse({
          execution: response.execution,
          document,
        }).success,
      ).toBe(true);

      const sourceSymbols = response.execution.cso.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? [item.symbol] : [],
        ),
      );
      const preparedSymbols = document.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'symbol' ? [item.symbol] : [],
        ),
      );
      const preparedById = new Map(
        preparedSymbols.map((symbol) => [symbol.id, symbol]),
      );

      expect(preparedSymbols).toHaveLength(sourceSymbols.length);
      for (const symbol of sourceSymbols) {
        expect(preparedById.get(symbol.id)).toEqual(symbol);
      }

      const historicalById = new Map(
        document.historicalReviews.flatMap((review) =>
          HistoricalSymbolsSchema.parse(review.originalFields).symbols.map(
            (symbol) => [symbol.id, symbol.glyph] as const,
          ),
        ),
      );
      for (const symbol of sourceSymbols) {
        expect(historicalById.get(symbol.id)).toBe(symbol.glyph);
      }
    },
  );
});
