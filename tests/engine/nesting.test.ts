import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeNestingDepth } from "../../src/metrics/nesting-depth/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nesting-"));
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

describe("analyzeNestingDepth", () => {
  it("scores an empty function as 0", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    expect(unitNamed(await analyzeNestingDepth(root), "empty").complexity).toBe(0);
  });

  it("scores a single if as 1", async () => {
    const root = await checkoutWith({
      "src/branch.ts": `
        export function branch(x: number) {
          if (x > 0) return 1;
          return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "branch").complexity).toBe(1);
  });

  it("does not deepen an else-if chain", async () => {
    const root = await checkoutWith({
      "src/ladder.ts": `
        export function ladder(x: number) {
          if (x > 0) return 1;
          else if (x < 0) return -1;
          else return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "ladder").complexity).toBe(1);
  });

  it("counts a switch as 1, not per case", async () => {
    const root = await checkoutWith({
      "src/sw.ts": `
        export function sw(x: number) {
          switch (x) {
            case 1: return "a";
            case 2: return "b";
            default: return "z";
          }
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "sw").complexity).toBe(1);
  });

  it("takes the maximum of nested control flow", async () => {
    const root = await checkoutWith({
      "src/nested.ts": `
        export function nested(condition1: boolean, condition2: boolean) {
          if (condition1) {
            for (let i = 0; i < 10; i++) {
              while (condition2) {
                break;
              }
            }
          }
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "nested").complexity).toBe(3);
  });

  it("nests structures inside else the same as inside if", async () => {
    const root = await checkoutWith({
      "src/elsed.ts": `
        export function elsed(a: boolean, b: boolean) {
          if (a) {
            return 1;
          } else {
            if (b) return 2;
            return 0;
          }
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "elsed").complexity).toBe(2);
  });

  it("scores nested functions as their own units starting at 0", async () => {
    const root = await checkoutWith({
      "src/inner.ts": `
        export function outer() {
          const inner = () => {
            if (true) return 1;
            return 0;
          };
          return inner();
        }
      `,
    });
    const report = await analyzeNestingDepth(root);
    expect(unitNamed(report, "outer").complexity).toBe(0);
    expect(unitNamed(report, "inner").complexity).toBe(1);
  });

  it("does not count logical operators or extra braces as nesting", async () => {
    const root = await checkoutWith({
      "src/flat.ts": `
        export function flat(a: boolean, b: boolean) {
          {
            return a && b || a;
          }
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "flat").complexity).toBe(0);
  });

  it("does not deepen for try or finally, but does for catch", async () => {
    const root = await checkoutWith({
      "src/caught.ts": `
        export function caught(condition1: boolean, condition2: boolean) {
          try {
            if (condition1) return;
          } catch {
            if (condition2) {
              return;
            }
          } finally {
            if (condition1) return;
          }
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "caught").complexity).toBe(2);
  });

  it("counts a ternary, and nested ternaries go deeper", async () => {
    const root = await checkoutWith({
      "src/tern.ts": `
        export function tern(a: boolean, b: boolean) {
          return a ? (b ? 1 : 2) : 0;
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "tern").complexity).toBe(2);
  });

  it("reports the max depth, not a sum of sequential branches", async () => {
    const root = await checkoutWith({
      "src/seq.ts": `
        export function seq(a: boolean, b: boolean, c: boolean) {
          if (a) return 1;
          if (b) return 2;
          if (c) return 3;
          return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeNestingDepth(root), "seq").complexity).toBe(1);
  });
});
