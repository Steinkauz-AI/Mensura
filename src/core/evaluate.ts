import { ensureBuiltinMetrics } from "./builtins.js";
import { loadMensuraConfig } from "./config/index.js";
import { hashMetricInputs } from "./inputs.js";
import { ensureTestCoverage } from "../metrics/test-coverage/ensure.js";
import { getMetric, listMetrics, type AnyMetric } from "./registry.js";
import {
  saveSnapshot,
  snapshotMatchingInputs,
  type SavedSnapshot,
  type SnapshotStore,
} from "./snapshot.js";

export type EvaluateOptions = {
  save?: boolean;
  now?: () => Date;
  maxSnapshots?: number;
  
  skipPrepare?: boolean;
  
  catalog?: AnyMetric[];
};

export interface EvaluateMetricResult<TReport = unknown> {
  report: TReport;
  inputsHash: string;
  
  reused: boolean;
  
  snapshot: SavedSnapshot<TReport> | null;
  
  piggyback: PiggybackResult[];
}

export type PiggybackSuccess = {
  id: string;
  ok: true;
  result: EvaluateMetricResult<unknown>;
};

export type PiggybackFailure = {
  id: string;
  ok: false;
  error: Error;
};

export type PiggybackResult = PiggybackSuccess | PiggybackFailure;


export async function evaluateMetric<TReport>(
  metric: AnyMetric,
  root: string,
  options?: EvaluateOptions,
): Promise<EvaluateMetricResult<TReport>> {
  await ensureBuiltinMetrics();
  const resolved = await resolveEvaluateOptions(root, options);
  const store = snapshotStoreFor(metric.id, root, resolved);
  const inputsHash = await hashMetricInputs(root);
  const current = await snapshotMatchingInputs<TReport>(store, inputsHash);
  if (current) {
    return reusedResult(current, inputsHash);
  }
  return analyzeAndMaybeSave(metric, root, store, inputsHash, resolved);
}

async function resolveEvaluateOptions(
  root: string,
  options: EvaluateOptions | undefined,
): Promise<EvaluateOptions> {
  if (options?.maxSnapshots !== undefined) return options;
  const config = await loadMensuraConfig(root);
  return { ...options, maxSnapshots: config.maxSnapshots };
}

function snapshotStoreFor(
  metricId: string,
  root: string,
  options: EvaluateOptions | undefined,
): SnapshotStore {
  return {
    root,
    metric: metricId,
    now: options?.now,
    maxSnapshots: options?.maxSnapshots,
  };
}

function reusedResult<TReport>(
  current: SavedSnapshot<TReport>,
  inputsHash: string,
): EvaluateMetricResult<TReport> {
  return {
    report: current.snapshot.report,
    inputsHash,
    reused: true,
    snapshot: current,
    piggyback: [],
  };
}

async function analyzeAndMaybeSave<TReport>(
  metric: AnyMetric,
  root: string,
  store: SnapshotStore,
  inputsHash: string,
  options: EvaluateOptions | undefined,
): Promise<EvaluateMetricResult<TReport>> {
  const save = options?.save ?? true;
  if (!options?.skipPrepare) {
    await metric.prepare?.(root);
  }
  const report = (await metric.analyze(root)) as TReport;
  if (!save) {
    return { report, inputsHash, reused: false, snapshot: null, piggyback: [] };
  }
  const snapshot = await saveSnapshot(store, report, inputsHash);
  const piggyback = await piggybackCoverageSiblings(metric, root, inputsHash, options);
  return { report, inputsHash, reused: false, snapshot, piggyback };
}

function registeredCatalog(): AnyMetric[] {
  return listMetrics().map((entry) => getMetric(entry.id)!);
}

function coverageCohort(catalog: AnyMetric[]): AnyMetric[] {
  return catalog.filter((entry) => entry.prepare);
}

async function evaluatePiggybackSibling(
  sibling: AnyMetric,
  root: string,
  inputsHash: string,
  options: EvaluateOptions | undefined,
  catalog: AnyMetric[],
): Promise<PiggybackResult> {
  try {
    const result = await evaluateMetric(sibling, root, {
      ...options,
      save: true,
      skipPrepare: true,
      catalog,
    });
    return { id: sibling.id, ok: true, result };
  } catch (err) {
    return {
      id: sibling.id,
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

async function piggybackCoverageSiblings(
  metric: AnyMetric,
  root: string,
  inputsHash: string,
  options: EvaluateOptions | undefined,
): Promise<PiggybackResult[]> {
  if (options?.skipPrepare) return [];
  const catalog = options?.catalog ?? registeredCatalog();
  const cohort = coverageCohort(catalog);
  if (!cohort.some((entry) => entry.id === metric.id)) return [];
  const piggyback: PiggybackResult[] = [];
  for (const sibling of cohort) {
    if (sibling.id === metric.id) continue;
    const alreadyCurrent = await snapshotMatchingInputs(
      { root, metric: sibling.id },
      inputsHash,
    );
    if (alreadyCurrent) continue;
    piggyback.push(await evaluatePiggybackSibling(sibling, root, inputsHash, options, catalog));
  }
  return piggyback;
}

export type EvaluateAllMetricSuccess<TReport = unknown> = {
  metric: AnyMetric;
  result: EvaluateMetricResult<TReport>;
};

export type EvaluateAllMetricFailure = {
  metric: AnyMetric;
  error: Error;
};

export type EvaluateAllMetricOutcome<TReport = unknown> =
  | EvaluateAllMetricSuccess<TReport>
  | EvaluateAllMetricFailure;

type CoveragePrepState = {
  status: "pending" | "ready" | "failed";
  error: Error | null;
};


export async function evaluateAllMetrics<TReport = unknown>(
  root: string,
  options?: { save?: boolean; now?: () => Date; maxSnapshots?: number },
): Promise<EvaluateAllMetricOutcome<TReport>[]> {
  await ensureBuiltinMetrics();
  const metrics = listMetrics().map((entry) => getMetric(entry.id)!);
  const inputsHash = await hashMetricInputs(root);
  const coverage: CoveragePrepState = { status: "pending", error: null };
  const outcomes: EvaluateAllMetricOutcome<TReport>[] = [];
  for (const metric of metrics) {
    outcomes.push(await evaluateOneAllMetric(metric, root, inputsHash, coverage, options));
  }
  return outcomes;
}

async function evaluateOneAllMetric<TReport>(
  metric: AnyMetric,
  root: string,
  inputsHash: string,
  coverage: CoveragePrepState,
  options: { save?: boolean; now?: () => Date; maxSnapshots?: number } | undefined,
): Promise<EvaluateAllMetricOutcome<TReport>> {
  try {
    const skipPrepare = await resolveSkipPrepare(metric, root, inputsHash, coverage);
    const result = await evaluateMetric<TReport>(metric, root, {
      ...options,
      skipPrepare: metric.prepare !== undefined && skipPrepare,
    });
    return { metric, result };
  } catch (err) {
    return {
      metric,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

async function resolveSkipPrepare(
  metric: AnyMetric,
  root: string,
  inputsHash: string,
  coverage: CoveragePrepState,
): Promise<boolean> {
  if (!metric.prepare) return false;
  const current = await snapshotMatchingInputs(
    { root, metric: metric.id },
    inputsHash,
  );
  if (current) return true;
  if (coverage.status === "pending") {
    await runCoveragePrepare(root, coverage);
    return true;
  }
  if (coverage.status === "ready") return true;
  throw coverage.error ?? new Error("Coverage preparation failed.");
}

async function runCoveragePrepare(
  root: string,
  coverage: CoveragePrepState,
): Promise<void> {
  try {
    await ensureTestCoverage(root);
    coverage.status = "ready";
  } catch (err) {
    coverage.status = "failed";
    coverage.error = err instanceof Error ? err : new Error(String(err));
    throw coverage.error;
  }
}
