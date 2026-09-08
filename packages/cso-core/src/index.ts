// biome-ignore lint/performance/noBarrelFile: Public package entrypoint.
export {
  SheetDocumentSchema,
  SheetLiteralSchema,
  SheetSectionItemSchema,
  SheetSectionSchema,
  SheetSymbolSchema,
  SheetValueNodeSchema,
  SheetValueTreeSchema,
  type SheetDocument,
  type SheetLiteral,
  type SheetSection,
  type SheetSectionItem,
  type SheetSymbol,
  type SheetValueNode,
  type SheetValueTree,
} from './sheet-model/schema.ts';

export {
  getFunctionBinaryOperatorById,
  getFunctionSpec,
  getValueFunctionGlyph,
  sheetFunctionSpecs,
  sheetFunctionSpecsById,
  supportedValueFunctionIds,
  SheetOperatorAssociativity,
  SheetOperatorPriority,
  type SheetBinaryOperator,
  type SheetFunctionSpec,
} from './sheet-model/functions.ts';

export { deriveGlyphCodeName } from './sheet-model/glyphCodeName.ts';

export {
  ValueTreeJsonValidationError,
  parseValueTreeJson,
  safeParseValueTreeJson,
  type SafeParseValueTreeJsonResult,
} from './value-tree-json/parse.ts';

export {
  createCalculationFromValueTreeDocument,
  createCalculationFromValueTreeJson,
  createSheetFromValueTreeDocument,
  createSheetFromValueTreeJson,
  type Calculation,
  type CalculationOptions,
  type ValueTreeSheet,
  type ValueTreeSheetDiagnostics,
  type ValueTreeSheetOptions,
} from './value-tree-json/to-sheet.ts';

export {
  createPythonFromCalculation,
  createPythonFromSheetDocument,
  createPythonFromValueTreeJson,
  type PythonExportOptions,
  type PythonFromValueTreeJsonOptions,
} from './python/to-python.ts';

export {
  ValueTreeJsonDocumentSchema,
  ValueTreeJsonLiteralSchema,
  ValueTreeJsonNodeSchema,
  ValueTreeJsonSectionSchema,
  ValueTreeJsonSymbolSchema,
} from './value-tree-json/schema.ts';

export {
  CalculationSourceObjectSchema,
  CalculationSourceDetachedItemSchema,
  CalculationSourceFunctionArgSchema,
  CalculationSourceFunctionSpecSchema,
  CalculationSourceLiteralSchema,
  CalculationSourcePreservedEntitySchema,
  CalculationSourceRootNodeSchema,
  CalculationSourceSectionItemSchema,
  CalculationSourceSectionSchema,
  CalculationSourceSymbolReferenceSchema,
  CalculationSourceSymbolSchema,
  CalculationSourceValueNodeSchema,
  CalculationSourceValueTreeSchema,
  type CalculationSourceDetachedItem,
  type CalculationSourceFunctionArg,
  type CalculationSourceFunctionSpec,
  type CalculationSourceObject,
  type CalculationSourceLiteral,
  type CalculationSourceSection,
  type CalculationSourceSectionItem,
  type CalculationSourceSymbol,
  type CalculationSourceValueNode,
  type CalculationSourceValueTree,
} from './calculation-source/object-schema.ts';

export {
  CalculationSourceValidationError,
  parseCalculationSourceJson,
  safeParseCalculationSourceJson,
  type SafeParseCalculationSourceJsonResult,
} from './calculation-source/parse.ts';

export {
  createSheetFromCalculationSourceObject,
  createSheetFromCalculationSourceJson,
} from './calculation-source/to-sheet.ts';

export type {
  ValueTreeJsonDocument,
  ValueTreeJsonDocumentInput,
  ValueTreeJsonLiteral,
  ValueTreeJsonNode,
  ValueTreeJsonSection,
  ValueTreeJsonSymbol,
} from './value-tree-json/types.ts';

export {
  getRootSectionItems,
  getValueNodeByKey,
  getValueNodeByKeyOrUndefined,
  getSymbolById,
  type SheetRenderableItem,
} from './sheet-model/selectors.ts';
export {
  emptyLiteral,
  isSheetLiteralEmpty,
  sheetLiteralToDisplayString,
} from './sheet-model/literals.ts';
export { assertNever } from './shared/assertNever.ts';
export { formatNumerical } from './shared/formatNumerical.ts';

export {
  type Comparison,
  type DiagnosticStage,
  type CheckName,
  type SourceManifest,
  ExecutionBindingSchema,
  executionBindingKey,
  type ExecutionBinding,
  AssetRecordSchema,
  CheckNameSchema,
  ComparisonSchema,
  DiagnosticSchema,
  DiagnosticStageSchema,
  HashSchema,
  ModuleIdSchema,
  NodeAddressSchema,
  ProvenanceSchema,
  PythonIdentifierSchema,
  ResolvedInputsSchema,
  SourceManifestEntrySchema,
  SourceManifestSchema,
  SourceSpanSchema,
  SupportedNumberSchema,
  VersionsSchema,
  contractIssuesToDiagnostics,
  namespacedId,
  serializeSourceManifest,
  sourceClosureHash,
  type AssetRecord,
  type Diagnostic,
  type NodeAddress,
  type Provenance,
  type ResolvedInputs,
  type SourceManifestEntry,
  type SourceSpan,
  type Versions,
} from './contracts/common.ts';
export {
  ExecutionPayloadSchema,
  ExecutionResponseSchema,
  GivenSourceSchema,
  InputBindingSchema,
  InvocationSchema,
  OperationObservationSchema,
  SymbolDefinitionSchema,
  SymbolObservationSchema,
  type ExecutionPayload,
  type ExecutionResponse,
  type GivenSource,
  type InputBinding,
  type Invocation,
  type OperationObservation,
  type SymbolDefinition,
  type SymbolObservation,
} from './contracts/execution.ts';
export {
  BoundReferenceCaseSchema,
  ReferenceBindingSchema,
  ReferenceCaseSchema,
  ReferenceCasesSchema,
  ReferenceFileSchema,
  VerifyExecutionInputSchema,
  referenceBindingKey,
  type BoundReferenceCase,
  type ReferenceBinding,
  type ReferenceCase,
  type ReferenceFile,
  type VerifyExecution,
  type VerifyExecutionInput,
} from './contracts/reference.ts';
export {
  CheckSchema,
  CommandReportSchema,
  InspectionEvidenceSchema,
  NumericPolicySchema,
  VerificationReportSchema,
  type Check,
  type CommandReport,
  type InspectionEvidence,
  type NumericPolicy,
  type VerificationReport,
} from './contracts/reports.ts';
export {
  BoundPreparedDocumentSchema,
  type BoundPreparedDocument,
  HistoricalReviewSchema,
  LegacyAssetManifestSchema,
  PreparedContextValueSchema,
  PreparedContextFieldSchema,
  type PreparedContextValue,
  type PreparedContextField,
  PreparedDocumentItemSchema,
  PreparedDocumentSchema,
  PreparedDocumentSectionSchema,
  ResolvedAssetSchema,
  type HistoricalReview,
  type LegacyAssetManifest,
  type PreparedDocument,
  type PreparedDocumentItem,
  type PreparedDocumentSection,
  type ResolvedAsset,
} from './contracts/document.ts';
export { verifyExecution } from './verification/verify.ts';

export {
  AuthoringEvidenceSchema,
  type AuthoringEvidence,
} from './contracts/authoring.ts';
