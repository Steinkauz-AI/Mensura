import { describe, expect, it } from "vitest";
import { diffComplexity } from "../../src/metrics/cyclomatic-complexity/diff.js";
import type {
  ComplexityReport,
  ComplexityUnit,
  ComplexityUnitKind,
} from "../../src/metrics/cyclomatic-complexity/index.js";

function unit(
  path: string,
  name: string,
  complexity: number,
  startLine = 1,
  kind: ComplexityUnitKind = "function",
): ComplexityUnit {
  return { path, name, kind, startLine, endLine: startLine + 1, complexity };
}

function report(units: ComplexityUnit[]): ComplexityReport {
  return { units, files: [], unparsed: [] };
}

describe("diffComplexity", () => {
  it("is empty for identical reports", () => {
    const a = report([unit("src/a.ts", "fn", 3)]);
    expect(diffComplexity(a, a)).toEqual({
      added: [],
      removed: [],
      changed: [],
      totalDelta: 0,
    });
  });

  it("reports a changed unit with before, after, and delta", () => {
    const before = report([unit("src/a.ts", "fn", 3)]);
    const after = report([unit("src/a.ts", "fn", 7, 5)]);
    const diff = diffComplexity(before, after);
    expect(diff.changed).toEqual([
      { path: "src/a.ts", name: "fn", startLine: 5, before: 3, after: 7, delta: 4 },
    ]);
    expect(diff.totalDelta).toBe(4);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("reports added and removed units", () => {
    const before = report([unit("src/a.ts", "gone", 2), unit("src/b.ts", "same", 4)]);
    const after = report([unit("src/b.ts", "same", 4), unit("src/b.ts", "new", 1)]);
    const diff = diffComplexity(before, after);
    expect(diff.added).toEqual([
      { path: "src/b.ts", name: "new", startLine: 1, complexity: 1 },
    ]);
    expect(diff.removed).toEqual([
      { path: "src/a.ts", name: "gone", complexity: 2 },
    ]);
    expect(diff.changed).toEqual([]);
    expect(diff.totalDelta).toBe(0);
  });

  it("pairs duplicate names in a file by order of appearance", () => {
    const before = report([
      unit("src/a.ts", "dup", 2, 1),
      unit("src/a.ts", "dup", 5, 10),
    ]);
    const after = report([
      unit("src/a.ts", "dup", 2, 1),
      unit("src/a.ts", "dup", 9, 10),
    ]);
    const diff = diffComplexity(before, after);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]).toMatchObject({ before: 5, after: 9, startLine: 10 });
  });

  it("distinguishes same name with different kinds", () => {
    const before = report([unit("src/a.ts", "dup", 3, 1, "method")]);
    const after = report([unit("src/a.ts", "dup", 3, 1, "function")]);
    const diff = diffComplexity(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.changed).toEqual([]);
  });

  it("produces sorted, deterministic output for shuffled input", () => {
    const before = report([
      unit("src/b.ts", "z", 1),
      unit("src/a.ts", "y", 2),
    ]);
    const after = report([
      unit("src/a.ts", "y", 5),
      unit("src/b.ts", "z", 9),
    ]);
    const first = diffComplexity(before, after);
    const second = diffComplexity(
      report([...before.units].reverse()),
      report([...after.units].reverse()),
    );
    expect(first.changed.map((c) => c.name)).toEqual(["y", "z"]);
    expect(first).toEqual(second);
  });
});
