import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildImportGraph } from "../../src/lang/typescript/graph/index.js";
import { hashMetricInputs } from "../../src/core/inputs.js";
import { analyzeCycles } from "../../src/metrics/cycles/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "path-aliases-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    const abs = join(root, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
  return root;
}

describe("project path aliases", () => {
  it("finds cycles through a Next-style alias without building the checkout", async () => {
    const root = await checkoutWith({
      "apps/web/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      "apps/web/src/a.ts": 'import { b } from "@/b"; export const a = b;',
      "apps/web/src/b.tsx": 'import { a } from "@/a.js"; export const b = a;',
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "apps/web/src/a.ts", to: "apps/web/src/b.tsx", kind: "value" },
      { from: "apps/web/src/b.tsx", to: "apps/web/src/a.ts", kind: "value" },
    ]);
    expect((await analyzeCycles(root)).units.map((unit) => unit.complexity)).toEqual([2, 2]);
  });

  it("uses each workspace's nearest config and preserves package export edges", async () => {
    const config = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    const root = await checkoutWith({
      "apps/one/tsconfig.json": config,
      "apps/two/tsconfig.json": config,
      "apps/one/src/main.ts": 'import "@/value"; import "@x/ui/button";',
      "apps/one/src/value.ts": "export const value = 1;",
      "apps/two/src/main.ts": 'import "@/value";',
      "apps/two/src/value.ts": "export const value = 2;",
      "packages/ui/package.json": JSON.stringify({ name: "@x/ui", exports: { "./button": "./src/button.tsx" } }),
      "packages/ui/src/button.tsx": "export const Button = () => null;",
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "apps/one/src/main.ts", to: "apps/one/src/value.ts", kind: "value" },
      { from: "apps/one/src/main.ts", to: "packages/ui/src/button.tsx", kind: "value" },
      { from: "apps/two/src/main.ts", to: "apps/two/src/value.ts", kind: "value" },
    ]);
  });

  it("supports JSONC, inherited paths, baseUrl, and ordered fallback targets", async () => {
    const root = await checkoutWith({
      "config/base.json": '{ // shared settings\n "compilerOptions": { "baseUrl": "..", "paths": { "shared": ["missing", "lib/shared"], "@/*": ["lib/*"] } }, }',
      "apps/web/tsconfig.json": JSON.stringify({ extends: "../../config/base.json" }),
      "apps/web/main.ts": 'import "shared"; import type { T } from "@/types"; import "lib/direct";',
      "lib/shared/index.ts": "export const value = 1;",
      "lib/types.ts": "export type T = string;",
      "lib/direct.js": "export const direct = 1;",
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "apps/web/main.ts", to: "lib/direct.js", kind: "value" },
      { from: "apps/web/main.ts", to: "lib/shared/index.ts", kind: "value" },
      { from: "apps/web/main.ts", to: "lib/types.ts", kind: "type" },
    ]);
  });

  it("prefers exact mappings and the longest matching wildcard prefix", async () => {
    const root = await checkoutWith({
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: {
        "@/*": ["broad/*"], "@/lib/*": ["specific/*"], "@/lib/exact": ["exact.ts"],
      } } }),
      "main.ts": 'import "@/lib/exact"; import "@/lib/value";',
      "exact.ts": "export {};",
      "specific/value.ts": "export {};",
      "specific/exact.ts": "export {};",
      "broad/lib/exact.ts": "export {};",
      "broad/lib/value.ts": "export {};",
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "main.ts", to: "exact.ts", kind: "value" },
      { from: "main.ts", to: "specific/value.ts", kind: "value" },
    ]);
  });

  it("supports jsconfig and lets a child paths map replace its inherited map", async () => {
    const root = await checkoutWith({
      "base.json": JSON.stringify({ compilerOptions: { paths: { old: ["old.js"] } } }),
      "jsconfig.json": JSON.stringify({ extends: "./base.json", compilerOptions: { paths: { current: ["value.js"] } } }),
      "main.js": 'export * from "current"; import "old";',
      "value.js": "export const value = 1;",
      "old.js": "export const old = 1;",
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "main.js", to: "value.js", kind: "value" },
    ]);
  });

  it("keeps aliases to skipped, test, declaration, and external files out of the graph", async () => {
    const root = await checkoutWith({
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
      ".mensura/config.json": JSON.stringify({ skipPaths: ["generated"] }),
      "main.ts": 'import "@/generated/value"; import "@/value.test"; import "@/types"; import "@/node_modules/external/index";',
      "generated/value.ts": "export {};",
      "value.test.ts": "export {};",
      "types.d.ts": "export {};",
      "node_modules/external/index.ts": "export {};",
    });
    expect((await buildImportGraph(root)).edges).toEqual([]);
  });

  it("inherits paths without baseUrl relative to the declaring config", async () => {
    const root = await checkoutWith({
      "config/base.json": JSON.stringify({ compilerOptions: { paths: { shared: ["../lib/value"] } } }),
      "apps/web/tsconfig.json": JSON.stringify({ extends: "../../config/base.json", files: [] }),
      "apps/web/main.ts": 'import "shared";',
      "lib/value.ts": "export {};",
    });
    expect((await buildImportGraph(root)).edges).toEqual([
      { from: "apps/web/main.ts", to: "lib/value.ts", kind: "value" },
    ]);
  });

  it.each([
    '{ "compilerOptions": ',
    JSON.stringify({ extends: "./missing.json" }),
    JSON.stringify({ extends: "./tsconfig.json" }),
  ])("reports invalid configs instead of silently dropping alias edges (%s)", async (config) => {
    const root = await checkoutWith({ "tsconfig.json": config, "main.ts": 'import "@/value";' });
    await expect(buildImportGraph(root)).rejects.toThrow("Cannot load project config");
    await expect(hashMetricInputs(root)).rejects.toThrow("Cannot load project config");
  });
});

describe("project config snapshot inputs", () => {
  it("invalidates snapshots after a config is added, edited, or removed", async () => {
    const root = await checkoutWith({ "src/main.ts": 'import "@/value";', "src/value.ts": "export {};" });
    const original = await hashMetricInputs(root);
    const path = join(root, "tsconfig.json");
    await writeFile(path, JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }));
    const added = await hashMetricInputs(root);
    expect(added).not.toBe(original);
    await writeFile(path, JSON.stringify({ compilerOptions: { paths: { "@/*": ["./other/*"] } } }));
    expect(await hashMetricInputs(root)).not.toBe(added);
    await rm(path);
    expect(await hashMetricInputs(root)).toBe(original);
  });

  it("hashes inherited configs and stays stable when a checkout moves", async () => {
    const files = {
      "configs/base.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["../src/*"] } } }),
      "tsconfig.json": JSON.stringify({ extends: "./configs/base.json" }),
      "src/main.ts": 'import "@/value";',
      "src/value.ts": "export {};",
    };
    const root = await checkoutWith(files);
    const before = await hashMetricInputs(root);
    expect(await hashMetricInputs(await checkoutWith(files))).toBe(before);
    await writeFile(join(root, "configs/base.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["../other/*"] } } }));
    expect(await hashMetricInputs(root)).not.toBe(before);
  });
});
