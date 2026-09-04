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

function coverageBackedPair() {
  const prepared = { n: 0 };
  const coverageAnalyzed = { n: 0 };
  const crapAnalyzed = { n: 0 };
  const coverage = stubMetric({
    analyze: async () => {
      coverageAnalyzed.n += 1;
      return emptyReport;
    },
    prepare: async () => {
      prepared.n += 1;
    },
  });
  coverage.id = "test-coverage";
  coverage.name = "Test coverage";
  const crap = stubMetric({
    analyze: async () => {
      crapAnalyzed.n += 1;
      return emptyReport;
    },
    prepare: async () => {
      prepared.n += 1;
    },
  });
  crap.id = "crap";
  crap.name = "CRAP";
  return { catalog: [coverage, crap], prepared, coverageAnalyzed, crapAnalyzed, coverage, crap };
}

function currentSiblingPair() {
  const coverageAnalyzed = { n: 0 };
  const crapAnalyzed = { n: 0 };
  const sibling = stubMetric({
    analyze: async () => {
      coverageAnalyzed.n += 1;
      return emptyReport;
    },
    prepare: async () => {},
  });
  sibling.id = "test-coverage";
  sibling.name = "Test coverage";
  const crap = stubMetric({
    analyze: async () => {
      crapAnalyzed.n += 1;
      return emptyReport;
    },
    prepare: async () => {},
  });
  crap.id = "crap";
  crap.name = "CRAP";
  return { catalog: [sibling, crap], coverageAnalyzed, crapAnalyzed, sibling, crap };
}

async function expectPiggybackFirstRun(
  root: string,
  pair: ReturnType<typeof coverageBackedPair>,
): Promise<void> {
  const result = await evaluateMetric(pair.crap, root, { catalog: pair.catalog });
  expect(result.reused).toBe(false);
  expect(pair.crapAnalyzed.n).toBe(1);
  expect(pair.coverageAnalyzed.n).toBe(1);
  expect(pair.prepared.n).toBe(1);
  expect(result.piggyback.map((entry) => entry.id)).toEqual(["test-coverage"]);
  const piggyback = result.piggyback[0];
  expect(piggyback?.ok).toBe(true);
  if (piggyback?.ok) {
    expect(piggyback.result.reused).toBe(false);
  }
  expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(1);
  expect(await listSnapshots({ root, metric: "test-coverage" })).toHaveLength(1);
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

  it("evicts older snapshots using maxSnapshots from config", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      ".mensura/config.json": JSON.stringify({ maxSnapshots: 2 }),
    });
    const metric = stubMetric();
    const base = new Date("2026-08-20T10:00:00.000Z").getTime();
    for (let i = 0; i < 3; i++) {
      await writeFile(join(root, "src", "a.ts"), `export function a() { return ${i}; }\n`);
      await evaluateMetric(metric, root, {
        now: () => new Date(base + i * 60_000),
      });
    }
    const listing = await listSnapshots({ root, metric: metric.id });
    expect(listing).toHaveLength(2);
    expect(listing.map((meta) => meta.timestamp)).toEqual([
      "2026-08-20T10:02:00.000Z",
      "2026-08-20T10:01:00.000Z",
    ]);
  });

  it("prefers an explicit maxSnapshots option over config", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      ".mensura/config.json": JSON.stringify({ maxSnapshots: 10 }),
    });
    const metric = stubMetric();
    const base = new Date("2026-08-20T10:00:00.000Z").getTime();
    for (let i = 0; i < 3; i++) {
      await writeFile(join(root, "src", "a.ts"), `export function a() { return ${i}; }\n`);
      await evaluateMetric(metric, root, {
        maxSnapshots: 1,
        now: () => new Date(base + i * 60_000),
      });
    }
    expect(await listSnapshots({ root, metric: metric.id })).toHaveLength(1);
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
    const pair = coverageBackedPair();
    await expectPiggybackFirstRun(root, pair);
    const second = await evaluateMetric(pair.catalog[0]!, root, { catalog: pair.catalog });
    expect(second.reused).toBe(true);
    expect(pair.coverageAnalyzed.n).toBe(1);
    expect(pair.prepared.n).toBe(1);
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
    expect(result.piggyback).toHaveLength(1);
    expect(result.piggyback[0]).toMatchObject({
      id: "test-coverage",
      ok: false,
    });
    expect(
      result.piggyback[0]?.ok === false && result.piggyback[0].error.message,
    ).toBe("sibling");
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
    const { catalog, coverageAnalyzed, crapAnalyzed, sibling, crap } = currentSiblingPair();
    await evaluateMetric(sibling, root, { catalog: [sibling] });
    expect(coverageAnalyzed.n).toBe(1);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(0);

    const result = await evaluateMetric(crap, root, { catalog });
    expect(result.reused).toBe(false);
    expect(crapAnalyzed.n).toBe(1);
    expect(coverageAnalyzed.n).toBe(1);
    expect(result.piggyback).toEqual([]);
    expect(await listSnapshots({ root, metric: "crap" })).toHaveLength(1);
  });
});
