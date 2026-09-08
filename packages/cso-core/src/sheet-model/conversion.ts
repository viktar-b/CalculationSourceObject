import type { SheetDocument } from './types.ts';

export interface ValueTreeSheetDiagnostics {
  readonly compactSections: number;
  readonly compactSymbols: number;
  readonly formulaCount: number;
  readonly unresolvedReferences: number;
  readonly unsupportedFunctions: number;
}

export interface ValueTreeSheet {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sheet: SheetDocument;
  readonly diagnostics: ValueTreeSheetDiagnostics;
}

export type Calculation = ValueTreeSheet;

export interface ValueTreeSheetOptions {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly flattenSingleSection?: boolean;
  readonly sheetId?: string;
}

export type CalculationOptions = ValueTreeSheetOptions;
