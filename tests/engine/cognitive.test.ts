import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeCognitiveComplexity } from "../../src/metrics/cognitive-complexity/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cognitive-"));
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

describe("analyzeCognitiveComplexity", () => {
  it("scores an empty function as 0", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "empty").complexity).toBe(0);
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
    expect(unitNamed(await analyzeCognitiveComplexity(root), "branch").complexity).toBe(1);
  });

  it("counts if, else-if, and else without nesting the chain", async () => {
    const root = await checkoutWith({
      "src/ladder.ts": `
        export function ladder(x: number) {
          if (x > 0) return 1;
          else if (x < 0) return -1;
          else return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "ladder").complexity).toBe(3);
  });

  it("adds 1 for a whole switch, not per case", async () => {
    const root = await checkoutWith({
      "src/sw.ts": `
        export function getWords(number: number) {
          switch (number) {
            case 1: return "one";
            case 2: return "a couple";
            case 3: return "a few";
            default: return "lots";
          }
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "getWords").complexity).toBe(1);
  });

  it("adds a nesting increment for nested flow-break structures", async () => {
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
    expect(unitNamed(await analyzeCognitiveComplexity(root), "nested").complexity).toBe(6);
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
    expect(unitNamed(await analyzeCognitiveComplexity(root), "elsed").complexity).toBe(4);
  });

  it("scores nested functions as their own units starting at nesting 0", async () => {
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
    const report = await analyzeCognitiveComplexity(root);
    expect(unitNamed(report, "outer").complexity).toBe(0);
    expect(unitNamed(report, "inner").complexity).toBe(1);
  });

  it("adds 1 per sequence of like boolean operators, not per operator", async () => {
    const root = await checkoutWith({
      "src/logic.ts": `
        export function same(a: boolean, b: boolean, c: boolean, d: boolean) {
          return a && b && c && d;
        }
        export function mixed(a: boolean, b: boolean, c: boolean, d: boolean) {
          return a && b || c && d;
        }
      `,
    });
    const report = await analyzeCognitiveComplexity(root);
    expect(unitNamed(report, "same").complexity).toBe(1);
    expect(unitNamed(report, "mixed").complexity).toBe(3);
  });

  it("treats && inside a negation as a separate sequence", async () => {
    const root = await checkoutWith({
      "src/not.ts": `
        export function gated(a: boolean, b: boolean, c: boolean) {
          if (a && !(b && c)) return 1;
          return 0;
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "gated").complexity).toBe(3);
  });

  it("flattens parenthesized mixed operators into one chain of sequences", async () => {
    const root = await checkoutWith({
      "src/parens.ts": `
        export function grouped(a: boolean, b: boolean, c: boolean) {
          return a && (b || c);
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "grouped").complexity).toBe(2);
  });

  it("ignores null-coalescing operators", async () => {
    const root = await checkoutWith({
      "src/nullish.ts": `
        export function nullish(a: unknown, b: unknown, c: unknown) {
          return a ?? b ?? c;
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "nullish").complexity).toBe(0);
  });

  it("adds 1 for catch and nested structures inside it, but not for try or finally", async () => {
    const root = await checkoutWith({
      "src/caught.ts": `
        export function caught(condition1: boolean, condition2: boolean) {
          try {
            if (condition1) {
              for (let i = 0; i < 10; i++) {
                while (condition2) {
                  break;
                }
              }
            }
          } catch {
            if (condition2) {
              return;
            }
          } finally {
            return;
          }
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "caught").complexity).toBe(9);
  });

  it("adds 1 for a labeled continue on top of the nested loops and if", async () => {
    const root = await checkoutWith({
      "src/primes.ts": `
        export function sumOfPrimes(max: number) {
          let total = 0;
          OUT: for (let i = 1; i <= max; ++i) {
            for (let j = 2; j < i; ++j) {
              if (i % j === 0) {
                continue OUT;
              }
            }
            total += i;
          }
          return total;
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "sumOfPrimes").complexity).toBe(7);
  });

  it("adds 1 once for direct recursion", async () => {
    const root = await checkoutWith({
      "src/fact.ts": `
        export function fact(n: number): number {
          if (n <= 1) return 1;
          return n * fact(n - 1);
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "fact").complexity).toBe(2);
  });

  it("adds 1 for a ternary, plus nesting for a nested ternary", async () => {
    const root = await checkoutWith({
      "src/tern.ts": `
        export function tern(a: boolean, b: boolean) {
          return a ? (b ? 1 : 2) : 0;
        }
      `,
    });
    expect(unitNamed(await analyzeCognitiveComplexity(root), "tern").complexity).toBe(3);
  });

  it("rolls cognitive scores up per file from zero", async () => {
    const root = await checkoutWith({
      "src/a.ts": `
        export function one() {}
        export function two(x: number) { if (x) return 1; return 0; }
      `,
    });
    const report = await analyzeCognitiveComplexity(root);
    expect(report.files).toEqual([
      {
        path: "src/a.ts",
        functionCount: 2,
        minComplexity: 0,
        maxComplexity: 1,
        sumComplexity: 1,
      },
    ]);
  });
});
