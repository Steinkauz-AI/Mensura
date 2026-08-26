import { describe, expect, it } from "vitest";
import type { ComplexityReport, ComplexityUnit } from "../../src/index.js";
import {
  formatCheck,
  formatComplexityDiff,
  formatComplexityView,
  formatStatusRollup,
  formatMetricList,
  COGNITIVE_SCALE,
  COVERAGE_SCALE,
  CRAP_SCALE,
  CYCLES_SCALE,
  COUPLING_SCALE,
  ENCAPSULATION_SCALE,
  HALSTEAD_VOLUME_SCALE,
  MAINTAINABILITY_SCALE,
  NESTING_SCALE,
  PROPAGATION_SCALE,
  selectComplexity,
  summaryOf,
} from "../../src/cli/format/index.js";
import { formatRunAllDashboard, batchSummary, emptySummary, formatThresholdLabel, thresholdViolationCount } from "../../src/cli/format/run-all.js";

function unit(
  path: string,
  name: string,
  complexity: number,
  startLine = 1,
  extra?: {
    difficulty?: number;
    effort?: number;
    volume?: number;
    cyclomatic?: number;
    loc?: number;
    coverage?: number;
  },
): ComplexityUnit {
  return {
    path,
    name,
    kind: "function",
    startLine,
    endLine: startLine + 1,
    complexity,
    ...extra,
  };
}

const report: ComplexityReport = {
  units: [
    unit("src/a.ts", "hot", 25, 10),
    unit("src/a.ts", "warm", 12, 20),
    unit("src/b.ts", "cold", 3, 5),
  ],
  files: [
    { path: "src/a.ts", functionCount: 2, minComplexity: 12, maxComplexity: 25, sumComplexity: 37 },
    { path: "src/b.ts", functionCount: 1, minComplexity: 3, maxComplexity: 3, sumComplexity: 3 },
  ],
  unparsed: [],
};

const at = new Date("2026-08-20T10:00:00.000Z");

describe("formatComplexityView", () => {
  it("prints the overview with summary stats and hottest units", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      title: "Cognitive complexity",
    });
    expect(text).toContain("Cognitive complexity");
    expect(text).not.toContain("Cyclomatic complexity");
    expect(text).toContain("/r");
    expect(text).toContain("2026-08-20T10:00:00.000Z");
    expect(text).toContain("hot");
    expect(text).toContain("src/a.ts:10");
    expect(text).toContain("Hottest files");
    expect(text).not.toContain("threshold  max");
  });

  it("appends the catalog threshold and violators for the metric", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      title: "Cyclomatic complexity",
      metric: "cyclomatic-complexity",
    });
    expect(text).toContain("threshold  max 20");
    expect(text).toContain("1 of 3 functions above 20");
  });

  it("computes catalog violators on the full report, not the listing slice", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      metric: "cyclomatic-complexity",
      min: 30,
    });
    expect(text).toContain("No functions match.");
    expect(text).toContain("1 of 3 functions above 20");
    expect(text).toContain("hot");
  });

  it("prints cognitive bands on a cognitive view", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      title: "Cognitive complexity",
      scale: COGNITIVE_SCALE,
    });
    expect(text).toContain("0-10");
    expect(text).toContain("11-15");
    expect(text).not.toContain("21-50");
  });

  it("prints Halstead volume/difficulty/effort columns and sorts by effort", () => {
    const halsteadReport: ComplexityReport = {
      units: [
        unit("src/a.ts", "wide", 80, 1, { difficulty: 2, effort: 160 }),
        unit("src/a.ts", "dense", 40, 2, { difficulty: 10, effort: 400 }),
      ],
      files: [{ path: "src/a.ts", functionCount: 2, minComplexity: 40, maxComplexity: 80, sumComplexity: 120 }],
      unparsed: [],
    };
    const text = formatComplexityView(halsteadReport, {
      root: "/r",
      at,
      color: false,
      title: "Halstead",
      scale: HALSTEAD_VOLUME_SCALE,
    });
    expect(text).toContain("Halstead");
    expect(text).toContain("volume");
    expect(text).toContain("difficulty");
    expect(text).toContain("effort");
    expect(text).toContain("1-20");
    expect(text).toContain("1001+");
    expect(text).not.toContain("21-50");
    const denseAt = text.indexOf("dense");
    const wideAt = text.indexOf("wide");
    expect(denseAt).toBeGreaterThan(-1);
    expect(wideAt).toBeGreaterThan(denseAt);
  });

  it("is ANSI-free without color and colored with it", () => {
    const plain = formatComplexityView(report, { root: "/r", at, color: false });
    expect(plain).not.toContain("\x1b[");
    const colored = formatComplexityView(report, { root: "/r", at, color: true });
    expect(colored).toContain("\x1b[");
  });

  it("respects --top and notes omitted units and files", () => {
    const text = formatComplexityView(report, { root: "/r", at, color: false, top: 1 });
    expect(text).toContain("hot");
    expect(text).not.toContain("warm");
    expect(text).not.toContain("cold");
    expect(text).toContain("…and 2 more");
    expect(text).toContain("…and 1 more");
  });

  it("counts omitted units after --min, not the unfiltered report", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      min: 11,
      top: 1,
    });
    expect(text).toContain("hot");
    expect(text).not.toContain("warm");
    expect(text).not.toContain("cold");
    expect(text).toContain("…and 1 more");
    expect(text).not.toContain("…and 2 more");
  });

  it("respects --min", () => {
    const text = formatComplexityView(report, { root: "/r", at, color: false, min: 11 });
    expect(text).toContain("hot");
    expect(text).toContain("warm");
    expect(text).not.toContain("cold");
  });

  it("drills into a single file", () => {
    const text = formatComplexityView(report, {
      root: "/r",
      at,
      color: false,
      file: "src/a.ts",
    });
    expect(text).toContain("src/a.ts");
    expect(text).toContain("hot");
    expect(text).not.toContain("cold");
    expect(text).not.toContain("Hottest files");
  });

  it("fails clearly for a file that is not in the report", () => {
    expect(() =>
      formatComplexityView(report, { root: "/r", at, color: false, file: "src/zzz.ts" }),
    ).toThrow(/File not found in report: src\/zzz\.ts/);
  });

  it("reports an empty checkout", () => {
    const text = formatComplexityView(
      { units: [], files: [], unparsed: [] },
      { root: "/r", at, color: false },
    );
    expect(text).toContain("No TypeScript or JavaScript functions found.");
  });
});

describe("selectComplexity and summaryOf", () => {
  it("bounds units and files by top", () => {
    const selected = selectComplexity(report, { top: 1 });
    expect(selected.selection).toEqual({ kind: "overview" });
    expect(selected.units).toHaveLength(1);
    expect(selected.files).toHaveLength(1);
    expect(selected.omittedUnits).toBe(2);
    expect(selected.omittedFiles).toBe(1);
    expect(selected.units[0]!.name).toBe("hot");
  });

  it("computes summary stats over the whole checkout", () => {
    const summary = summaryOf(report);
    expect(summary).toMatchObject({
      files: 2,
      functions: 3,
      min: 3,
      max: 25,
      mean: 13.33,
      median: 12,
    });
    expect(summary.bands).toEqual({ "1-10": 1, "11-20": 1, "21-50": 1, "51+": 0 });
  });

  it("rounds an even-length median to two decimals", () => {
    expect(
      summaryOf({
        units: [unit("src/a.ts", "a", 19.65), unit("src/b.ts", "b", 309.07)],
        files: [],
        unparsed: [],
      }).median,
    ).toBe(164.36);
  });

  it("puts cyclomatic 50 in 21-50 and 51 in 51+", () => {
    expect(
      summaryOf({
        units: [unit("src/a.ts", "edge", 50)],
        files: [],
        unparsed: [],
      }).bands,
    ).toEqual({ "1-10": 0, "11-20": 0, "21-50": 1, "51+": 0 });
    expect(
      summaryOf({
        units: [unit("src/a.ts", "hot", 51)],
        files: [],
        unparsed: [],
      }).bands,
    ).toEqual({ "1-10": 0, "11-20": 0, "21-50": 0, "51+": 1 });
  });

  it("bands cognitive scores on the Sonar 15 / 25 anchors", () => {
    const scores = [0, 10, 11, 15, 16, 25, 26].map((n, i) =>
      unit("src/a.ts", `fn${i}`, n),
    );
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, COGNITIVE_SCALE).bands,
    ).toEqual({ "0-10": 2, "11-15": 2, "16-25": 2, "26+": 1 });
  });

  it("bands Halstead volume on the Verifysoft 20 / 1000 anchors", () => {
    const scores = [1, 20, 21, 100, 101, 1000, 1001].map((n, i) =>
      unit("src/a.ts", `fn${i}`, n),
    );
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, HALSTEAD_VOLUME_SCALE).bands,
    ).toEqual({ "1-20": 2, "21-100": 2, "101-1000": 2, "1001+": 1 });
  });

  it("bands nesting depth on the Sonar 3 / ESLint 4 anchors", () => {
    const scores = [0, 1, 2, 3, 4, 5, 6].map((n, i) => unit("src/a.ts", `fn${i}`, n));
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, NESTING_SCALE).bands,
    ).toEqual({ "0-1": 2, "2-3": 2, "4-5": 2, "6+": 1 });
  });

  it("bands Maintainability Index on the VS 20/10 ratings with a scaled-SEI 50 split", () => {
    const scores = [0, 9, 10, 19, 20, 49, 50, 100].map((n, i) =>
      unit("src/a.ts", `fn${i}`, n),
    );
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, MAINTAINABILITY_SCALE).bands,
    ).toEqual({ "0-9": 2, "10-19": 2, "20-49": 2, "50-100": 2 });
  });

  it("bands coverage on Istanbul 80/50 watermarks", () => {
    const scores = [0, 19, 20, 49, 50, 79, 80, 100].map((n, i) =>
      unit("src/a.ts", `fn${i}`, n),
    );
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, COVERAGE_SCALE).bands,
    ).toEqual({ "0-19": 2, "20-49": 2, "50-79": 2, "80-100": 2 });
  });

  it("bands CRAP on the factory 8 / Crap4j 30 anchors", () => {
    const scores = [1, 8, 9, 15, 16, 30, 31].map((n, i) => unit("src/a.ts", `fn${i}`, n));
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, CRAP_SCALE).bands,
    ).toEqual({ "1-8": 2, "9-15": 2, "16-30": 2, "31+": 1 });
  });

  it("bands cycle SCC size as 0 / 2-3 / 4-10 / 11+", () => {
    const scores = [0, 2, 3, 4, 10, 11].map((n, i) => unit("src/a.ts", `fn${i}`, n));
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, CYCLES_SCALE).bands,
    ).toEqual({ "0": 1, "2-3": 2, "4-10": 2, "11+": 1 });
  });

  it("bands coupling Ce as 0-5 / 6-10 / 11-20 / 21+", () => {
    const scores = [0, 5, 6, 10, 11, 20, 21].map((n, i) => unit("src/a.ts", `fn${i}`, n));
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, COUPLING_SCALE).bands,
    ).toEqual({ "0-5": 2, "6-10": 2, "11-20": 2, "21+": 1 });
  });

  it("bands encapsulation leaks as 0 / 1 / 2-4 / 5+", () => {
    const scores = [0, 1, 2, 4, 5].map((n, i) => unit("src/a.ts", `fn${i}`, n));
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, ENCAPSULATION_SCALE).bands,
    ).toEqual({ "0": 1, "1": 1, "2-4": 2, "5+": 1 });
  });

  it("bands propagation visibility on 20/40/60 splits", () => {
    const scores = [0, 20, 21, 40, 41, 60, 61, 100].map((n, i) =>
      unit("src/a.ts", `fn${i}`, n),
    );
    expect(
      summaryOf({ units: scores, files: [], unparsed: [] }, PROPAGATION_SCALE).bands,
    ).toEqual({ "0-20": 2, "21-40": 2, "41-60": 2, "61+": 2 });
  });

  it("sorts higher-better units lowest-index first", () => {
    const miReport: ComplexityReport = {
      units: [
        unit("src/a.ts", "healthy", 90, 1, { volume: 12, cyclomatic: 1, loc: 1 }),
        unit("src/a.ts", "frail", 40, 2, { volume: 80, cyclomatic: 6, loc: 20 }),
      ],
      files: [
        {
          path: "src/a.ts",
          functionCount: 2,
          minComplexity: 40,
          maxComplexity: 90,
          sumComplexity: 130,
        },
      ],
      unparsed: [],
    };
    const selected = selectComplexity(miReport, {
      top: 10,
      scale: MAINTAINABILITY_SCALE,
      direction: "higher-better",
    });
    expect(selected.units.map((entry) => entry.name)).toEqual(["frail", "healthy"]);
    const text = formatComplexityView(miReport, {
      root: "/r",
      at,
      color: false,
      title: "Maintainability index",
      scale: MAINTAINABILITY_SCALE,
      direction: "higher-better",
    });
    expect(text).toContain("index");
    expect(text).toContain("volume");
    expect(text).toContain("cyclomatic");
    expect(text).toContain("loc");
    expect(text).toContain("50-100");
    expect(text).toContain("0-9");
    expect(text.indexOf("frail")).toBeLessThan(text.indexOf("healthy"));
  });

  it("prints CRAP columns for cyclomatic and coverage beside the score", () => {
    const crapReport: ComplexityReport = {
      units: [
        unit("src/a.ts", "risky", 30, 1, { cyclomatic: 5, coverage: 0 }),
        unit("src/a.ts", "safe", 1, 2, { cyclomatic: 1, coverage: 100 }),
      ],
      files: [
        {
          path: "src/a.ts",
          functionCount: 2,
          minComplexity: 1,
          maxComplexity: 30,
          sumComplexity: 31,
        },
      ],
      unparsed: [],
    };
    const text = formatComplexityView(crapReport, {
      root: "/r",
      at,
      color: false,
      title: "CRAP",
      scale: CRAP_SCALE,
      direction: "higher-worse",
    });
    expect(text).toContain("crap");
    expect(text).toContain("cyclomatic");
    expect(text).toContain("coverage");
    expect(text).toContain("1-8");
    expect(text).toContain("31+");
    expect(text.indexOf("risky")).toBeLessThan(text.indexOf("safe"));
  });

  it("prints coupling Ce/Ca/I columns under a Files heading", () => {
    const couplingReport: ComplexityReport = {
      units: [
        {
          path: "src/a.ts",
          name: "src/a.ts",
          kind: "file",
          startLine: 1,
          endLine: 10,
          complexity: 2,
          ca: 0,
          ce: 2,
          instability: 1,
        },
        {
          path: "src/b.ts",
          name: "src/b.ts",
          kind: "file",
          startLine: 1,
          endLine: 4,
          complexity: 0,
          ca: 1,
          ce: 0,
          instability: 0,
        },
      ],
      files: [
        { path: "src/a.ts", functionCount: 1, minComplexity: 2, maxComplexity: 2, sumComplexity: 2 },
        { path: "src/b.ts", functionCount: 1, minComplexity: 0, maxComplexity: 0, sumComplexity: 0 },
      ],
      unparsed: [],
    };
    const text = formatComplexityView(couplingReport, {
      root: "/r",
      at,
      color: false,
      title: "Coupling",
      scale: COUPLING_SCALE,
    });
    expect(text).toContain("ce");
    expect(text).toContain("ca");
    expect(text).toContain("I");
    expect(text).toContain("Files");
    expect(text).not.toContain("Functions");
    expect(text.indexOf("src/a.ts")).toBeLessThan(text.indexOf("src/b.ts:1"));
  });
});

describe("formatComplexityDiff", () => {
  it("prints changed units with before and after", () => {
    const text = formatComplexityDiff(
      {
        added: [{ path: "src/b.ts", name: "new", startLine: 1, complexity: 2 }],
        removed: [{ path: "src/c.ts", name: "gone", complexity: 4 }],
        changed: [
          { path: "src/a.ts", name: "hot", startLine: 10, before: 20, after: 25, delta: 5 },
        ],
        totalDelta: 5,
      },
      { color: false },
    );
    expect(text).toContain("+5");
    expect(text).toContain("20 → 25");
    expect(text).toContain("new");
    expect(text).toContain("gone");
  });

  it("says so when nothing changed", () => {
    const text = formatComplexityDiff(
      { added: [], removed: [], changed: [], totalDelta: 0 },
      { color: false },
    );
    expect(text).toContain("No changes.");
  });
});

describe("formatCheck", () => {
  it("lists only violations above the threshold", () => {
    const { text, violations } = formatCheck(report, {
      gate: "max",
      threshold: 10,
      color: false,
    });
    expect(violations.map((v) => v.name)).toEqual(["hot", "warm"]);
    expect(text).toContain("threshold  max 10");
    expect(text).toContain("2 of 3 functions above 10");
    expect(text).not.toContain("cold");
  });

  it("reports zero violations", () => {
    const { text, violations } = formatCheck(report, {
      gate: "max",
      threshold: 25,
      color: false,
    });
    expect(violations).toEqual([]);
    expect(text).toContain("0 of 3 functions above 25");
  });

  it("lists only violations below a higher-better floor", () => {
    const miReport: ComplexityReport = {
      units: [
        unit("src/a.ts", "healthy", 90),
        unit("src/a.ts", "frail", 15),
        unit("src/b.ts", "ok", 40),
      ],
      files: [],
      unparsed: [],
    };
    const { text, violations } = formatCheck(miReport, {
      gate: "min",
      threshold: 20,
      color: false,
      direction: "higher-better",
      scale: MAINTAINABILITY_SCALE,
    });
    expect(violations.map((entry) => entry.name)).toEqual(["frail"]);
    expect(text).toContain("1 of 3 functions below 20");
    expect(text).toContain("threshold  min 20");
    expect(text).not.toContain("healthy");
  });
});

describe("formatRunAllDashboard", () => {
  it("orders columns as metric, status, errors, stats, threshold, threshold violations", () => {
    const text = formatRunAllDashboard(
      "/repo",
      [
        {
          id: "cyclomatic-complexity",
          name: "Cyclomatic complexity",
          status: "pass",
          violationCount: 1,
          summary: { functions: 2, files: 2, min: 1, mean: 13.5, median: 13.5, max: 26 },
          error: null,
          threshold: "<=20",
        },
        {
          id: "test-coverage",
          name: "Test coverage",
          status: "error",
          violationCount: 0,
          summary: { functions: 0, files: 0, min: null, mean: null, median: null, max: null },
          error: "spawn npm ENOENT",
          threshold: ">=50",
        },
      ],
      { passed: 1, failed: 0, errors: 1 },
    );
    const header = text.split("\n").find((line) => line.startsWith("metric"));
    expect(header?.replace(/\s+/g, " ")).toBe(
      "metric status errors functions files min mean median max threshold threshold violations",
    );
    expect(text).not.toContain("worst");
    expect(text).toContain("<=20");
    expect(text).toContain(">=50");
    expect(text).toContain("spawn npm ENOENT");
    expect(text).toMatch(/cyclomatic-complexity\s+pass\s+-/);
    expect(text).toContain("passed 1  failed 0  errors 1");
  });

  it("dashes the whole stats block for an errored metric row", () => {
    const text = formatRunAllDashboard(
      "/repo",
      [
        {
          id: "crap",
          name: "CRAP",
          status: "error",
          violationCount: 0,
          summary: emptySummary(),
          error: "coverage missing",
          threshold: "<=30",
        },
      ],
      { passed: 0, failed: 0, errors: 1 },
    );
    expect(text).toMatch(/crap\s+error\s+coverage missing\s+-\s+-\s+-\s+-\s+-\s+-\s+<=30\s+-/);
  });
});

describe("batchSummary and emptySummary", () => {
  it("maps the scaled summary stats for a metric and drops band detail", () => {
    expect(batchSummary("cyclomatic-complexity", report)).toEqual({
      functions: 3,
      files: 2,
      min: 3,
      mean: 13.33,
      median: 12,
      max: 25,
    });
  });

  it("summarizes an empty report with nulls instead of zeros", () => {
    expect(batchSummary("cycles", { units: [], files: [], unparsed: [] })).toEqual({
      functions: 0,
      files: 0,
      min: null,
      mean: null,
      median: null,
      max: null,
    });
    expect(emptySummary()).toEqual(batchSummary("cycles", { units: [], files: [], unparsed: [] }));
  });
});

describe("thresholdViolationCount", () => {
  it("counts functions above the catalog ceiling for a higher-worse metric", () => {
    expect(thresholdViolationCount("cyclomatic-complexity", report, "higher-worse")).toBe(1);
  });

  it("counts functions below the floor for a higher-better metric", () => {
    const miReport: ComplexityReport = {
      units: [unit("src/a.ts", "healthy", 90), unit("src/a.ts", "frail", 15)],
      files: [],
      unparsed: [],
    };
    expect(thresholdViolationCount("maintainability-index", miReport, "higher-better")).toBe(1);
  });

  it("counts zero when every function meets the gate", () => {
    const calmReport: ComplexityReport = {
      units: [unit("src/a.ts", "calm", 5)],
      files: [],
      unparsed: [],
    };
    expect(thresholdViolationCount("cyclomatic-complexity", calmReport, "higher-worse")).toBe(0);
  });
});

describe("formatThresholdLabel", () => {
  it("prints a <= label for max gates and >= for min gates", () => {
    expect(formatThresholdLabel({ gate: "max", threshold: 20 })).toBe("<=20");
    expect(formatThresholdLabel({ gate: "min", threshold: 50 })).toBe(">=50");
  });
});

describe("formatMetricList", () => {
  it("lists ids, names, and status", () => {
    const text = formatMetricList([
      { id: "cyclomatic-complexity", name: "Cyclomatic complexity", status: "missing" },
    ]);
    expect(text).toContain("cyclomatic-complexity");
    expect(text).toContain("Cyclomatic complexity");
    expect(text).toContain("missing");
    expect(text).toContain("status");
  });

  it("formats a status rollup", () => {
    expect(formatStatusRollup({ upToDate: 3, outdated: 2, missing: 4 })).toBe(
      "3 up-to-date, 2 outdated, 4 missing",
    );
  });
});
