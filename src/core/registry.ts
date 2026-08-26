import { analyzeComplexity } from "../metrics/cyclomatic-complexity/index.js";
import { analyzeCognitiveComplexity } from "../metrics/cognitive-complexity/index.js";
import { analyzeCoverage } from "../metrics/test-coverage/index.js";
import { ensureTestCoverage } from "../metrics/test-coverage/ensure.js";
import { analyzeCrap } from "../metrics/crap/index.js";
import { analyzeCycles } from "../metrics/cycles/index.js";
import { analyzeCoupling } from "../metrics/coupling/index.js";
import { analyzeEncapsulation } from "../metrics/encapsulation/index.js";
import { analyzeHalstead } from "../metrics/halstead/index.js";
import { analyzeMaintainability } from "../metrics/maintainability-index/index.js";
import { analyzeNestingDepth } from "../metrics/nesting-depth/index.js";
import { analyzePropagationCost } from "../metrics/propagation-cost/index.js";
import type { MetricGrain } from "./config/config.js";
import { diffComplexity } from "../lang/typescript/source/index.js";
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


export const METRICS = {
  "cyclomatic-complexity": {
    id: "cyclomatic-complexity",
    name: "Cyclomatic complexity",
    direction: "higher-worse" as const,
    grain: "function",
    analyze: analyzeComplexity,
    diff: diffComplexity,
  },
  "cognitive-complexity": {
    id: "cognitive-complexity",
    name: "Cognitive complexity",
    direction: "higher-worse" as const,
    grain: "function",
    analyze: analyzeCognitiveComplexity,
    diff: diffComplexity,
  },
  halstead: {
    id: "halstead",
    name: "Halstead",
    direction: "higher-worse" as const,
    grain: "function",
    analyze: analyzeHalstead,
    diff: diffComplexity,
  },
  "nesting-depth": {
    id: "nesting-depth",
    name: "Nesting depth",
    direction: "higher-worse" as const,
    grain: "function",
    analyze: analyzeNestingDepth,
    diff: diffComplexity,
  },
  "maintainability-index": {
    id: "maintainability-index",
    name: "Maintainability index",
    direction: "higher-better" as const,
    grain: "function",
    analyze: analyzeMaintainability,
    diff: diffComplexity,
  },
  "test-coverage": {
    id: "test-coverage",
    name: "Test coverage",
    direction: "higher-better" as const,
    grain: "function",
    analyze: analyzeCoverage,
    diff: diffComplexity,
    prepare: ensureTestCoverage,
  },
  crap: {
    id: "crap",
    name: "CRAP",
    direction: "higher-worse" as const,
    grain: "function",
    analyze: analyzeCrap,
    diff: diffComplexity,
    prepare: ensureTestCoverage,
  },
  cycles: {
    id: "cycles",
    name: "Cycles",
    direction: "higher-worse" as const,
    grain: "structure",
    analyze: analyzeCycles,
    diff: diffComplexity,
  },
  coupling: {
    id: "coupling",
    name: "Coupling",
    direction: "higher-worse" as const,
    grain: "structure",
    analyze: analyzeCoupling,
    diff: diffComplexity,
  },
  encapsulation: {
    id: "encapsulation",
    name: "Encapsulation",
    direction: "higher-worse" as const,
    grain: "structure",
    analyze: analyzeEncapsulation,
    diff: diffComplexity,
  },
  "propagation-cost": {
    id: "propagation-cost",
    name: "Propagation cost",
    direction: "higher-worse" as const,
    grain: "structure",
    analyze: analyzePropagationCost,
    diff: diffComplexity,
  },
};

export type MetricId = keyof typeof METRICS;
export type AnyMetric = MetricDefinition<any, any>;

export function listMetrics(): Array<{ id: string; name: string }> {
  return Object.values(METRICS).map((metric) => ({
    id: metric.id,
    name: metric.name,
  }));
}

export function getMetric(id: string): AnyMetric | undefined {
  return (METRICS as Record<string, AnyMetric>)[id];
}

export function singleMetric(): AnyMetric | undefined {
  const all = listMetrics();
  return all.length === 1 ? getMetric(all[0]!.id)! : undefined;
}

export type { ComplexityDiff, ComplexityReport };
