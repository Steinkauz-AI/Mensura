import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COVERAGE_LINES_A,
  COVERAGE_LINES_B_FULL,
  COVERAGE_LINES_B_PARTIAL,
  expectCompletionFlags,
  expectHelpBasics,
  expectListedMetrics,
  expectMinCheckSlice,
  NO_ANSI,
} from "./contract-helpers.js";



const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "mensura.mjs");

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkout(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mensura-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source, "utf8");
  }
  return root;
}

async function writeCoverageMap(
  root: string,
  files: Record<string, Array<{ line: number; hits: number }>>,
): Promise<void> {
  const report: Record<string, unknown> = {};
  for (const [rel, statements] of Object.entries(files)) {
    const abs = join(root, rel);
    const statementMap: Record<string, { start: { line: number; column: number }; end: { line: number; column: number } }> =
      {};
    const s: Record<string, number> = {};
    statements.forEach((statement, index) => {
      statementMap[String(index)] = {
        start: { line: statement.line, column: 0 },
        end: { line: statement.line, column: 8 },
      };
      s[String(index)] = statement.hits;
    });
    report[abs] = { path: abs, statementMap, s, fnMap: {}, f: {}, branchMap: {}, b: {} };
  }
  const artifact = join(root, "coverage", "coverage-final.json");
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(artifact, `${JSON.stringify(report)}\n`);
}

type RunResult = { code: number; stdout: string; stderr: string };

function mensura(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) =>
      resolvePromise({ code: code ?? -1, stdout, stderr }),
    );
  });
}

const METRIC = "cyclomatic-complexity";

type SavedSnapshotFile = {
  timestamp: string;
  report: {
    units: Array<{
      name: string;
      complexity: number;
      difficulty?: number;
      effort?: number;
      volume?: number;
      cyclomatic?: number;
      loc?: number;
      coverage?: number;
    }>;
  };
};

async function latestSnapshot(root: string, metric = METRIC): Promise<SavedSnapshotFile> {
  const manifest = JSON.parse(await readFile(manifestPath(root, metric), "utf8")) as Array<{
    file: string;
  }>;
  const path = join(root, ".mensura", "metrics", metric, manifest[0]!.file);
  return JSON.parse(await readFile(path, "utf8")) as SavedSnapshotFile;
}

const FIXTURE: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "fixture",
    scripts: { "test:coverage": "node .mensura/write-coverage.mjs" },
  }),
  ".mensura/write-coverage.mjs": [
    "import { readFileSync, writeFileSync, existsSync } from \"node:fs\";",
    "let count = 0;",
    "if (existsSync(\"coverage-ran\")) count = Number(readFileSync(\"coverage-ran\", \"utf8\")) || 0;",
    "writeFileSync(\"coverage-ran\", String(count + 1));",
  ].join("\n"),
  "src/a.ts": "export function simple() {\n  return 1;\n}\n",
  "src/b.ts": [
    "export function branchy(a: boolean, b: boolean, c: number) {",
    "  let n = 0;",
    "  if (a) {",
    "    n += 1;",
    "  } else if (b) {",
    "    n += 2;",
    "  }",
    "  for (let i = 0; i < c; i++) {",
    "    n += i;",
    "  }",
    "  if (n > 3 && a) {",
    "    n += 10;",
    "  }",
    "  return n;",
    "}",
  ].join("\n") + "\n",
};

const DEEP_TS = [
  "export function deep() {",
  "  if (1) {",
  "    if (2) {",
  "      if (3) {",
  "        if (4) {",
  "          return 1;",
  "        }",
  "      }",
  "    }",
  "  }",
  "}",
].join("\n");

function manifestPath(root: string, metric = METRIC): string {
  return join(root, ".mensura", "metrics", metric, "manifest.json");
}

async function seedFixtureCoverage(root: string, partialB = false): Promise<void> {
  await writeCoverageMap(root, {
    "src/a.ts": COVERAGE_LINES_A,
    "src/b.ts": partialB ? COVERAGE_LINES_B_PARTIAL : COVERAGE_LINES_B_FULL,
  });
}

describe("mensura agent contract — core", () => {
  it("list names every registered metric without ANSI", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["list"], root);
    expect(run.code).toBe(0);
    expectListedMetrics(run.stdout);
    expect(NO_ANSI.test(run.stdout)).toBe(false);
  });

  it("rejects --json; the snapshot on disk is the machine document", async () => {
    const root = await checkout(FIXTURE);
    const listed = await mensura(["list", "--json"], root);
    expect(listed.code).toBe(1);
    expect(listed.stderr).toMatch(/Unknown flag "--json"/);
    expect(listed.stdout).toBe("");
  });

  it("metric: plain overview is ANSI-free and bounded", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", METRIC, "--no-save"], root);
    expect(run.code).toBe(0);
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    expect(run.stdout).toContain("Cyclomatic complexity");
    expect(run.stdout).toContain("branchy");
    expect(run.stdout).toContain("threshold  max 20");
    expect(run.stdout.split("\n").length).toBeLessThanOrEqual(60);
    expect(run.stderr).not.toContain("saved");
  });

  it("metric: snapshot on disk holds the full report", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", METRIC], root);
    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/saved /);
    const snapshot = await latestSnapshot(root);
    expect(snapshot.report.units).toHaveLength(2);
    expect(Math.max(...snapshot.report.units.map((unit) => unit.complexity))).toBe(6);
  });

  it("metric: saves a snapshot by default and show reads it", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", METRIC], root);
    expect(run.code).toBe(0);
    expect(run.stderr).toMatch(/saved /);
    const manifest = JSON.parse(await readFile(manifestPath(root), "utf8")) as Array<{
      file: string;
      timestamp: string;
    }>;
    expect(manifest).toHaveLength(1);
    const shown = await mensura(["snapshot", "show", METRIC, "latest"], root);
    expect(shown.code).toBe(0);
    expect(shown.stdout).toContain(manifest[0]!.timestamp);
    expect(shown.stdout).toContain("branchy");
    expect(shown.stdout).toContain("threshold  max 20");
  });

  it("metric: reuses the latest snapshot when the checkout has not changed", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", METRIC], root)).code).toBe(0);
    const second = await mensura(["run", METRIC], root);
    expect(second.code).toBe(0);
    expect(second.stderr).toMatch(/reused /);
    expect(second.stderr).not.toMatch(/saved /);
    const manifest = JSON.parse(await readFile(manifestPath(root), "utf8")) as unknown[];
    expect(manifest).toHaveLength(1);
  });

  it("list: marks a saved metric up-to-date and others missing", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", METRIC], root)).code).toBe(0);
    const listed = await mensura(["list"], root);
    expect(listed.code).toBe(0);
    expect(listed.stdout).toMatch(/cyclomatic-complexity\s+Cyclomatic complexity\s+up-to-date/);
    expect(listed.stdout).toContain("missing");
    expect(listed.stdout).not.toContain("outdated");
  });

  it("show: labels a snapshot that is outdated", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", METRIC], root)).code).toBe(0);
    await writeFile(join(root, "src", "a.ts"), "export function simple() { return 2; }\n");
    const shown = await mensura(["snapshot", "show", METRIC, "latest"], root);
    expect(shown.code).toBe(0);
    expect(shown.stdout.startsWith("outdated\n")).toBe(true);
    expect(shown.stdout).toContain("branchy");
  });

  it("check: persists a snapshot so a later check can reuse", async () => {
    const root = await checkout(FIXTURE);
    const first = await mensura(["run", METRIC, "--check"], root);
    expect(first.code).toBe(0);
    expect(first.stderr).toMatch(/saved /);
    const manifest = JSON.parse(await readFile(manifestPath(root), "utf8")) as unknown[];
    expect(manifest).toHaveLength(1);
    const second = await mensura(["run", METRIC, "--check"], root);
    expect(second.code).toBe(0);
    expect(second.stderr).toMatch(/reused /);
  });

  it("run crap: piggybacks test-coverage from one test:coverage run", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "crap"], root);
    expect(run.code).toBe(0);
    expect(await readFile(join(root, "coverage-ran"), "utf8")).toBe("1");
    expect(JSON.parse(await readFile(manifestPath(root, "crap"), "utf8"))).toHaveLength(1);
    expect(JSON.parse(await readFile(manifestPath(root, "test-coverage"), "utf8"))).toHaveLength(1);
    expect(run.stderr).toMatch(/saved /);
  });

  it("run crap: marks crap and test-coverage up-to-date after piggyback", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    expect((await mensura(["run", "crap"], root)).code).toBe(0);
    const listed = await mensura(["list"], root);
    expect(listed.stdout).toMatch(/crap\s+CRAP\s+up-to-date/);
    expect(listed.stdout).toMatch(/test-coverage\s+Test coverage\s+up-to-date/);
  });

  it("diff: reports the delta between previous and latest", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", METRIC], root)).code).toBe(0);
    await writeFile(
      join(root, "src", "b.ts"),
      FIXTURE["src/b.ts"]!.replace(
        "  return n;",
        "  if (n < 0) {\n    n = 0;\n  }\n  return n;",
      ),
      "utf8",
    );
    expect((await mensura(["run", METRIC], root)).code).toBe(0);

    const plainRun = await mensura(["snapshot", "diff", METRIC], root);
    expect(plainRun.code).toBe(0);
    expect(NO_ANSI.test(plainRun.stdout)).toBe(false);
    expect(plainRun.stdout).toContain("branchy");
    expect(plainRun.stdout).toContain("6 → 7");
    expect(plainRun.stdout).toContain("outdated");
  });

  it("run and run --check share stdout for cyclomatic-complexity", async () => {
    const root = await checkout(FIXTURE);
    const measuring = await mensura(["run", METRIC], root);
    const checking = await mensura(["run", METRIC, "--check"], root);
    expect(measuring.code).toBe(0);
    expect(checking.code).toBe(0);
    expect(checking.stdout).toBe(measuring.stdout);
    expect(measuring.stdout).toContain("threshold  max 20");
  });

  it("run --check changes only the exit code when nesting-depth fails", async () => {
    const deep = await checkout({ ...FIXTURE, "src/deep.ts": DEEP_TS });
    const nesting = await mensura(["run", "nesting-depth"], deep);
    const nestingCheck = await mensura(["run", "nesting-depth", "--check"], deep);
    expect(nesting.code).toBe(0);
    expect(nestingCheck.code).toBe(2);
    expect(nestingCheck.stdout).toBe(nesting.stdout);
    expect(nesting.stdout).toContain("threshold  max 3");
    expect(nesting.stdout).toContain("deep");
    expect(NO_ANSI.test(nesting.stdout)).toBe(false);
  });

  it("legacy aliases are unknown commands", async () => {
    const root = await checkout(FIXTURE);
    const metric = await mensura(["metric", METRIC], root);
    expect(metric.code).toBe(1);
    expect(metric.stderr).toMatch(/Unknown command "metric"/);

    const check = await mensura(["check", METRIC], root);
    expect(check.code).toBe(1);
    expect(check.stderr).toMatch(/Unknown command "check"/);

    const show = await mensura(["show", METRIC, "latest"], root);
    expect(show.code).toBe(1);
    expect(show.stderr).toMatch(/Unknown command "show"/);

    const diff = await mensura(["diff", METRIC], root);
    expect(diff.code).toBe(1);
    expect(diff.stderr).toMatch(/Unknown command "diff"/);
  });

  it("bare invocation prints help, not a metric listing", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura([], root);
    const help = await mensura(["--help"], root);
    expect(run.code).toBe(0);
    expect(help.code).toBe(0);
    expect(run.stdout).toBe(help.stdout);
    expectHelpBasics(run.stdout);
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    expect(run.stderr).not.toMatch(/saved /);
  });

  it("mensura -i piped exits 1 and does not hang", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["-i"], root);
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/TTY/);
    expect(run.stdout).toBe("");
  });
});

describe("mensura agent contract — metrics", () => {
  it("metric cognitive-complexity: plain overview names the metric", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", "cognitive-complexity", "--no-save"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Cognitive complexity");
    expect(NO_ANSI.test(run.stdout)).toBe(false);
  });

  it("metric halstead: prints volume, difficulty, effort and volume bands", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", "halstead"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Halstead");
    expect(run.stdout).toContain("volume");
    expect(run.stdout).toContain("difficulty");
    expect(run.stdout).toContain("effort");
    expect(run.stdout).toContain("1-20");
    expect(NO_ANSI.test(run.stdout)).toBe(false);

    const snapshot = await latestSnapshot(root, "halstead");
    const branchy = snapshot.report.units.find((unit) => unit.name === "branchy");
    expect(branchy?.difficulty).toBeTypeOf("number");
    expect(branchy?.effort).toBeTypeOf("number");
    expect(branchy?.complexity).toBeGreaterThan(0);
  });

  it("metric nesting-depth: plain overview names the metric and nesting bands", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", "nesting-depth", "--no-save"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Nesting depth");
    expect(run.stdout).toContain("0-1");
    expect(run.stdout).toContain("6+");
    expect(NO_ANSI.test(run.stdout)).toBe(false);
  });

  it("metric maintainability-index: prints index columns and VS bands", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", "maintainability-index"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Maintainability index");
    expect(run.stdout).toContain("index");
    expect(run.stdout).toContain("volume");
    expect(run.stdout).toContain("cyclomatic");
    expect(run.stdout).toContain("loc");
    expect(run.stdout).toContain("50-100");
    expect(run.stdout).toContain("0-9");
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    const branchyAt = run.stdout.indexOf("branchy");
    const simpleAt = run.stdout.indexOf("simple");
    expect(branchyAt).toBeGreaterThan(-1);
    expect(simpleAt).toBeGreaterThan(branchyAt);
  });

  it("metric maintainability-index: snapshot holds per-function fields", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", "maintainability-index"], root)).code).toBe(0);
    const branchy = (await latestSnapshot(root, "maintainability-index")).report.units.find(
      (unit) => unit.name === "branchy",
    );
    expect(branchy?.volume).toBeTypeOf("number");
    expect(branchy?.cyclomatic).toBeTypeOf("number");
    expect(branchy?.loc).toBeTypeOf("number");
    expect(branchy?.complexity).toBeGreaterThan(0);
    expect(branchy?.complexity).toBeLessThanOrEqual(100);
  });

  it("metric maintainability-index: --check uses catalog min 20", async () => {
    const root = await checkout(FIXTURE);
    expect((await mensura(["run", "maintainability-index"], root)).code).toBe(0);
    await expectMinCheckSlice(mensura, root, "maintainability-index", 20, 100);
  });

  it("metric test-coverage: errors without coverage-final.json", async () => {
    const missing = await mensura(["run", "test-coverage", "--no-save"], await checkout(FIXTURE));
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/coverage-final\.json/);
  });

  it("metric test-coverage: errors without test:coverage script", async () => {
    const noScript = await mensura(
      ["run", "test-coverage", "--no-save"],
      await checkout({ "src/a.ts": "export function simple() { return 1; }\n" }),
    );
    expect(noScript.code).toBe(1);
    expect(noScript.stderr).toMatch(/test:coverage/);
  });

  it("metric test-coverage: ingests coverage-final.json", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root, true);
    const run = await mensura(["run", "test-coverage"], root);
    expect(run.code).toBe(0);
    expect(await readFile(join(root, "coverage-ran"), "utf8")).toBe("1");
    expect(run.stdout).toContain("Test coverage");
    expect(run.stdout).toContain("80-100");
    expect(run.stdout).toContain("0-19");
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    const snapshot = await latestSnapshot(root, "test-coverage");
    expect(snapshot.report.units.find((unit) => unit.name === "simple")?.complexity).toBe(100);
  });

  it("metric test-coverage: --check uses catalog min 50", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root, true);
    expect((await mensura(["run", "test-coverage"], root)).code).toBe(0);
    await expectMinCheckSlice(mensura, root, "test-coverage", 50, 100);
  });

  it("metric crap: errors without coverage-final.json", async () => {
    const missing = await mensura(["run", "crap", "--no-save"], await checkout(FIXTURE));
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/coverage-final\.json/);
  });

  it("metric crap: joins cyclomatic and coverage columns", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "crap"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("CRAP");
    expect(run.stdout).toContain("cyclomatic");
    expect(run.stdout).toContain("coverage");
    expect(run.stdout).toContain("1-8");
    expect(run.stdout).toContain("31+");
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    const simple = (await latestSnapshot(root, "crap")).report.units.find(
      (unit) => unit.name === "simple",
    );
    expect(simple?.cyclomatic).toBe(1);
    expect(simple?.coverage).toBe(100);
    expect(simple?.complexity).toBe(1);
  });

  it("metric crap: --check uses catalog max 30", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    expect((await mensura(["run", "crap"], root)).code).toBe(0);
    const passing = await mensura(["run", "crap", "--check"], root);
    expect(passing.code).toBe(0);
    expect(passing.stdout).toContain("threshold  max 30");
  });

  it("errors: unknown metric, missing snapshots, missing ref", async () => {
    const root = await checkout(FIXTURE);
    const unknown = await mensura(["run", "nope", "somewhere"], root);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toMatch(/Unknown metric "nope"/);

    const noSnapshots = await mensura(["snapshot", "diff", METRIC], root);
    expect(noSnapshots.code).toBe(1);
    expect(noSnapshots.stderr).toMatch(/No snapshot "previous"/);

    const noRef = await mensura(["snapshot", "show"], root);
    expect(noRef.code).toBe(1);
    expect(noRef.stderr).toMatch(/needs a metric id and a snapshot ref/);
  });
});

describe("mensura agent contract — run all", () => {
  it("run --all: plain dashboard lists every metric without ANSI", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "--all", "--no-save"], root);
    expect(run.code).toBe(0);
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    expect(run.stdout).toContain("Metric summary");
    expect(run.stdout).toContain("cyclomatic-complexity");
    expect(run.stdout).toContain("test-coverage");
    expect(run.stdout).toContain("crap");
    expect(run.stdout).toContain("propagation-cost");
    expect(run.stdout.split("\n").length).toBeLessThanOrEqual(30);
  });

  it("run --all: dashboard lists stats, catalog threshold, and threshold violations", async () => {
    const { ensureBuiltinMetrics, listMetrics } = await import("../../src/index.js");
    await ensureBuiltinMetrics();
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "--all", "--no-save"], root);
    expect(run.code).toBe(0);
    const ids = listMetrics().map((metric) => metric.id);
    expect(ids).toHaveLength(11);
    for (const id of ids) expect(run.stdout).toContain(id);
    expect(run.stdout).toContain("pass");
    expect(run.stdout).toContain("threshold");
    expect(run.stdout).toContain("threshold violations");
    expect(run.stdout).toContain("<=20");
    expect(run.stdout).toContain(">=50");
    expect(run.stdout).not.toContain("branchy (6)");
    expect(run.stdout).toContain(`passed ${ids.length}  failed 0  errors 0`);
  });

  it("run --all --check: stdout matches measure when all pass", async () => {
    const { listMetrics } = await import("../../src/index.js");
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "--all", "--no-save"], root);
    const checked = await mensura(["run", "--all", "--check", "--no-save"], root);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toBe(run.stdout);
  });

  it("run --all --check: exit code 0 when all metrics pass", async () => {
    const { listMetrics } = await import("../../src/index.js");
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const passing = await mensura(["run", "--all", "--check", "--no-save"], root);
    expect(passing.code).toBe(0);
    expect(passing.stdout).toContain("pass");
    expect(passing.stdout).not.toMatch(/\bfail\b/);
    expect(passing.stdout).toContain(`passed ${listMetrics().length}  failed 0  errors 0`);
    const measuring = await mensura(["run", "--all", "--no-save"], root);
    expect(measuring.stdout).toBe(passing.stdout);
  });

  it("run --all --check: exit code 1 when coverage metrics error", async () => {
    const noCoverage = await checkout(FIXTURE);
    const failing = await mensura(["run", "--all", "--check", "--no-save"], noCoverage);
    expect(failing.code).toBe(1);
    expect(failing.stdout).toContain("error");
    expect(failing.stdout).toMatch(/errors [1-9]\d*/);
    const failingOverview = await mensura(["run", "--all", "--no-save"], noCoverage);
    expect(failingOverview.stdout).toBe(failing.stdout);
  });

  it("run --all: marks coverage metrics error without coverage file", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["run", "--all", "--no-save"], root);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/test-coverage\s+error/);
    expect(run.stdout).toMatch(/crap\s+error/);
    expect(run.stdout).toMatch(/cyclomatic-complexity\s+pass/);
    expect(run.stdout).toMatch(/coverage-final\.json/);
    expect(run.stdout).toContain("passed 9  failed 0  errors 2");
    const checkFail = await mensura(["run", "--all", "--check", "--no-save"], root);
    expect(checkFail.code).toBe(1);
    expect(checkFail.stdout).toBe(run.stdout);
  });

  it("run --all: runs test:coverage once when coverage is seeded", async () => {
    const withCoverage = await checkout(FIXTURE);
    await seedFixtureCoverage(withCoverage);
    expect((await mensura(["run", "--all", "--no-save"], withCoverage)).code).toBe(0);
    expect(await readFile(join(withCoverage, "coverage-ran"), "utf8")).toBe("1");
  });

  it("run --all --check: exits 2 when a metric fails its catalog threshold", async () => {
    const root = await checkout({ ...FIXTURE, "src/deep.ts": DEEP_TS });
    await seedFixtureCoverage(root);
    const measuring = await mensura(["run", "--all", "--no-save"], root);
    const run = await mensura(["run", "--all", "--check", "--no-save"], root);
    expect(measuring.code).toBe(0);
    expect(run.code).toBe(2);
    expect(run.stdout).toBe(measuring.stdout);
    expect(run.stdout).toContain("errors 0");
    expect(run.stdout).toMatch(/failed [1-9]\d*/);
    expect(run.stdout).toMatch(/nesting-depth\s+fail/);
  });

  it("run --all: saves a snapshot per metric by default", async () => {
    const root = await checkout(FIXTURE);
    await seedFixtureCoverage(root);
    const run = await mensura(["run", "--all"], root);
    expect(run.code).toBe(0);
    expect(run.stderr.match(/saved /g)?.length).toBeGreaterThanOrEqual(11);
    const manifest = JSON.parse(
      await readFile(join(root, ".mensura", "metrics", METRIC, "manifest.json"), "utf8"),
    ) as unknown[];
    expect(manifest).toHaveLength(1);
  });
});

describe("mensura agent contract — completion", () => {
  it("completion bash: prints a valid script to stdout with exit 0", async () => {
    const root = await checkout(FIXTURE);
    const run = await mensura(["completion", "bash"], root);
    expect(run.code).toBe(0);
    expect(run.stdout.length).toBeGreaterThan(0);
    expect(NO_ANSI.test(run.stdout)).toBe(false);
    const syntax = spawnSync("bash", ["-n"], { input: run.stdout, encoding: "utf8" });
    expect(syntax.status).toBe(0);
  });

  it("completion: includes metric ids, snapshot refs, subcommands, and flags", async () => {
    const { ensureBuiltinMetrics, listMetrics } = await import("../../src/index.js");
    await ensureBuiltinMetrics();
    const root = await checkout(FIXTURE);
    const run = await mensura(["completion", "bash"], root);
    expect(run.code).toBe(0);
    for (const metric of listMetrics()) expect(run.stdout).toContain(metric.id);
    expectCompletionFlags(run.stdout);
  });

  it("completion zsh and fish: print scripts to stdout with exit 0", async () => {
    const root = await checkout(FIXTURE);
    const zsh = await mensura(["completion", "zsh"], root);
    expect(zsh.code).toBe(0);
    expect(zsh.stdout).toContain("#compdef mensura");
    expect(zsh.stdout).toContain("cyclomatic-complexity");
    expect(zsh.stdout).toContain("latest");
    expect(NO_ANSI.test(zsh.stdout)).toBe(false);

    const fish = await mensura(["completion", "fish"], root);
    expect(fish.code).toBe(0);
    expect(fish.stdout).toContain("complete -c mensura");
    expect(fish.stdout).toContain("cyclomatic-complexity");
    expect(fish.stdout).toContain("previous");
    expect(NO_ANSI.test(fish.stdout)).toBe(false);
  });

  it("completion: unknown shell errors with a usage hint", async () => {
    const root = await checkout(FIXTURE);
    const unknown = await mensura(["completion", "powershell"], root);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toMatch(/Unknown shell "powershell"/);
    expect(unknown.stderr).toMatch(/bash, zsh, fish/);
    expect(unknown.stderr).toMatch(/Usage:/);

    const missing = await mensura(["completion"], root);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/Specify a shell/);
    expect(missing.stderr).toMatch(/Usage:/);
  });
});
