import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeHalstead } from "../../src/metrics/halstead/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "halstead-"));
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


function fromCounts(n1: number, n2: number, N1: number, N2: number): {
  complexity: number;
  difficulty: number;
  effort: number;
} {
  const n = n1 + n2;
  const N = N1 + N2;
  const volume = n === 0 ? 0 : N * Math.log2(n);
  const difficulty = n2 === 0 ? 0 : (n1 / 2) * (N2 / n2);
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  return {
    complexity: round2(volume),
    difficulty: round2(difficulty),
    effort: round2(volume * difficulty),
  };
}

describe("analyzeHalstead", () => {
  it("scores an empty function from grouping operators only", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });

    expect(unitNamed(await analyzeHalstead(root), "empty")).toMatchObject(
      fromCounts(5, 0, 5, 0),
    );
  });

  it("gives a parameterless one-liner a volume around 20", async () => {
    const root = await checkoutWith({
      "src/one.ts": "export function f() { return 1; }\n",
    });

    const unit = unitNamed(await analyzeHalstead(root), "f");
    expect(unit).toMatchObject(fromCounts(6, 1, 6, 1));
    expect(unit.complexity).toBe(19.65);
  });

  it("ignores TypeScript type syntax so typed and untyped match", async () => {
    const root = await checkoutWith({
      "src/add.ts": `
        export function typed(a: number, b: number): number {
          return a + b;
        }
        export function untyped(a, b) {
          return a + b;
        }
      `,
    });
    const report = await analyzeHalstead(root);
    const typed = unitNamed(report, "typed");
    const untyped = unitNamed(report, "untyped");
    expect(typed.complexity).toBe(untyped.complexity);
    expect(typed.difficulty).toBe(untyped.difficulty);
    expect(typed.effort).toBe(untyped.effort);

    expect(typed).toMatchObject(fromCounts(8, 2, 8, 4));
  });

  it("does not include nested function bodies in the outer unit", async () => {
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
    const report = await analyzeHalstead(root);

    expect(unitNamed(report, "outer")).toMatchObject(fromCounts(8, 1, 10, 2));

    expect(unitNamed(report, "inner")).toMatchObject(fromCounts(7, 3, 10, 3));
  });

  it("scores add(a, b) from the same token inventory as the typed pair", async () => {
    const root = await checkoutWith({
      "src/add.ts": "export function add(a, b) { return a + b; }\n",
    });
    expect(unitNamed(await analyzeHalstead(root), "add")).toMatchObject(
      fromCounts(8, 2, 8, 4),
    );
  });

  it("stores volume on complexity so check and file rollup use the gated axis", async () => {
    const root = await checkoutWith({
      "src/a.ts": `
        export function one() { return 1; }
        export function two() {}
      `,
    });
    const report = await analyzeHalstead(root);
    const one = unitNamed(report, "one");
    const two = unitNamed(report, "two");
    expect(report.files).toEqual([
      {
        path: "src/a.ts",
        functionCount: 2,
        minComplexity: Math.min(one.complexity, two.complexity),
        maxComplexity: one.complexity,
        sumComplexity: one.complexity + two.complexity,
      },
    ]);
  });

  it("scores control flow and type sugar together through the checkout walk", async () => {
    const root = await checkoutWith({
      "src/mix.ts": `
        export function mix(a, b) {
          const c = a > 0 ? b as number : fallback(b);
          return c!;
        }
      `,
    });

    expect(unitNamed(await analyzeHalstead(root), "mix")).toMatchObject(
      fromCounts(13, 5, 15, 9),
    );
  });
});
