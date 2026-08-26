import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  mergeCoverageMaps,
  statementsFromIstanbul,
  toCheckoutPath,
} from "../../src/metrics/test-coverage/istanbul.js";

const root = join("/repo");

function istanbulFile(
  rel: string,
  statements: Array<{ line: number; hits: number }>,
): Record<string, unknown> {
  const statementMap: Record<string, { start: { line: number } }> = {};
  const s: Record<string, number> = {};
  statements.forEach((entry, index) => {
    statementMap[String(index)] = { start: { line: entry.line } };
    s[String(index)] = entry.hits;
  });
  return { path: join(root, rel), statementMap, s };
}

describe("toCheckoutPath", () => {
  it("returns a posix relative path inside the checkout", () => {
    expect(toCheckoutPath(root, join(root, "src/a.ts"))).toBe("src/a.ts");
    expect(toCheckoutPath(root, "src/b.ts")).toBe("src/b.ts");
  });

  it("returns null for paths outside the checkout", () => {
    expect(toCheckoutPath(root, "/elsewhere/file.ts")).toBeNull();
  });
});

describe("statementsFromIstanbul", () => {
  it("returns an empty map for non-object input", () => {
    expect(statementsFromIstanbul(root, null).size).toBe(0);
  });

  it("skips entries with invalid shapes or out-of-root paths", () => {
    const map = statementsFromIstanbul(root, {
      bad: { path: join(root, "src/missing-map.ts") },
      outside: { path: "/outside/file.ts", statementMap: { "0": { start: { line: 1 } } }, s: { "0": 1 } },
    });
    expect(map.size).toBe(0);
  });

  it("parses statement hits and merges duplicate lines by max hits", () => {
    const map = statementsFromIstanbul(root, {
      [join(root, "src/a.ts")]: istanbulFile("src/a.ts", [
        { line: 1, hits: 2 },
        { line: 2, hits: 0 },
      ]),
      relKey: {
        path: join(root, "src/a.ts"),
        statementMap: { "0": { start: { line: 2 } }, "1": { start: { line: 3 } } },
        s: { "0": 5, "1": "bad" },
      },
    });
    expect(map.get("src/a.ts")).toEqual([
      { startLine: 1, hits: 2 },
      { startLine: 2, hits: 5 },
      { startLine: 3, hits: 0 },
    ]);
  });
});

describe("mergeCoverageMaps", () => {
  it("merges file maps using max hits per line", () => {
    const into = new Map([
      ["src/a.ts", [{ startLine: 1, hits: 1 }, { startLine: 2, hits: 0 }]],
    ]);
    const from = new Map([
      ["src/a.ts", [{ startLine: 2, hits: 3 }]],
      ["src/b.ts", [{ startLine: 1, hits: 4 }]],
    ]);
    mergeCoverageMaps(into, from);
    expect(into.get("src/a.ts")).toEqual([
      { startLine: 1, hits: 1 },
      { startLine: 2, hits: 3 },
    ]);
    expect(into.get("src/b.ts")).toEqual([{ startLine: 1, hits: 4 }]);
  });
});
