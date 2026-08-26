import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { MENSURA_DIR } from "./config/index.js";

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_SNAPSHOTS = 20;
const MANIFEST_FILE = "manifest.json";

export type Snapshot<TReport = unknown> = {
  schemaVersion: 1;
  metric: string;
  root: string;
  timestamp: string;

  inputsHash?: string;
  report: TReport;
};

export type SnapshotMeta = {
  file: string;
  timestamp: string;
};


export type SnapshotRef = "latest" | "previous" | (string & {});

export type SnapshotStore = {
  root: string;
  metric: string;
  maxSnapshots?: number;
  now?: () => Date;
};

export type SavedSnapshot<TReport = unknown> = {
  path: string;
  snapshot: Snapshot<TReport>;
};

export function snapshotDirectory(root: string, metric: string): string {
  return join(root, MENSURA_DIR, "metrics", metric);
}

export function defaultSnapshotName(now: Date): string {
  return `${now.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.json`;
}


export async function saveSnapshot<TReport>(
  store: SnapshotStore,
  report: TReport,
  inputsHash?: string,
): Promise<SavedSnapshot<TReport>> {
  const dir = snapshotDirectory(store.root, store.metric);
  await mkdir(dir, { recursive: true });
  const now = (store.now ?? (() => new Date()))();
  const snapshot: Snapshot<TReport> = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    metric: store.metric,
    root: store.root,
    timestamp: now.toISOString(),
    ...(inputsHash !== undefined ? { inputsHash } : {}),
    report,
  };
  const path = await writeSnapshotFile(dir, snapshot);
  const max = store.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
  const manifest = [...(await readManifest(dir)), { file: basename(path), timestamp: snapshot.timestamp }];
  manifest.sort(byOldest);
  const overflow = Math.max(0, manifest.length - max);
  const evicted = manifest.slice(0, overflow);
  const kept = manifest.slice(overflow);
  for (const meta of evicted) {
    await rm(join(dir, meta.file), { force: true });
  }
  await writeAtomic(join(dir, MANIFEST_FILE), `${JSON.stringify(kept.reverse(), null, 2)}\n`);
  return { path, snapshot };
}


export async function latestSnapshot<TReport = unknown>(
  store: SnapshotStore,
): Promise<SavedSnapshot<TReport> | undefined> {
  const listing = await listSnapshots(store);
  if (listing.length === 0) return undefined;
  return loadSnapshot<TReport>(store, "latest");
}


export async function snapshotMatchingInputs<TReport = unknown>(
  store: SnapshotStore,
  inputsHash: string,
): Promise<SavedSnapshot<TReport> | undefined> {
  for (const meta of await listSnapshots(store)) {
    const loaded = await loadSnapshot<TReport>(store, meta.file);
    if (loaded.snapshot.inputsHash === inputsHash) return loaded;
  }
  return undefined;
}


export async function listSnapshots(store: SnapshotStore): Promise<SnapshotMeta[]> {
  const manifest = await readManifest(snapshotDirectory(store.root, store.metric));
  return [...manifest].sort(byNewest);
}


export async function loadSnapshot<TReport = unknown>(
  store: SnapshotStore,
  ref: SnapshotRef,
): Promise<SavedSnapshot<TReport>> {
  const dir = snapshotDirectory(store.root, store.metric);
  const manifest = (await readManifest(dir)).sort(byNewest);
  const file =
    ref === "latest"
      ? manifest[0]?.file
      : ref === "previous"
        ? manifest[1]?.file
        : manifest.find((meta) => meta.file === ref || meta.timestamp === ref)?.file;
  if (!file) {
    throw new Error(`No snapshot "${ref}" for metric "${store.metric}" in ${dir}`);
  }
  const path = join(dir, file);
  const snapshot = JSON.parse(await readFile(path, "utf8")) as Snapshot<TReport>;
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`${path}: unsupported schemaVersion ${String(snapshot.schemaVersion)}`);
  }
  if (snapshot.metric !== store.metric) {
    throw new Error(`${path}: metric "${snapshot.metric}" does not match "${store.metric}"`);
  }
  return { path, snapshot };
}

async function writeSnapshotFile<TReport>(
  dir: string,
  snapshot: Snapshot<TReport>,
): Promise<string> {
  const base = defaultSnapshotName(new Date(snapshot.timestamp));
  let file = base;
  let suffix = 2;
  while (await fileExists(join(dir, file))) {
    file = base.replace(".json", `-${suffix++}.json`);
  }
  const path = join(dir, file);
  await writeAtomic(path, `${JSON.stringify(snapshot)}\n`);
  return path;
}

async function readManifest(dir: string): Promise<SnapshotMeta[]> {
  const file = join(dir, MANIFEST_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error(`${file} must be a JSON array`);
  return raw as SnapshotMeta[];
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function byNewest(a: SnapshotMeta, b: SnapshotMeta): number {
  return (
    b.timestamp.localeCompare(a.timestamp) || b.file.localeCompare(a.file)
  );
}

function byOldest(a: SnapshotMeta, b: SnapshotMeta): number {
  return (
    a.timestamp.localeCompare(b.timestamp) || a.file.localeCompare(b.file)
  );
}
