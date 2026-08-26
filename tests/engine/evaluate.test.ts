import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { evaluateMetric } from "../../src/core/evaluate.js";
import { listSnapshots } from "../../src/core/snapshot.js";
import type { AnyMetric } from "../../src/core/registry.js";
import type { ComplexityReport } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evaluate-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

const emptyReport: ComplexityReport = { units: [], files: [], unparsed: [] };

function stubMetric(hooks: {
  analyze?: () => Promise<ComplexityReport>;
  prepare?: () => Promise<void>;
} = {}): AnyMetric {
  return {
    id: "cyclomatic-complexity",
    name: "Cyclomatic complexity",
    direction: "higher-worse",
    grain: "function",
    analyze: hooks.analyze ?? (async () => emptyReport),
    diff: () => ({ added: [], removed: [], changed: [], totalDelta: 0 }),
    prepare: hooks.prepare,
  };
}

describe("evaluateMetric", () => {
  it("saves a snapshot on the first run and reuses it when inputs are unchanged", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let analyzed = 0;
    const metric = stubMetric({
      analyze: async () => {
        analyzed += 1;
        return emptyReport;
      },
    });
    const first = await evaluateMetric(metric, root);
    expect(first.reused).toBe(false);
    expect(first.snapshot?.path).toBeTruthy();
    expect(analyzed).toBe(1);

    const second = await evaluateMetric(metric, root);
    expect(second.reused).toBe(true);
    expect(second.snapshot?.path).toBe(first.snapshot?.path);
    expect(analyzed).toBe(1);
    expect(await listSnapshots({ root, metric: metric.id })).toHaveLength(1);
  });

  it("reuses an older snapshot when latest is for a different tree", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let analyzed = 0;
    const metric = stubMetric({
      analyze: async () => {
        analyzed += 1;
        return emptyReport;
      },
    });
    const first = await evaluateMetric(metric, root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 2; }\n");
    await evaluateMetric(metric, root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 1; }\n");
    const third = await evaluateMetric(metric, root);
    expect(third.reused).toBe(true);
    expect(third.snapshot?.path).toBe(first.snapshot?.path);
    expect(analyzed).toBe(2);
    expect(await listSnapshots({ root, metric: metric.id })).toHaveLength(2);
  });

  it("analyzes and saves again after the checkout changes", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    const metric = stubMetric();
    await evaluateMetric(metric, root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 2; }\n");
    const second = await evaluateMetric(metric, root);
    expect(second.reused).toBe(false);
    expect(await listSnapshots({ root, metric: metric.id })).toHaveLength(2);
  });

  it("runs prepare on a cache miss and skips it on a hit", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let prepared = 0;
    const metric = stubMetric({
      prepare: async () => {
        prepared += 1;
      },
    });
    await evaluateMetric(metric, root);
    expect(prepared).toBe(1);
    await evaluateMetric(metric, root);
    expect(prepared).toBe(1);
  });

  it("skips prepare when an older snapshot matches the checkout", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let prepared = 0;
    const metric = stubMetric({
      prepare: async () => {
        prepared += 1;
      },
    });
    await evaluateMetric(metric, root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 2; }\n");
    await evaluateMetric(metric, root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 1; }\n");
    await evaluateMetric(metric, root);
    expect(prepared).toBe(2);
  });

  it("piggybacks other coverage-backed metrics when tests must run", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let prepared = 0;
    let coverageAnalyzed = 0;
    let crapAnalyzed = 0;
    const coverage = stubMetric({
      analyze: async () => {
        coverageAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {
        prepared += 1;
      },
    });
    coverage.id = "test-coverage";
    coverage.name = "Test coverage";
    const crap = stubMetric({
      analyze: async () => {
        crapAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {
        prepared += 1;
      },
    });
    crap.id = "crap";
    crap.name = "CRAP";
    const catalog = [coverage, crap];
    const result = await evaluateMetric(crap, root, { catalog });
    expect(result.reused).toBe(false);
    expect(crapAnalyzed).toBe(1);
    expect(coverageAnalyzed).toBe(1);
    expect(prepared).toBe(1);
    expect(result.piggyback.map((entry) => entry.id)).toEqual(["test-coverage"]);
    expect(result.piggyback[0]?.result.reused).toBe(false);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(1);
    expect(await listSnapshots({ root, metric: "test-coverage" })).toHaveLength(1);

    const second = await evaluateMetric(coverage, root, { catalog });
    expect(second.reused).toBe(true);
    expect(coverageAnalyzed).toBe(1);
    expect(prepared).toBe(1);
  });

  it("does not piggyback when save is false", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let coverageAnalyzed = 0;
    const coverage = stubMetric({
      analyze: async () => {
        coverageAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {},
    });
    coverage.id = "test-coverage";
    const crap = stubMetric({
      analyze: async () => emptyReport,
      prepare: async () => {},
    });
    crap.id = "crap";
    await evaluateMetric(crap, root, { save: false, catalog: [coverage, crap] });
    expect(coverageAnalyzed).toBe(0);
    expect(await listSnapshots({ root, metric: "test-coverage" })).toHaveLength(0);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(0);
  });

  it("does not fail the requested metric when a piggyback sibling errors", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    const coverage = stubMetric({
      analyze: async () => {
        throw new Error("sibling");
      },
      prepare: async () => {},
    });
    coverage.id = "test-coverage";
    const crap = stubMetric({
      analyze: async () => emptyReport,
      prepare: async () => {},
    });
    crap.id = "crap";
    const result = await evaluateMetric(crap, root, { catalog: [coverage, crap] });
    expect(result.reused).toBe(false);
    expect(result.snapshot?.path).toBeTruthy();
    expect(result.piggyback).toEqual([]);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(1);
  });

  it("does not persist when save is false", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    const metric = stubMetric();
    const result = await evaluateMetric(metric, root, { save: false });
    expect(result.reused).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(await listSnapshots({ root, metric: metric.id })).toHaveLength(0);
  });

  it("skips prepare and piggyback when skipPrepare is requested", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let prepared = 0;
    let coverageAnalyzed = 0;
    const requested = stubMetric({
      analyze: async () => emptyReport,
      prepare: async () => {
        prepared += 1;
      },
    });
    requested.id = "crap";
    requested.name = "CRAP";
    const sibling = stubMetric({
      analyze: async () => {
        coverageAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {},
    });
    sibling.id = "test-coverage";
    sibling.name = "Test coverage";
    const result = await evaluateMetric(requested, root, {
      catalog: [sibling, requested],
      skipPrepare: true,
    });
    expect(prepared).toBe(0);
    expect(coverageAnalyzed).toBe(0);
    expect(result.reused).toBe(false);
    expect(result.snapshot?.path).toBeTruthy();
    expect(result.piggyback).toEqual([]);
  });

  it("does not piggyback siblings when the requested metric has no prepare hook", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let coverageAnalyzed = 0;
    const requested = stubMetric();
    const sibling = stubMetric({
      analyze: async () => {
        coverageAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {},
    });
    sibling.id = "test-coverage";
    sibling.name = "Test coverage";
    const result = await evaluateMetric(requested, root, { catalog: [sibling, requested] });
    expect(result.reused).toBe(false);
    expect(result.piggyback).toEqual([]);
    expect(coverageAnalyzed).toBe(0);
  });

  it("skips piggyback siblings that are already current", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    let coverageAnalyzed = 0;
    let crapAnalyzed = 0;
    const sibling = stubMetric({
      analyze: async () => {
        coverageAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {},
    });
    sibling.id = "test-coverage";
    sibling.name = "Test coverage";
    const crap = stubMetric({
      analyze: async () => {
        crapAnalyzed += 1;
        return emptyReport;
      },
      prepare: async () => {},
    });
    crap.id = "crap";
    crap.name = "CRAP";
    await evaluateMetric(sibling, root, { catalog: [sibling] });
    expect(coverageAnalyzed).toBe(1);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(0);

    const result = await evaluateMetric(crap, root, { catalog: [sibling, crap] });
    expect(result.reused).toBe(false);
    expect(crapAnalyzed).toBe(1);
    expect(coverageAnalyzed).toBe(1);
    expect(result.piggyback).toEqual([]);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(1);
  });
});
