import type { ComplexityReport, MensuraConfig, MetricDirection } from "../../index.js";
import { table } from "./table.js";
import { checkGate, scaleFor } from "./bands.js";
import { formatCheck, summaryOf } from "./complexity.js";

export type RunAllSummary = {
  functions: number;
  files: number;
  min: number | null;
  mean: number | null;
  median: number | null;
  max: number | null;
};

export type RunAllRow = {
  id: string;
  name: string;
  status: "pass" | "fail" | "error";
  violationCount: number;
  summary: RunAllSummary;
  error: string | null;
  threshold: string;
};

export function formatThresholdLabel(
  gate: { gate: "max"; threshold: number } | { gate: "min"; threshold: number },
): string {
  return gate.gate === "min" ? `>=${gate.threshold}` : `<=${gate.threshold}`;
}

export function batchSummary(
  metricId: string,
  report: ComplexityReport,
  config?: MensuraConfig,
): RunAllSummary {
  const summary = summaryOf(report, scaleFor(metricId, config));
  return {
    functions: summary.functions,
    files: summary.files,
    min: summary.min,
    mean: summary.mean,
    median: summary.median,
    max: summary.max,
  };
}

export function emptySummary(): RunAllSummary {
  return { functions: 0, files: 0, min: null, mean: null, median: null, max: null };
}

export function thresholdViolationCount(
  metricId: string,
  report: ComplexityReport,
  direction: MetricDirection,
  config?: MensuraConfig,
): number {
  const gate = checkGate(metricId, config);
  const { violations } = formatCheck(report, {
    gate: gate.gate,
    threshold: gate.threshold,
    color: false,
    scale: scaleFor(metricId, config),
    direction,
  });
  return violations.length;
}

function dash(value: number | null): string {
  return value === null ? "-" : String(value);
}

export function formatRunAllDashboard(
  root: string,
  rows: RunAllRow[],
  counts: { passed: number; failed: number; errors: number },
): string {
  const lines: string[] = ["Metric summary", `root  ${root}`, ""];
  lines.push(
    table(
      [
        [
          "metric",
          "status",
          "errors",
          "functions",
          "files",
          "min",
          "mean",
          "median",
          "max",
          "threshold",
          "threshold violations",
        ],
        ...rows.map((row) => {
          const failed = row.status === "error";
          return [
            row.id,
            row.status,
            row.error ?? "-",
            failed ? "-" : String(row.summary.functions),
            failed ? "-" : String(row.summary.files),
            failed ? "-" : dash(row.summary.min),
            failed ? "-" : dash(row.summary.mean),
            failed ? "-" : dash(row.summary.median),
            failed ? "-" : dash(row.summary.max),
            row.threshold,
            failed ? "-" : String(row.violationCount),
          ];
        }),
      ],
      [
        "left",
        "left",
        "left",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
      ],
    ),
  );
  lines.push(
    "",
    `passed ${counts.passed}  failed ${counts.failed}  errors ${counts.errors}`,
  );
  return lines.join("\n");
}
