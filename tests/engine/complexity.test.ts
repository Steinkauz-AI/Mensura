import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeComplexity } from "../../src/metrics/cyclomatic-complexity/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/metrics/cyclomatic-complexity/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "complexity-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

function unitNamed(report: ComplexityReport, name: string): ComplexityUnit {
  const match = report.units.filter((unit) => unit.name === name);
  expect(match, `expected exactly one unit named ${name}`).toHaveLength(1);
  return match[0]!;
}

describe("analyzeComplexity", () => {
  it("scores an empty function as 1", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    const report = await analyzeComplexity(root);
    expect(unitNamed(report, "empty").complexity).toBe(1);
  });

  it("adds 1 for a single if", async () => {
    const root = await checkoutWith({
      "src/branch.ts": `
        export function branch(x: number) {
          if (x > 0) return 1;
          return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "branch").complexity).toBe(2);
  });

  it("counts else-if but not else", async () => {
    const root = await checkoutWith({
      "src/ladder.ts": `
        export function ladder(x: number) {
          if (x > 0) return 1;
          else if (x < 0) return -1;
          else return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "ladder").complexity).toBe(3);
  });

  it("adds 1 per switch case", async () => {
    const root = await checkoutWith({
      "src/sw.ts": `
        export function sw(x: number) {
          switch (x) {
            case 1: return "a";
            case 2: return "b";
            case 3: return "c";
            default: return "z";
          }
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "sw").complexity).toBe(4);
  });

  it("counts nested functions as their own units", async () => {
    const root = await checkoutWith({
      "src/nested.ts": `
        export function outer() {
          const inner = () => {
            if (true) return 1;
            return 0;
          };
          return inner();
        }
      `,
    });
    const report = await analyzeComplexity(root);
    expect(unitNamed(report, "outer").complexity).toBe(1);
    expect(unitNamed(report, "inner").complexity).toBe(2);
  });

  it("adds 1 for each && and ||", async () => {
    const root = await checkoutWith({
      "src/logic.ts": `
        export function logic(a: boolean, b: boolean, c: boolean) {
          return a && b || c;
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "logic").complexity).toBe(3);
  });

  it("adds 1 for each ??", async () => {
    const root = await checkoutWith({
      "src/nullish.ts": `
        export function nullish(a: unknown, b: unknown, c: unknown) {
          return a ?? b ?? c;
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "nullish").complexity).toBe(3);
  });

  it("records each unit's line span", async () => {
    const root = await checkoutWith({
      "src/span.ts": `export function span(x: number) {\n  if (x) return 1;\n  return 0;\n}\n`,
    });
    const unit = unitNamed(await analyzeComplexity(root), "span");
    expect(unit.startLine).toBe(1);
    expect(unit.endLine).toBe(4);
  });

  it("lists files the parser cannot fully parse while measuring the rest", async () => {
    const root = await checkoutWith({
      "src/ok.ts": "export function ok() { if (true) return 1; return 0; }\n",
      "src/broken.ts": "export function broken( {\n  return 1\n",
    });
    const report = await analyzeComplexity(root);
    expect(unitNamed(report, "ok").complexity).toBe(2);
    expect(report.unparsed).toEqual([
      { path: "src/broken.ts", errorCount: expect.any(Number) },
    ]);
    expect(report.unparsed[0]!.errorCount).toBeGreaterThan(0);
  });

  it("adds 1 for loops, catch, and ternary", async () => {
    const root = await checkoutWith({
      "src/misc.ts": `
        export function misc(xs: number[]) {
          let n = 0;
          for (const x of xs) n += x;
          while (n > 10) n--;
          do { n++; } while (n < 0);
          try { n += 1; } catch { n = 0; }
          return n > 0 ? n : 0;
        }
      `,
    });
    expect(unitNamed(await analyzeComplexity(root), "misc").complexity).toBe(6);
  });

  it("names class members and arrows from their bindings", async () => {
    const root = await checkoutWith({
      "src/cls.ts": `
        export class Box {
          constructor() {}
          get value() { return 1; }
          set value(_n: number) {}
          add(n: number) { if (n) return n; return 0; }
        }
        export const listed = (n: number) => n;
      `,
    });
    const report = await analyzeComplexity(root);
    expect(unitNamed(report, "constructor").kind).toBe("constructor");
    expect(
      report.units.filter((unit) => unit.name === "value").map((unit) => unit.kind),
    ).toEqual(["getter", "setter"]);
    expect(unitNamed(report, "add").kind).toBe("method");
    expect(unitNamed(report, "add").complexity).toBe(2);
    expect(unitNamed(report, "listed").kind).toBe("arrow");
  });

  it("names function expressions by their binding, not their inner name", async () => {
    const root = await checkoutWith({
      "src/bound.ts": `
        const named = function inner() { return 1; };
        let assigned;
        assigned = () => 2;
      `,
    });
    const report = await analyzeComplexity(root);
    expect(unitNamed(report, "named").complexity).toBe(1);
    expect(unitNamed(report, "assigned").kind).toBe("arrow");
    expect(report.units.some((unit) => unit.name === "inner")).toBe(false);
  });

  it("walks any checkout and skips generated trees and declaration files", async () => {
    const root = await checkoutWith({
      "src/app.ts": "export function app() {}\n",
      "dist/app.ts": "export function built() { if (true) return 1; }\n",
      "node_modules/lib/index.ts": "export function dep() { if (true) return 1; }\n",
      "src/types.d.ts": "export function ambient(): void;\n",
    });
    const names = (await analyzeComplexity(root)).units.map((unit) => unit.name);
    expect(names).toEqual(["app"]);
  });

  it("skips extra directories named in the checkout's .mensura/config.json", async () => {
    const root = await checkoutWith({
      "src/app.ts": "export function app() {}\n",
      "apps/docs/public/_generated/ui.js":
        "export function generated() { if (true) return 1; }\n",
      ".mensura/config.json": JSON.stringify({
        skipDirectories: ["_generated"],
      }),
    });
    const names = (await analyzeComplexity(root)).units.map((unit) => unit.name);
    expect(names).toEqual(["app"]);
  });

  it("skips path-scoped trees without touching same-basename directories elsewhere", async () => {
    const root = await checkoutWith({
      "packages/alpha/src/widget.tsx": `
        export function Widget() {
          if (Math.random() > 0.5) return 1;
          return 0;
        }
      `,
      "apps/web/components/alpha/card.ts": `
        export function Card() {
          if (true) return 1;
          return 0;
        }
      `,
      ".mensura/config.json": JSON.stringify({
        skipPaths: ["packages/alpha/**"],
      }),
    });
    const report = await analyzeComplexity(root);
    expect(report.units.map((unit) => unit.name)).toEqual(["Card"]);
    expect(report.files.map((file) => file.path)).toEqual([
      "apps/web/components/alpha/card.ts",
    ]);
  });

  it("honors grain-scoped skipPaths for the function grain", async () => {
    const root = await checkoutWith({
      "packages/alpha/src/widget.tsx": "export function Widget() {}\n",
      "apps/web/src/page.tsx": "export function Page() {}\n",
      ".mensura/config.json": JSON.stringify({
        skipPaths: [{ path: "packages/alpha", grains: ["function"] }],
      }),
    });
    const report = await analyzeComplexity(root);
    expect(report.units.map((unit) => unit.name)).toEqual(["Page"]);
  });

  it("keeps files whose paths merely start with the same characters", async () => {
    const root = await checkoutWith({
      "packages/alpha-x/slider.ts": "export function Slider() {}\n",
      ".mensura/config.json": JSON.stringify({ skipPaths: ["packages/alpha"] }),
    });
    const names = (await analyzeComplexity(root)).units.map((unit) => unit.name);
    expect(names).toEqual(["Slider"]);
  });

  it("does not measure files inside .mensura", async () => {
    const root = await checkoutWith({
      "src/app.ts": "export function app() {}\n",
      ".mensura/scratch.ts": "export function local() { if (true) return 1; }\n",
    });
    expect((await analyzeComplexity(root)).units.map((unit) => unit.name)).toEqual(
      ["app"],
    );
  });

  it("ignores languages it cannot parse instead of failing the checkout", async () => {
    const root = await checkoutWith({
      "src/app.ts": "export function app() {}\n",
      "src/app.py": "def app():\n    if True:\n        return 1\n",
      "README.md": "# hello\n",
    });
    const report = await analyzeComplexity(root);
    expect(report.units.map((unit) => unit.name)).toEqual(["app"]);
  });

  it("parses JavaScript in a target checkout with the same rules", async () => {
    const root = await checkoutWith({
      "lib/util.js": `
        export function util(x) {
          if (x) return 1;
          return 0;
        }
      `,
    });
    const unit = unitNamed(await analyzeComplexity(root), "util");
    expect(unit.path).toBe("lib/util.js");
    expect(unit.complexity).toBe(2);
  });

  it("rolls complexity up per file", async () => {
    const root = await checkoutWith({
      "src/a.ts": `
        export function one() {}
        export function two(x: number) { if (x) return 1; return 0; }
      `,
      "src/b.ts": "export function three() {}\n",
    });
    const report = await analyzeComplexity(root);
    const a = report.files.find((file) => file.path === "src/a.ts");
    const b = report.files.find((file) => file.path === "src/b.ts");
    expect(a).toEqual({
      path: "src/a.ts",
      functionCount: 2,
      minComplexity: 1,
      maxComplexity: 2,
      sumComplexity: 3,
    });
    expect(b).toEqual({
      path: "src/b.ts",
      functionCount: 1,
      minComplexity: 1,
      maxComplexity: 1,
      sumComplexity: 1,
    });
  });

  it("ignores overload signatures and counts only the implementation", async () => {
    const root = await checkoutWith({
      "src/over.ts": `
        export function overloaded(x: number): number;
        export function overloaded(x: string): string;
        export function overloaded(x: number | string) {
          return x;
        }
      `,
    });
    const report = await analyzeComplexity(root);
    expect(report.units.filter((unit) => unit.name === "overloaded")).toHaveLength(1);
    expect(unitNamed(report, "overloaded").complexity).toBe(1);
  });

  it("limits analysis to include paths when given", async () => {
    const root = await checkoutWith({
      "src/keep.ts": "export function keep() {}\n",
      "src/drop.ts": "export function drop() {}\n",
    });
    const report = await analyzeComplexity(root, { include: ["src/keep.ts"] });
    expect(report.units.map((unit) => unit.name)).toEqual(["keep"]);
  });
});
