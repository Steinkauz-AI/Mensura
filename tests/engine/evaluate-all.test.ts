import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { evaluateAllMetrics } from "../../src/core/evaluate.js";
import { listMetrics } from "../../src/core/registry.js";
import { listSnapshots } from "../../src/core/snapshot.js";

const ensureMocks = vi.hoisted(() => ({ ensureTestCoverage: vi.fn() }));
vi.mock("../../src/metrics/test-coverage/ensure.js", () => ensureMocks);

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeEach(() => {
  ensureMocks.ensureTestCoverage.mockReset();
  ensureMocks.ensureTestCoverage.mockResolvedValue(undefined);
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evaluate-all-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

function epoch(): Date {
  return new Date(0);
}

function failedIds(outcomes: Awaited<ReturnType<typeof evaluateAllMetrics>>): string[] {
  return outcomes.filter((outcome) => "error" in outcome).map((outcome) => outcome.metric.id);
}

describe("evaluateAllMetrics", () => {
  it("scores every registered metric once against a fresh checkout", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      "coverage/coverage-final.json": "{}",
    });
    const outcomes = await evaluateAllMetrics(root, { now: epoch });
    const registered = listMetrics().map((entry) => entry.id);
    expect(outcomes.map((outcome) => outcome.metric.id)).toEqual(registered);
    expect(failedIds(outcomes)).toEqual([]);
    for (const outcome of outcomes) {
      if ("error" in outcome) continue;
      expect(outcome.result.reused, outcome.metric.id).toBe(false);
      expect(outcome.result.snapshot?.path, outcome.metric.id).toBeTruthy();
    }
    expect(ensureMocks.ensureTestCoverage).toHaveBeenCalledTimes(1);
  });

  it("reuses every current snapshot on the second run without re-preparing", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      "coverage/coverage-final.json": "{}",
    });
    const first = await evaluateAllMetrics(root, { now: epoch });
    expect(failedIds(first)).toEqual([]);

    const second = await evaluateAllMetrics(root, { now: epoch });
    expect(failedIds(second)).toEqual([]);
    for (const outcome of second) {
      if ("error" in outcome) continue;
      expect(outcome.result.reused, outcome.metric.id).toBe(true);
      expect(await listSnapshots({ root, metric: outcome.metric.id }), outcome.metric.id).toHaveLength(1);
    }
    expect(ensureMocks.ensureTestCoverage).toHaveBeenCalledTimes(1);
  });

  it("marks remaining coverage-backed metrics failed when the coverage script fails", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    ensureMocks.ensureTestCoverage.mockRejectedValueOnce(new Error("coverage runner exploded"));
    const outcomes = await evaluateAllMetrics(root, { now: epoch });
    expect(failedIds(outcomes).sort()).toEqual(["crap", "test-coverage"]);
    for (const outcome of outcomes) {
      if (!("error" in outcome)) continue;
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe("coverage runner exploded");
    }
    const cyclomatic = outcomes.find((outcome) => outcome.metric.id === "cyclomatic-complexity");
    expect(cyclomatic && !("error" in cyclomatic)).toBe(true);
    if (cyclomatic && !("error" in cyclomatic)) {
      expect(cyclomatic.result.snapshot?.path).toBeTruthy();
    }
    expect(ensureMocks.ensureTestCoverage).toHaveBeenCalledTimes(1);
  });

  it("wraps a non-Error coverage failure into an Error outcome", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    ensureMocks.ensureTestCoverage.mockRejectedValueOnce("coverage runner crashed");
    const outcomes = await evaluateAllMetrics(root, { now: epoch });
    const coverage = outcomes.find((outcome) => outcome.metric.id === "test-coverage");
    if (!coverage || !("error" in coverage)) {
      throw new Error("expected test-coverage to fail");
    }
    expect(coverage.error).toBeInstanceOf(Error);
    expect(coverage.error.message).toBe("coverage runner crashed");
    expect(failedIds(outcomes).sort()).toEqual(["crap", "test-coverage"]);
  });
});
