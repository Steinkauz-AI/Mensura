import { ensureTestCoverage } from "../metrics/test-coverage/ensure.js";
import { hashMetricInputs } from "./inputs.js";
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

export type PiggybackResult = {
  id: string;
  result: EvaluateMetricResult<unknown>;
};


export async function evaluateMetric<TReport>(
  metric: AnyMetric,
  root: string,
  options?: EvaluateOptions,
): Promise<EvaluateMetricResult<TReport>> {
  const save = options?.save ?? true;
  const store: SnapshotStore = {
    root,
    metric: metric.id,
    now: options?.now,
    maxSnapshots: options?.maxSnapshots,
  };
  const inputsHash = await hashMetricInputs(root);
  const current = await snapshotMatchingInputs<TReport>(store, inputsHash);
  if (current) {
    return {
      report: current.snapshot.report,
      inputsHash,
      reused: true,
      snapshot: current,
      piggyback: [],
    };
  }
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
    try {
      const result = await evaluateMetric(sibling, root, {
        ...options,
        save: true,
        skipPrepare: true,
        catalog,
      });
      piggyback.push({ id: sibling.id, result });
    } catch {
      
    }
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


export async function evaluateAllMetrics<TReport = unknown>(
  root: string,
  options?: { save?: boolean; now?: () => Date; maxSnapshots?: number },
): Promise<EvaluateAllMetricOutcome<TReport>[]> {
  const metrics = listMetrics().map((entry) => getMetric(entry.id)!);
  const inputsHash = await hashMetricInputs(root);
  let coverageState: "pending" | "ready" | "failed" = "pending";
  let coverageError: Error | null = null;

  const outcomes: EvaluateAllMetricOutcome<TReport>[] = [];
  for (const metric of metrics) {
    try {
      let skipPrepare = false;
      if (metric.prepare) {
        const current = await snapshotMatchingInputs<TReport>(
          { root, metric: metric.id },
          inputsHash,
        );
        if (current) {
          skipPrepare = true;
        } else if (coverageState === "pending") {
          try {
            await ensureTestCoverage(root);
            coverageState = "ready";
            skipPrepare = true;
          } catch (err) {
            coverageState = "failed";
            coverageError = err instanceof Error ? err : new Error(String(err));
            throw coverageError;
          }
        } else if (coverageState === "ready") {
          skipPrepare = true;
        } else {
          throw coverageError ?? new Error("Coverage preparation failed.");
        }
      }
      const result = await evaluateMetric<TReport>(metric, root, {
        ...options,
        skipPrepare: metric.prepare !== undefined && skipPrepare,
      });
      outcomes.push({ metric, result });
    } catch (err) {
      outcomes.push({
        metric,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }
  return outcomes;
}
