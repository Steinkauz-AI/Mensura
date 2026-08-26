import { ensureBuiltinMetrics } from "./core/builtins.js";
import { getMetric, type AnalyzeOptions } from "./core/registry.js";

export {
  evaluateMetric,
  evaluateAllMetrics,
} from "./core/evaluate.js";
export type {
  EvaluateMetricResult,
  EvaluateAllMetricOutcome,
  EvaluateAllMetricSuccess,
  EvaluateAllMetricFailure,
  EvaluateOptions,
  PiggybackResult,
  PiggybackSuccess,
  PiggybackFailure,
} from "./core/evaluate.js";
export {
  getMetric,
  listMetrics,
  singleMetric,
  registerMetric,
  clearMetrics,
} from "./core/registry.js";
export type {
  AnalyzeOptions,
  AnyMetric,
  MetricDefinition,
  MetricDirection,
  MetricId,
  MetricGrain,
  ComplexityDiff,
  ComplexityReport,
} from "./core/registry.js";
export { ensureBuiltinMetrics } from "./core/builtins.js";
export {
  MENSURA_CONFIG_FILE,
  MENSURA_DIR,
  defaultMensuraConfig,
  ensureMensuraConfig,
  ensureMensuraConfigFile,
  loadMensuraConfig,
  loadMensuraConfigOrDefault,
  parseMensuraConfig,
  serializeMensuraConfig,
  defaultMetricCatalog,
  gateForMetric,
  buildGrainPathSkipper,
  pathMatchesRule,
} from "./core/config/index.js";
export type {
  MensuraConfig,
  SkipPathRule,
  MetricBandsConfig,
  MetricCatalog,
  MetricSettings,
} from "./core/config/index.js";
export {
  DEFAULT_MAX_SNAPSHOTS,
  SNAPSHOT_SCHEMA_VERSION,
  defaultSnapshotName,
  latestSnapshot,
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  snapshotDirectory,
  snapshotMatchingInputs,
} from "./core/snapshot.js";
export type {
  SavedSnapshot,
  Snapshot,
  SnapshotMeta,
  SnapshotRef,
  SnapshotStore,
} from "./core/snapshot.js";
export { hashMetricInputs } from "./core/inputs.js";
export { checkoutStatus } from "./core/status.js";
export type {
  CheckoutStatus,
  MetricStatus,
  MetricStatusRow,
} from "./core/status.js";
export { diffComplexity } from "./lang/typescript/source/diff.js";
export type {
  DiffUnitAdded,
  DiffUnitChanged,
  DiffUnitRemoved,
  ComplexityUnit,
  ComplexityUnitKind,
  FileComplexity,
  UnparsedFile,
} from "./lang/typescript/source/index.js";
export { typescriptBackend } from "./lang/typescript/backend.js";
export type { LanguageBackend } from "./lang/types.js";
export type { HalsteadMeasures } from "./lang/typescript/scoring/halstead-score.js";
export type { MaintainabilityMeasures } from "./lang/typescript/scoring/maintainability.js";

async function runMetric(id: string, root: string, options?: AnalyzeOptions) {
  await ensureBuiltinMetrics();
  return getMetric(id)!.analyze(root, options);
}

export const analyzeComplexity = (root: string, options?: AnalyzeOptions) =>
  runMetric("cyclomatic-complexity", root, options);
export const analyzeCognitiveComplexity = (root: string, options?: AnalyzeOptions) =>
  runMetric("cognitive-complexity", root, options);
export const analyzeHalstead = (root: string, options?: AnalyzeOptions) =>
  runMetric("halstead", root, options);
export const analyzeNestingDepth = (root: string, options?: AnalyzeOptions) =>
  runMetric("nesting-depth", root, options);
export const analyzeMaintainability = (root: string, options?: AnalyzeOptions) =>
  runMetric("maintainability-index", root, options);
export const analyzeCoverage = (root: string, options?: AnalyzeOptions) =>
  runMetric("test-coverage", root, options);
export const analyzeCrap = (root: string, options?: AnalyzeOptions) =>
  runMetric("crap", root, options);
export const analyzeCycles = (root: string, options?: AnalyzeOptions) =>
  runMetric("cycles", root, options);
export const analyzeCoupling = (root: string, options?: AnalyzeOptions) =>
  runMetric("coupling", root, options);
export const analyzeEncapsulation = (root: string, options?: AnalyzeOptions) =>
  runMetric("encapsulation", root, options);
export const analyzePropagationCost = (root: string, options?: AnalyzeOptions) =>
  runMetric("propagation-cost", root, options);
