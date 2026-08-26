import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hashMetricInputs } from "../../src/core/inputs.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "inputs-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

describe("hashMetricInputs", () => {
  it("is stable for the same source tree", async () => {
    const files = { "src/a.ts": "export function a() { return 1; }\n" };
    const first = await hashMetricInputs(await checkoutWith(files));
    const second = await hashMetricInputs(await checkoutWith(files));
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a source file's contents change", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
    });
    const before = await hashMetricInputs(root);
    await writeFile(join(root, "src", "a.ts"), "export function a() { return 2; }\n");
    expect(await hashMetricInputs(root)).not.toBe(before);
  });

  it("ignores files under skipped directories", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      "dist/a.ts": "export function a() { return 99; }\n",
    });
    const before = await hashMetricInputs(root);
    await writeFile(join(root, "dist", "a.ts"), "export function a() { return 0; }\n");
    expect(await hashMetricInputs(root)).toBe(before);
  });

  it("ignores files under all-grains skipPaths rules", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      "packages/alpha/src/widget.tsx": "export function Widget() {}\n",
      ".mensura/config.json": JSON.stringify({ skipPaths: ["packages/alpha/**"] }),
    });
    const before = await hashMetricInputs(root);
    await writeFile(
      join(root, "packages", "alpha", "src", "widget.tsx"),
      "export function Widget() { return 2; }\n",
    );
    expect(await hashMetricInputs(root)).toBe(before);
  });

  it("still hashes files excluded by only one grain", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() { return 1; }\n",
      "packages/alpha/src/widget.tsx": "export function Widget() {}\n",
      ".mensura/config.json": JSON.stringify({
        skipPaths: [{ path: "packages/alpha", grains: ["function"] }],
      }),
    });
    const before = await hashMetricInputs(root);
    await writeFile(
      join(root, "packages", "alpha", "src", "widget.tsx"),
      "export function Widget() { return 2; }\n",
    );
    expect(await hashMetricInputs(root)).not.toBe(before);
  });
});
