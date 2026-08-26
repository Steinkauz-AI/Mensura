import type { MetricGrain } from "./config/config.js";
import type { ComplexityDiff, ComplexityReport } from "../lang/typescript/source/index.js";

export type AnalyzeOptions = {
  include?: string[];
};

export type MetricDirection = "higher-worse" | "higher-better";

export type { MetricGrain };

export type MetricDefinition<TReport = unknown, TDiff = unknown> = {
  id: string;
  name: string;
  direction: MetricDirection;
  grain: MetricGrain;
  analyze: (root: string, options?: AnalyzeOptions) => Promise<TReport>;
  diff: (before: TReport, after: TReport) => TDiff;
  prepare?: (root: string) => Promise<void>;
};

export type AnyMetric = MetricDefinition<any, any>;

const byId = new Map<string, AnyMetric>();

/** Registration order preserved for listMetrics(). */
const order: string[] = [];

export function registerMetric(metric: AnyMetric): void {
  if (!byId.has(metric.id)) order.push(metric.id);
  byId.set(metric.id, metric);
}

export function clearMetrics(): void {
  byId.clear();
  order.length = 0;
}

export function listMetrics(): Array<{ id: string; name: string }> {
  return order.map((id) => {
    const metric = byId.get(id)!;
    return { id: metric.id, name: metric.name };
  });
}

export function getMetric(id: string): AnyMetric | undefined {
  return byId.get(id);
}

export function singleMetric(): AnyMetric | undefined {
  const all = listMetrics();
  return all.length === 1 ? getMetric(all[0]!.id)! : undefined;
}

export type MetricId = string;

export type { ComplexityDiff, ComplexityReport };
