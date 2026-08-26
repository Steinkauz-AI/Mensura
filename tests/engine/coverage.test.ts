import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeCoverage } from "../../src/metrics/test-coverage/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coverage-"));
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

async function writeIstanbul(
  root: string,
  files: Record<string, Array<{ line: number; hits: number }>>,
  artifactRel = "coverage/coverage-final.json",
): Promise<void> {
  const report: Record<string, unknown> = {};
  for (const [rel, statements] of Object.entries(files)) {
    const abs = join(root, rel);
    const statementMap: Record<string, { start: { line: number; column: number }; end: { line: number; column: number } }> =
      {};
    const s: Record<string, number> = {};
    statements.forEach((statement, index) => {
      statementMap[String(index)] = {
        start: { line: statement.line, column: 0 },
        end: { line: statement.line, column: 8 },
      };
      s[String(index)] = statement.hits;
    });
    report[abs] = { path: abs, statementMap, s, fnMap: {}, f: {}, branchMap: {}, b: {} };
  }
  const artifact = join(root, artifactRel);
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(artifact, `${JSON.stringify(report)}\n`);
}

describe("analyzeCoverage", () => {
  it("throws when no coverage-final.json exists in the checkout", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    await expect(analyzeCoverage(root)).rejects.toThrow(/coverage-final\.json/);
  });

  it("scores 100 when every statement in the function was hit", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function covered() {\n  return 1;\n}\n",
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 3 },
      ],
    });
    expect(unitNamed(await analyzeCoverage(root), "covered").complexity).toBe(100);
  });

  it("scores the hit ratio when some statements were missed", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function mixed() {\n  return 1;\n}\n",
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 0 },
      ],
    });
    expect(unitNamed(await analyzeCoverage(root), "mixed").complexity).toBe(50);
  });

  it("scores 0 when the source file is missing from the coverage map", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function uncovered() {\n  return 1;\n}\n",
      "src/other.ts": "export function other() {\n  return 2;\n}\n",
    });
    await writeIstanbul(root, {
      "src/other.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
      ],
    });
    expect(unitNamed(await analyzeCoverage(root), "uncovered").complexity).toBe(0);
  });

  it("scores 100 for an instrumented function with no statements of its own", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function empty() {}\n",
    });
    await writeIstanbul(root, { "src/lib.ts": [] });
    expect(unitNamed(await analyzeCoverage(root), "empty").complexity).toBe(100);
  });

  it("does not attribute nested-function statements to the outer unit", async () => {
    const root = await checkoutWith({
      "src/lib.ts": [
        "export function outer() {",
        "  const inner = () => {",
        "    return 1;",
        "  };",
        "  return inner();",
        "}",
        "",
      ].join("\n"),
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
        { line: 3, hits: 0 },
        { line: 5, hits: 1 },
      ],
    });
    const report = await analyzeCoverage(root);
    expect(unitNamed(report, "outer").complexity).toBe(100);
    expect(unitNamed(report, "inner").complexity).toBe(50);
  });

  it("omits test files from the coverage report", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function prod() {\n  return 1;\n}\n",
      "src/lib.test.ts": "export function testHelper() {\n  return 1;\n}\n",
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
      ],
      "src/lib.test.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
      ],
    });
    const report = await analyzeCoverage(root);
    expect(report.units.map((unit) => unit.name)).toEqual(["prod"]);
  });

  it("discovers coverage-final.json under a nested package coverage folder", async () => {
    const root = await checkoutWith({
      "packages/core/src/lib.ts": "export function deep() {\n  return 1;\n}\n",
    });
    await writeIstanbul(
      root,
      {
        "packages/core/src/lib.ts": [
          { line: 1, hits: 1 },
          { line: 2, hits: 0 },
        ],
      },
      "packages/core/coverage/coverage-final.json",
    );
    expect(unitNamed(await analyzeCoverage(root), "deep").complexity).toBe(50);
  });

  it("merges statement hits across coverage-final.json files", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() {\n  return 1;\n}\n",
      "src/b.ts": "export function b() {\n  return 2;\n}\n",
    });
    await writeIstanbul(
      root,
      {
        "src/a.ts": [
          { line: 1, hits: 1 },
          { line: 2, hits: 1 },
        ],
      },
      "packages/a/coverage/coverage-final.json",
    );
    await writeIstanbul(
      root,
      {
        "src/b.ts": [
          { line: 1, hits: 0 },
          { line: 2, hits: 0 },
        ],
      },
      "packages/b/coverage/coverage-final.json",
    );
    const report = await analyzeCoverage(root);
    expect(unitNamed(report, "a").complexity).toBe(100);
    expect(unitNamed(report, "b").complexity).toBe(0);
  });
});
