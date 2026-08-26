import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeCrap } from "../../src/metrics/crap/index.js";
import type { ComplexityReport, ComplexityUnit } from "../../src/lang/typescript/source/index.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "crap-"));
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

describe("analyzeCrap", () => {
  it("throws when no coverage-final.json exists in the checkout", async () => {
    const root = await checkoutWith({
      "src/empty.ts": "export function empty() {}\n",
    });
    await expect(analyzeCrap(root)).rejects.toThrow(/coverage-final\.json/);
  });

  it("scores 1 for a fully covered empty function (CC 1, coverage 100)", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function empty() {}\n",
    });
    await writeIstanbul(root, { "src/lib.ts": [] });
    const unit = unitNamed(await analyzeCrap(root), "empty");
    expect(unit.cyclomatic).toBe(1);
    expect(unit.coverage).toBe(100);

    expect(unit.complexity).toBe(1);
  });

  it("scores 2 for an uncovered empty function (CC 1, coverage 0)", async () => {
    const root = await checkoutWith({
      "src/lib.ts": "export function empty() {}\n",
      "src/other.ts": "export function other() {}\n",
    });
    await writeIstanbul(root, { "src/other.ts": [] });
    const unit = unitNamed(await analyzeCrap(root), "empty");
    expect(unit.cyclomatic).toBe(1);
    expect(unit.coverage).toBe(0);

    expect(unit.complexity).toBe(2);
  });

  it("scores 2.5 for CC 2 at 50% coverage", async () => {
    const root = await checkoutWith({
      "src/lib.ts": [
        "export function branch(x: number) {",
        "  if (x > 0) return 1;",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 0 },
      ],
    });
    const unit = unitNamed(await analyzeCrap(root), "branch");
    expect(unit.cyclomatic).toBe(2);
    expect(unit.coverage).toBe(50);

    expect(unit.complexity).toBe(2.5);
  });

  it("equals cyclomatic complexity when coverage is 100%", async () => {
    const root = await checkoutWith({
      "src/lib.ts": [
        "export function branch(x: number) {",
        "  if (x > 0) return 1;",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    });
    await writeIstanbul(root, {
      "src/lib.ts": [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
        { line: 3, hits: 1 },
      ],
    });
    const unit = unitNamed(await analyzeCrap(root), "branch");
    expect(unit.cyclomatic).toBe(2);
    expect(unit.coverage).toBe(100);
    expect(unit.complexity).toBe(2);
  });

  it("scores 30 for CC 5 at 0% coverage", async () => {
    const root = await checkoutWith({
      "src/lib.ts": [
        "export function many(a: boolean, b: boolean, c: boolean, d: boolean) {",
        "  if (a) return 1;",
        "  if (b) return 2;",
        "  if (c) return 3;",
        "  if (d) return 4;",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    });
    await writeIstanbul(root, {
      "src/other.ts": [],
    });
    const unit = unitNamed(await analyzeCrap(root), "many");
    expect(unit.cyclomatic).toBe(5);
    expect(unit.coverage).toBe(0);

    expect(unit.complexity).toBe(30);
  });

  it("omits test files from the CRAP report", async () => {
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
    const report = await analyzeCrap(root);
    expect(report.units.map((unit) => unit.name)).toEqual(["prod"]);
  });
});
