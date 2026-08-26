import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { findCoverageArtifacts } from "../../src/metrics/test-coverage/discover.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "discover-"));
  dirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  return root;
}

describe("findCoverageArtifacts", () => {
  it("finds coverage-final.json files and skips ignored directories", async () => {
    const root = await fixture({
      "coverage/coverage-final.json": "{}\n",
      "packages/app/coverage/coverage-final.json": "{}\n",
      "node_modules/coverage/coverage-final.json": "{}\n",
      "dist/coverage/coverage-final.json": "{}\n",
      ".mensura/coverage/coverage-final.json": "{}\n",
      "src/lib.ts": "export {}\n",
    });
    const found = await findCoverageArtifacts(root);
    expect(found).toEqual([
      join(root, "coverage", "coverage-final.json"),
      join(root, "packages", "app", "coverage", "coverage-final.json"),
    ]);
  });

  it("returns an empty sorted list when no artifacts exist", async () => {
    const root = await fixture({ "src/only.ts": "export {}\n" });
    expect(await findCoverageArtifacts(root)).toEqual([]);
  });
});
