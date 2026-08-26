import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeMaintainability } from "../../src/metrics/maintainability-index/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "maintainability-"));
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


function microsoftIndex(volume: number, cyclomatic: number, loc: number): number {
  const V = Math.max(volume, 1);
  const L = Math.max(loc, 1);
  const raw = 171 - 5.2 * Math.log(V) - 0.23 * cyclomatic - 16.2 * Math.log(L);
  const scaled = (raw * 100) / 171;
  return Math.max(0, Math.min(100, Math.round(scaled * 100) / 100));
}

describe("analyzeMaintainability", () => {
  it("scores a one-line empty function from volume 11.61, CC 1, LOC 1", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    const unit = unitNamed(await analyzeMaintainability(root), "empty");
    expect(unit.volume).toBe(11.61);
    expect(unit.cyclomatic).toBe(1);
    expect(unit.loc).toBe(1);

    expect(unit.complexity).toBe(92.41);
    expect(unit.complexity).toBe(microsoftIndex(11.61, 1, 1));
  });

  it("does not let comments or blank lines change the index", async () => {
    const root = await checkoutWith({
      "src/pair.ts": `
        export function plain() {
          return 1;
        }
        export function commented() {


          return 1;
        }
      `,
    });
    const report = await analyzeMaintainability(root);
    const plain = unitNamed(report, "plain");
    const commented = unitNamed(report, "commented");
    expect(commented.loc).toBe(plain.loc);
    expect(commented.volume).toBe(plain.volume);
    expect(commented.cyclomatic).toBe(plain.cyclomatic);
    expect(commented.complexity).toBe(plain.complexity);
  });

  it("does not include nested function bodies in the outer unit's LOC", async () => {
    const root = await checkoutWith({
      "src/nested.ts": [
        "export function outer() {",
        "  const inner = () => {",
        "    if (true) return 1;",
        "    return 0;",
        "  };",
        "  return inner();",
        "}",
        "",
      ].join("\n"),
    });
    const report = await analyzeMaintainability(root);
    const outer = unitNamed(report, "outer");
    const inner = unitNamed(report, "inner");
    const outerSpan = outer.endLine - outer.startLine + 1;
    expect(outer.loc).toBeLessThan(outerSpan);
    expect(inner.loc).toBeGreaterThan(0);
    expect(outer.complexity).toBe(
      microsoftIndex(outer.volume!, outer.cyclomatic!, outer.loc!),
    );
    expect(inner.complexity).toBe(
      microsoftIndex(inner.volume!, inner.cyclomatic!, inner.loc!),
    );
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
    const report = await analyzeMaintainability(root);
    const typed = unitNamed(report, "typed");
    const untyped = unitNamed(report, "untyped");
    expect(typed.loc).toBe(untyped.loc);
    expect(typed.volume).toBe(untyped.volume);
    expect(typed.cyclomatic).toBe(untyped.cyclomatic);
    expect(typed.complexity).toBe(untyped.complexity);
  });

  it("scores a branchy function lower than an empty one", async () => {
    const root = await checkoutWith({
      "src/pair.ts": `
        export function empty() {}
        export function branchy(a: boolean, b: boolean, c: number) {
          let n = 0;
          if (a) {
            n += 1;
          } else if (b) {
            n += 2;
          }
          for (let i = 0; i < c; i++) {
            n += i;
          }
          if (n > 3 && a) {
            n += 10;
          }
          return n;
        }
      `,
    });
    const report = await analyzeMaintainability(root);
    const empty = unitNamed(report, "empty");
    const branchy = unitNamed(report, "branchy");
    expect(branchy.cyclomatic).toBeGreaterThan(empty.cyclomatic!);
    expect(branchy.loc).toBeGreaterThan(empty.loc!);
    expect(branchy.complexity).toBeLessThan(empty.complexity);
  });

  it("stores the index on complexity and rolls min/max/sum per file", async () => {
    const root = await checkoutWith({
      "src/a.ts": `
        export function one() { return 1; }
        export function two() {}
      `,
    });
    const report = await analyzeMaintainability(root);
    const one = unitNamed(report, "one");
    const two = unitNamed(report, "two");
    const lo = Math.min(one.complexity, two.complexity);
    const hi = Math.max(one.complexity, two.complexity);
    expect(report.files).toEqual([
      {
        path: "src/a.ts",
        functionCount: 2,
        minComplexity: lo,
        maxComplexity: hi,
        sumComplexity: one.complexity + two.complexity,
      },
    ]);
  });
});
