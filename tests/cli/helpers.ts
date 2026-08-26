import { afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

export async function checkout(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mensura-unit-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source, "utf8");
  }
  return root;
}

export type Capture = {
  stdout: { write(text: string): void; isTTY?: boolean };
  stderr: { write(text: string): void; isTTY?: boolean };
  out: string;
  err: string;
};

export type CraftedSnapshot = {
  timestamp: string;
  inputsHash?: string;
  report?: unknown;
};

export async function seedSnapshotStore(
  root: string,
  metric: string,
  snapshots: CraftedSnapshot[],
): Promise<void> {
  const dir = join(root, ".mensura", "metrics", metric);
  await mkdir(dir, { recursive: true });
  const entries = await writeCraftedSnapshots(dir, metric, root, snapshots);
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(entries, null, 2)}\n`);
}

async function writeCraftedSnapshots(
  dir: string,
  metric: string,
  root: string,
  snapshots: CraftedSnapshot[],
): Promise<Array<{ file: string; timestamp: string }>> {
  const entries: Array<{ file: string; timestamp: string }> = [];
  for (const snap of snapshots) {
    const file = `${snap.timestamp.replaceAll(":", "-")}.json`;
    const doc = {
      schemaVersion: 1,
      metric,
      root,
      timestamp: snap.timestamp,
      ...(snap.inputsHash !== undefined ? { inputsHash: snap.inputsHash } : {}),
      report: snap.report ?? { units: [], files: [], unparsed: [] },
    };
    await writeFile(join(dir, file), `${JSON.stringify(doc)}\n`);
    entries.push({ file, timestamp: snap.timestamp });
  }
  return entries;
}

export function capture(isTTY = false): Capture {
  const io: Capture = {
    stdout: {
      isTTY,
      write(text: string) {
        io.out += text;
      },
    },
    stderr: {
      write(text: string) {
        io.err += text;
      },
    },
    out: "",
    err: "",
  };
  return io;
}
