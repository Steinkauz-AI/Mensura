import { beforeAll, describe, expect, it } from "vitest";
import { ensureBuiltinMetrics, hashMetricInputs, listMetrics } from "../../src/index.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  diffSnapshots,
  generateMetrics,
  loadCatalog,
  loadInspectSnapshots,
  showSnapshot,
} from "../../src/cli/shell/store.js";
import { checkout, seedSnapshotStore } from "./helpers.js";

const METRIC = "cyclomatic-complexity";

beforeAll(async () => {
  await ensureBuiltinMetrics();
});

function unit(name: string, complexity: number) {
  return {
    path: "src/a.ts",
    name,
    kind: "function" as const,
    startLine: 1,
    endLine: 2,
    complexity,
  };
}

const CHECKOUT: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", private: true }),
  "src/a.ts": "export function simple() {\n  return 1;\n}\n",
};

describe("loadCatalog", () => {
  it("lists every registered metric as missing on a checkout without snapshots", async () => {
    const root = await checkout(CHECKOUT);
    const rows = await loadCatalog(root);
    expect(rows.map((row) => row.id)).toEqual(listMetrics().map((metric) => metric.id));
    expect(rows.every((row) => row.status === "missing")).toBe(true);
    expect(rows.every((row) => row.snapshotCount === 0 && row.latest === null)).toBe(true);
  });

  it("marks a metric up-to-date with its count and newest timestamp when a snapshot matches the inputs", async () => {
    const root = await checkout(CHECKOUT);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-24T10:00:00.000Z", inputsHash: hash },
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: hash },
    ]);
    const rows = await loadCatalog(root);
    const row = rows.find((entry) => entry.id === METRIC)!;
    expect(row.status).toBe("up-to-date");
    expect(row.snapshotCount).toBe(2);
    expect(row.latest).toBe("2026-08-25T10:00:00.000Z");
    expect(row.name).toBe("Cyclomatic complexity");
  });

  it("marks a metric outdated when none of its snapshots matches the inputs", async () => {
    const root = await checkout(CHECKOUT);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: "stale-hash" },
    ]);
    const rows = await loadCatalog(root);
    expect(rows.find((entry) => entry.id === METRIC)!.status).toBe("outdated");
  });

  it("keeps listing snapshots with blank status when status cannot be computed", async () => {
    const root = await checkout({ ...CHECKOUT, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const rows = await loadCatalog(root);
    const row = rows.find((entry) => entry.id === METRIC)!;
    expect(row.status).toBe("");
    expect(row.snapshotCount).toBe(1);
    expect(row.latest).toBe("2026-08-25T10:00:00.000Z");
  });
});

describe("loadInspectSnapshots", () => {
  it("returns no snapshots for an empty store", async () => {
    const root = await checkout(CHECKOUT);
    expect(await loadInspectSnapshots(root, METRIC)).toEqual([]);
  });

  it("flags the newest snapshot latest and the second one previous", async () => {
    const root = await checkout(CHECKOUT);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-23T10:00:00.000Z" },
      { timestamp: "2026-08-24T10:00:00.000Z" },
      { timestamp: "2026-08-25T10:00:00.000Z" },
    ]);
    const snaps = await loadInspectSnapshots(root, METRIC);
    expect(snaps.map((snap) => snap.timestamp)).toEqual([
      "2026-08-25T10:00:00.000Z",
      "2026-08-24T10:00:00.000Z",
      "2026-08-23T10:00:00.000Z",
    ]);
    expect(snaps[0]).toMatchObject({ latest: true, previous: false, current: false });
    expect(snaps[1]).toMatchObject({ latest: false, previous: true, current: false });
    expect(snaps[2]).toMatchObject({ latest: false, previous: false, current: false });
  });

  it("marks only the snapshot whose inputs match the checkout as current, even an older one", async () => {
    const root = await checkout(CHECKOUT);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-24T10:00:00.000Z", inputsHash: hash },
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: "newer-but-stale" },
    ]);
    const snaps = await loadInspectSnapshots(root, METRIC);
    expect(snaps.map((snap) => [snap.timestamp, snap.current])).toEqual([
      ["2026-08-25T10:00:00.000Z", false],
      ["2026-08-24T10:00:00.000Z", true],
    ]);
  });

  it("marks no snapshot current when hashing the checkout fails", async () => {
    const root = await checkout({ ...CHECKOUT, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const snaps = await loadInspectSnapshots(root, METRIC);
    expect(snaps.map((snap) => snap.current)).toEqual([false]);
  });
});

describe("showSnapshot", () => {
  it("renders the saved report under the metric name with the catalog threshold", async () => {
    const root = await checkout(CHECKOUT);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      {
        timestamp: "2026-08-25T10:00:00.000Z",
        inputsHash: hash,
        report: { units: [unit("hot", 25)], files: [], unparsed: [] },
      },
    ]);
    const text = await showSnapshot(root, METRIC, "latest", { write: () => {} }, {});
    expect(text.startsWith("outdated")).toBe(false);
    expect(text).toContain("Cyclomatic complexity");
    expect(text).toContain("threshold  max 20");
    expect(text).toContain("hot");
    expect(text).toContain("2026-08-25T10:00:00.000Z");
  });

  it("prefixes the outdated note when the snapshot predates the current inputs", async () => {
    const root = await checkout(CHECKOUT);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: "stale-hash" },
    ]);
    const text = await showSnapshot(root, METRIC, "latest", { write: () => {} }, {});
    expect(text.startsWith("outdated\n")).toBe(true);
  });

  it("still labels the view outdated when hashing the checkout fails", async () => {
    const root = await checkout({ ...CHECKOUT, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const text = await showSnapshot(root, METRIC, "latest", { write: () => {} }, {});
    expect(text.startsWith("outdated\n")).toBe(true);
  });

  it("rejects an unknown metric id", async () => {
    const root = await checkout(CHECKOUT);
    await expect(showSnapshot(root, "nope", "latest", { write: () => {} }, {})).rejects.toThrow(
      /Unknown metric "nope"/,
    );
  });
});

describe("diffSnapshots", () => {
  it("renders the delta between two refs without an outdated note when both match", async () => {
    const root = await checkout(CHECKOUT);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      {
        timestamp: "2026-08-24T10:00:00.000Z",
        inputsHash: hash,
        report: { units: [unit("hot", 10)], files: [], unparsed: [] },
      },
      {
        timestamp: "2026-08-25T10:00:00.000Z",
        inputsHash: hash,
        report: { units: [unit("hot", 25)], files: [], unparsed: [] },
      },
    ]);
    const text = await diffSnapshots(root, METRIC, "previous", "latest", { write: () => {} }, {});
    expect(text.startsWith("outdated")).toBe(false);
    expect(text).toContain("10 → 25");
    expect(text).toContain("+15");
  });

  it("prefixes the outdated note when the baseline predates the current inputs", async () => {
    const root = await checkout(CHECKOUT);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-24T10:00:00.000Z", inputsHash: "stale-hash" },
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: hash },
    ]);
    const text = await diffSnapshots(root, METRIC, "previous", "latest", { write: () => {} }, {});
    expect(text.startsWith("outdated\n")).toBe(true);
  });

  it("rejects an unknown metric id", async () => {
    const root = await checkout(CHECKOUT);
    await expect(
      diffSnapshots(root, "nope", "previous", "latest", { write: () => {} }, {}),
    ).rejects.toThrow(/Unknown metric "nope"/);
  });
});

describe("generateMetrics", () => {
  it("evaluates selected metrics, saves their snapshots, and returns refreshed rows", async () => {
    const root = await checkout(CHECKOUT);
    const { rows, errors } = await generateMetrics(root, [METRIC]);
    expect(errors).toEqual({});
    const row = rows.find((entry) => entry.id === METRIC)!;
    expect(row.snapshotCount).toBe(1);
    expect(row.latest).not.toBeNull();
    expect(row.status).toBe("up-to-date");
    const manifest = JSON.parse(
      await readFile(join(root, ".mensura", "metrics", METRIC, "manifest.json"), "utf8"),
    ) as unknown[];
    expect(manifest).toHaveLength(1);
  });

  it("records unknown metric ids as errors and still generates the rest", async () => {
    const root = await checkout(CHECKOUT);
    const { rows, errors } = await generateMetrics(root, ["nope", METRIC]);
    expect(errors.nope).toBe('Unknown metric "nope"');
    expect(rows.find((entry) => entry.id === METRIC)!.snapshotCount).toBe(1);
  });

  it("records a failing metric's message without losing the rest of the batch", async () => {
    const root = await checkout(CHECKOUT);
    const { errors } = await generateMetrics(root, ["test-coverage", METRIC]);
    expect(Object.keys(errors)).toEqual(["test-coverage"]);
    expect(errors["test-coverage"]).toMatch(/test:coverage/);
  });
});
