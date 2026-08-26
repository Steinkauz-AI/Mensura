import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildImportGraph } from "../../src/lang/typescript/graph/index.js";
import { analyzeCycles } from "../../src/metrics/cycles/index.js";
import { analyzeCoupling } from "../../src/metrics/coupling/index.js";
import { analyzeEncapsulation } from "../../src/metrics/encapsulation/index.js";
import { analyzePropagationCost } from "../../src/metrics/propagation-cost/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "structure-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

function unitAt<T extends { path: string }>(units: T[], path: string): T {
  const match = units.filter((unit) => unit.path === path);
  expect(match, `expected exactly one unit at ${path}`).toHaveLength(1);
  return match[0]!;
}

describe("import graph", () => {
  it("records a relative import as a value edge", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(graph.edges).toEqual([{ from: "src/a.ts", to: "src/b.ts", kind: "value" }]);
  });

  it("records import type as a type edge", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import type { B } from "./b.js";\nexport type A = B;\n`,
      "src/b.ts": `export type B = string;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.edges).toEqual([{ from: "src/a.ts", to: "src/b.ts", kind: "type" }]);
  });

  it("omits test files and external packages", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nimport fs from "node:fs";\nimport lodash from "lodash";\n`,
      "src/b.ts": `export const b = 1;\n`,
      "src/a.test.ts": `import { a } from "./a.js";\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(graph.edges).toEqual([{ from: "src/a.ts", to: "src/b.ts", kind: "value" }]);
  });

  it("resolves a workspace package name to its src/index entry", async () => {
    const root = await checkoutWith({
      "apps/app/package.json": JSON.stringify({ name: "@x/app" }),
      "apps/app/src/main.ts": `import { ok } from "@x/lib";\nexport const n = ok;\n`,
      "packages/lib/package.json": JSON.stringify({ name: "@x/lib" }),
      "packages/lib/src/index.ts": `export const ok = 1;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.edges).toEqual([
      { from: "apps/app/src/main.ts", to: "packages/lib/src/index.ts", kind: "value" },
    ]);
  });

  it("records export-from as a value edge and export-type-from as a type edge", async () => {
    const root = await checkoutWith({
      "src/a.ts": `export { b } from "./b.js";\nexport type { B } from "./types.js";\n`,
      "src/b.ts": `export const b = 1;\n`,
      "src/types.ts": `export type B = string;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.edges).toEqual([
      { from: "src/a.ts", to: "src/b.ts", kind: "value" },
      { from: "src/a.ts", to: "src/types.ts", kind: "type" },
    ]);
  });

  it("records import-equals, require(), and import() as value edges", async () => {
    const root = await checkoutWith({
      "src/a.ts": [
        `import b = require("./b.js");`,
        `const c = require("./c.js");`,
        `const d = import("./d.js");`,
        `export const n = b + c;`,
        `void d;`,
        ``,
      ].join("\n"),
      "src/b.ts": `export = 1;\n`,
      "src/c.ts": `module.exports = 2;\n`,
      "src/d.ts": `export const d = 3;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.edges).toEqual([
      { from: "src/a.ts", to: "src/b.ts", kind: "value" },
      { from: "src/a.ts", to: "src/c.ts", kind: "value" },
      { from: "src/a.ts", to: "src/d.ts", kind: "value" },
    ]);
  });

  it("skips a dynamic import whose specifier is not a string literal", async () => {
    const root = await checkoutWith({
      "src/a.ts": `const name = "./b.js";\nconst m = import(name);\nvoid m;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const graph = await buildImportGraph(root);
    expect(graph.edges).toEqual([]);
  });
});

describe("analyzeCycles", () => {
  it("scores isolated files as 0", async () => {
    const root = await checkoutWith({
      "src/a.ts": `export const a = 1;\n`,
      "src/b.ts": `export const b = 2;\n`,
    });
    const report = await analyzeCycles(root);
    expect(unitAt(report.units, "src/a.ts").complexity).toBe(0);
    expect(unitAt(report.units, "src/b.ts").complexity).toBe(0);
  });

  it("scores both files in a two-file cycle as 2", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `import { a } from "./a.js";\nexport const b = a;\n`,
    });
    const report = await analyzeCycles(root);
    expect(unitAt(report.units, "src/a.ts").complexity).toBe(2);
    expect(unitAt(report.units, "src/b.ts").complexity).toBe(2);
  });

  it("does not treat a one-way import as a cycle", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const report = await analyzeCycles(root);
    expect(unitAt(report.units, "src/a.ts").complexity).toBe(0);
    expect(unitAt(report.units, "src/b.ts").complexity).toBe(0);
  });
});

describe("analyzeCoupling", () => {
  it("counts Ce on the importer and Ca on the importee", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const report = await analyzeCoupling(root);
    const a = unitAt(report.units, "src/a.ts");
    const b = unitAt(report.units, "src/b.ts");
    expect(a.complexity).toBe(1);
    expect(a.ce).toBe(1);
    expect(a.ca).toBe(0);
    expect(a.instability).toBe(1);
    expect(b.complexity).toBe(0);
    expect(b.ce).toBe(0);
    expect(b.ca).toBe(1);
    expect(b.instability).toBe(0);
  });

  it("gives isolated files I = 0", async () => {
    const root = await checkoutWith({
      "src/a.ts": `export const a = 1;\n`,
    });
    expect(unitAt((await analyzeCoupling(root)).units, "src/a.ts").instability).toBe(0);
  });
});

describe("analyzeEncapsulation", () => {
  it("does not treat a public package entry as a leak", async () => {
    const root = await checkoutWith({
      "apps/app/package.json": JSON.stringify({ name: "@x/app" }),
      "apps/app/src/main.ts": `import { ok } from "@x/lib";\nexport const n = ok;\n`,
      "packages/lib/package.json": JSON.stringify({ name: "@x/lib" }),
      "packages/lib/src/index.ts": `export const ok = 1;\n`,
    });
    const report = await analyzeEncapsulation(root);
    expect(unitAt(report.units, "packages/lib/src/index.ts").complexity).toBe(0);
    expect(unitAt(report.units, "apps/app/src/main.ts").complexity).toBe(0);
  });

  it("counts a deep import of another package as a leak", async () => {
    const root = await checkoutWith({
      "apps/app/package.json": JSON.stringify({ name: "@x/app" }),
      "apps/app/src/main.ts": `import { secret } from "@x/lib/src/internal.js";\nexport const n = secret;\n`,
      "packages/lib/package.json": JSON.stringify({ name: "@x/lib" }),
      "packages/lib/src/index.ts": `export const ok = 1;\n`,
      "packages/lib/src/internal.ts": `export const secret = 2;\n`,
    });
    const report = await analyzeEncapsulation(root);
    expect(unitAt(report.units, "packages/lib/src/internal.ts").complexity).toBe(1);
    expect(unitAt(report.units, "packages/lib/src/index.ts").complexity).toBe(0);
  });

  it("scores 0 in a single-package checkout", async () => {
    const root = await checkoutWith({
      "package.json": JSON.stringify({ name: "solo" }),
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const report = await analyzeEncapsulation(root);
    expect(report.units.every((unit) => unit.complexity === 0)).toBe(true);
  });

  it("treats a nested package.json exports map as the public entry", async () => {
    const root = await checkoutWith({
      "apps/app/package.json": JSON.stringify({ name: "@x/app" }),
      "apps/app/src/main.ts": `import { ok } from "@x/lib";\nexport const n = ok;\n`,
      "packages/lib/package.json": JSON.stringify({
        name: "@x/lib",
        exports: { ".": { import: "./dist/index.js" } },
      }),
      "packages/lib/src/index.ts": `export const ok = 1;\n`,
    });
    const report = await analyzeEncapsulation(root);
    expect(unitAt(report.units, "packages/lib/src/index.ts").complexity).toBe(0);
    expect(unitAt(report.units, "apps/app/src/main.ts").complexity).toBe(0);
  });
});

describe("analyzePropagationCost", () => {
  it("scores a disconnected pair as 0", async () => {
    const root = await checkoutWith({
      "src/a.ts": `export const a = 1;\n`,
      "src/b.ts": `export const b = 2;\n`,
    });
    const report = await analyzePropagationCost(root);
    expect(report.score).toBe(0);
    expect(unitAt(report.units, "src/a.ts").complexity).toBe(0);
    expect(unitAt(report.units, "src/b.ts").complexity).toBe(0);
  });

  it("gives the importer 100 visibility in a two-file chain", async () => {
    const root = await checkoutWith({
      "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
      "src/b.ts": `export const b = 1;\n`,
    });
    const report = await analyzePropagationCost(root);
    expect(unitAt(report.units, "src/a.ts").complexity).toBe(100);
    expect(unitAt(report.units, "src/b.ts").complexity).toBe(0);
    expect(report.score).toBe(50);
  });
});

describe("skipPaths", () => {
  const vendoredCheckout = {
    "apps/app/package.json": JSON.stringify({ name: "@x/app" }),
    "apps/app/src/main.ts": `import { secret } from "@x/alpha/src/internal.js";\nexport function page() {\n  return secret();\n}\n`,
    "packages/alpha/package.json": JSON.stringify({ name: "@x/alpha" }),
    "packages/alpha/src/index.ts": `export const ok = 1;\n`,
    "packages/alpha/src/internal.ts": `export function secret() {\n  if (true) return 2;\n  return 0;\n}\n`,
  };

  it("drops structure-grain-skipped trees, so edges into them stop resolving", async () => {
    const root = await checkoutWith({
      ...vendoredCheckout,
      ".mensura/config.json": JSON.stringify({
        skipPaths: [{ path: "packages/alpha", grains: ["structure"] }],
      }),
    });
    const graph = await buildImportGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual(["apps/app/src/main.ts"]);
    expect(graph.edges).toEqual([]);
  });

  it("keeps function-grain-skipped trees visible to the import graph", async () => {
    const root = await checkoutWith({
      ...vendoredCheckout,
      ".mensura/config.json": JSON.stringify({
        skipPaths: [{ path: "packages/alpha", grains: ["function"] }],
      }),
    });
    const graph = await buildImportGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual([
      "apps/app/src/main.ts",
      "packages/alpha/src/index.ts",
      "packages/alpha/src/internal.ts",
    ]);
    const leaks = await analyzeEncapsulation(root);
    expect(unitAt(leaks.units, "packages/alpha/src/internal.ts").complexity).toBe(1);
  });

  it("excludes all-grains rules from every metric's walk", async () => {
    const root = await checkoutWith({
      ...vendoredCheckout,
      ".mensura/config.json": JSON.stringify({ skipPaths: ["packages/alpha/**"] }),
    });
    const graph = await buildImportGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual(["apps/app/src/main.ts"]);
    const leaks = await analyzeEncapsulation(root);
    expect(
      leaks.units.filter((unit) => unit.path.startsWith("packages/alpha")),
    ).toEqual([]);
  });
});
