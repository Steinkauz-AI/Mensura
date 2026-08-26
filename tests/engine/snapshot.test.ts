import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  snapshotDirectory,
  snapshotMatchingInputs,
  type Snapshot,
} from "../../src/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "snapshot-"));
  dirs.push(root);
  return root;
}

const report = { units: [], files: [], unparsed: [] };

describe("snapshot store", () => {
  it("saves under .mensura/metrics/<metric> and lists newest first", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    const first = await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T11:00:00.000Z") },
      report,
    );
    const second = await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T12:00:00.000Z") },
      report,
    );
    expect(first.path).toContain(join(".mensura", "metrics", "cyclomatic-complexity"));
    expect(second.path).not.toBe(first.path);
    const listing = await listSnapshots(store);
    expect(listing).toHaveLength(2);
    expect(listing.map((meta) => meta.timestamp)).toEqual([
      "2026-08-20T12:00:00.000Z",
      "2026-08-20T11:00:00.000Z",
    ]);
    expect(listing[0]!.file).toBe(basename(second.path));
  });

  it("resolves latest, previous, file name, and timestamp refs", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    const first = await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T10:00:00.000Z") },
      report,
    );
    const second = await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T11:00:00.000Z") },
      report,
    );
    expect((await loadSnapshot(store, "latest")).snapshot.timestamp).toBe("2026-08-20T11:00:00.000Z");
    expect((await loadSnapshot(store, "previous")).snapshot.timestamp).toBe("2026-08-20T10:00:00.000Z");
    expect((await loadSnapshot(store, basename(first.path))).snapshot.timestamp).toBe("2026-08-20T10:00:00.000Z");
    expect((await loadSnapshot(store, "2026-08-20T10:00:00.000Z")).snapshot.timestamp).toBe("2026-08-20T10:00:00.000Z");
    void second;
  });

  it("finds a matching snapshot that is not latest", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    const first = await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T10:00:00.000Z") },
      report,
      "hash-a",
    );
    await saveSnapshot(
      { ...store, now: () => new Date("2026-08-20T11:00:00.000Z") },
      report,
      "hash-b",
    );
    const match = await snapshotMatchingInputs(store, "hash-a");
    expect(match?.path).toBe(first.path);
    expect(await snapshotMatchingInputs(store, "missing")).toBeUndefined();
  });

  it("rejects an unknown ref with a clear error", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    await saveSnapshot(store, report);
    await expect(loadSnapshot(store, "previous")).rejects.toThrow(/No snapshot "previous"/);
    await expect(loadSnapshot(store, "nope.json")).rejects.toThrow(/No snapshot "nope\.json"/);
  });

  it("writes compact JSON and keeps the report intact", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    const saved = await saveSnapshot(store, { units: [{ path: "a.ts" }], files: [], unparsed: [] });
    const text = await readFile(saved.path, "utf8");
    expect(text).not.toContain("\n  ");
    const parsed = JSON.parse(text) as Snapshot;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.metric).toBe("cyclomatic-complexity");
    expect(parsed.inputsHash).toBeUndefined();
    expect(parsed.report).toEqual({ units: [{ path: "a.ts" }], files: [], unparsed: [] });
  });

  it("records inputsHash when provided", async () => {
    const root = await checkout();
    const store = { root, metric: "cyclomatic-complexity" };
    const saved = await saveSnapshot(store, report, "abc123");
    const parsed = JSON.parse(await readFile(saved.path, "utf8")) as Snapshot;
    expect(parsed.inputsHash).toBe("abc123");
  });

  it("suffers two saves in the same millisecond with a -2 suffix", async () => {
    const root = await checkout();
    const now = () => new Date("2026-08-20T10:00:00.000Z");
    const store = { root, metric: "cyclomatic-complexity", now };
    const first = await saveSnapshot(store, report);
    const second = await saveSnapshot(store, report);
    expect(second.path).not.toBe(first.path);
    expect(second.path.endsWith("-2.json")).toBe(true);
    const listing = await listSnapshots(store);
    expect(listing).toHaveLength(2);
  });

  it("evicts the oldest snapshots beyond maxSnapshots", async () => {
    const root = await checkout();
    const base = new Date("2026-08-20T10:00:00.000Z").getTime();
    for (let i = 0; i < 5; i++) {
      await saveSnapshot(
        {
          root,
          metric: "cyclomatic-complexity",
          maxSnapshots: 3,
          now: () => new Date(base + i * 60_000),
        },
        report,
      );
    }
    const dir = snapshotDirectory(root, "cyclomatic-complexity");
    const files = (await readdir(dir)).filter((name) => name.endsWith(".json") && name !== "manifest.json");
    expect(files).toHaveLength(3);
    const listing = await listSnapshots({ root, metric: "cyclomatic-complexity" });
    expect(listing).toHaveLength(3);
    expect(listing.map((meta) => meta.timestamp)).toEqual([
      "2026-08-20T10:04:00.000Z",
      "2026-08-20T10:03:00.000Z",
      "2026-08-20T10:02:00.000Z",
    ]);
  });
});
