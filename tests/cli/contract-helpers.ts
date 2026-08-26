import { expect } from "vitest";

export const NO_ANSI = /\x1b\[/;

export const LISTED_METRIC_IDS = [
  "cyclomatic-complexity",
  "cognitive-complexity",
  "halstead",
  "nesting-depth",
  "maintainability-index",
  "test-coverage",
  "crap",
  "cycles",
  "coupling",
  "encapsulation",
  "propagation-cost",
  "status",
  "missing",
] as const;

export function expectListedMetrics(stdout: string): void {
  for (const id of LISTED_METRIC_IDS) {
    if (id === "status" || id === "missing") continue;
    expect(stdout).toContain(id);
  }
  expect(stdout).toContain("status");
  expect(stdout).toContain("missing");
  expect(stdout).not.toContain("currency");
}

export function expectHelpBasics(stdout: string): void {
  expect(stdout).toContain("mensura -i");
  expect(stdout).toContain("list");
  expect(stdout).toContain("run <id>");
  expect(stdout).toContain("snapshot show");
  expect(stdout).not.toContain("--json");
  expect(stdout).toContain("Exit codes");
  expect(stdout).toContain("2 gate failed");
  expect(stdout).toMatch(/\d+ up-to-date, \d+ outdated, \d+ missing/);
  expect(stdout).toContain("See mensura list.");
}

export const COVERAGE_LINES_A = [
  { line: 1, hits: 1 },
  { line: 2, hits: 1 },
];

export const COVERAGE_LINES_B_FULL = [
  { line: 1, hits: 1 },
  { line: 2, hits: 1 },
  { line: 3, hits: 1 },
  { line: 8, hits: 1 },
  { line: 12, hits: 1 },
];

export const COVERAGE_LINES_B_PARTIAL = [
  { line: 1, hits: 1 },
  { line: 2, hits: 0 },
];

export type RunResult = { code: number; stdout: string; stderr: string };

export async function expectMinCheckSlice(
  mensura: (args: string[], cwd: string) => Promise<RunResult>,
  root: string,
  metric: string,
  catalogMin: number,
  sliceMin: number,
): Promise<void> {
  const passing = await mensura(["run", metric, "--check"], root);
  expect(passing.code).toBe(0);
  expect(passing.stdout).toContain(`threshold  min ${catalogMin}`);

  const sliced = await mensura(["run", metric, "--check", "--min", String(sliceMin)], root);
  expect(sliced.code).toBe(0);
  expect(sliced.stdout).toContain(`threshold  min ${catalogMin}`);
  expect(sliced.stdout).not.toContain(`threshold  min ${sliceMin}`);
}

export function expectCompletionFlags(stdout: string): void {
  expect(stdout).toContain("latest");
  expect(stdout).toContain("previous");
  expect(stdout).toContain("list");
  expect(stdout).toContain("run");
  expect(stdout).toContain("snapshot");
  expect(stdout).toContain("show");
  expect(stdout).toContain("diff");
  expect(stdout).not.toContain("--json");
  expect(stdout).toContain("--interactive");
  expect(stdout).toContain("--baseline");
  expect(stdout).toContain("--no-save");
}
