import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseMensuraArgs } from "../../src/cli/args.js";
import { formatComplexityView } from "../../src/cli/format/complexity.js";
import { ensureMensuraConfig, parseMensuraConfig, defaultMensuraConfig } from "../../src/core/config/index.js";
import { latestSnapshot } from "../../src/core/snapshot.js";
import {
  analyzeComplexity,
  analyzeCognitiveComplexity,
  analyzeNestingDepth,
  ensureBuiltinMetrics,
} from "../../src/index.js";
import { writeStream } from "../../src/cli/shell/io.js";
import { scaleFor } from "../../src/cli/format/index.js";

const dirs: string[] = [];

beforeAll(async () => {
  await ensureBuiltinMetrics();
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkout(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coverage-gaps-"));
  dirs.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  await writeFile(join(root, "src", "loops.ts"), source);
  return root;
}

describe("coverage gap closures", () => {
  it("maps snapshot show missing ref to a usage error", () => {
    expect(() => parseMensuraArgs(["snapshot", "show"], process.cwd())).toThrow(
      /needs a metric id and a snapshot ref/,
    );
    expect(() => parseMensuraArgs(["snapshot", "show", "cyclomatic-complexity"], process.cwd())).toThrow(
      /needs a snapshot ref/,
    );
  });

  it("serializes and parses grain-scoped skip paths", () => {
    const parsed = parseMensuraConfig(
      {
        skipPaths: [{ path: "packages/beta", grains: ["function"] }],
        metrics: defaultMensuraConfig().metrics,
      },
      "test",
    );
    expect(parsed.skipPaths[0]?.grains).toEqual(["function"]);
  });

  it("returns undefined for latest on an empty snapshot store", async () => {
    const root = await checkout("export function x() {}\n");
    expect(await latestSnapshot({ root, metric: "cyclomatic-complexity" })).toBeUndefined();
  });

  it("loads config through ensureMensuraConfig", async () => {
    const root = await checkout("export function x() {}\n");
    const config = await ensureMensuraConfig(root);
    expect(config.metrics["cyclomatic-complexity"]?.threshold).toBe(20);
  });

  it("runs index export analyzers", async () => {
    const root = await checkout("export function x() { return 1; }\n");
    expect((await analyzeComplexity(root)).units.length).toBeGreaterThan(0);
    expect((await analyzeCognitiveComplexity(root)).units.length).toBeGreaterThan(0);
    expect((await analyzeNestingDepth(root)).units.length).toBeGreaterThan(0);
  });

  it("scores do and for-in/of loops in cognitive and nesting metrics", async () => {
    const root = await checkout(`
export function loops(items: number[]) {
  let sum = 0;
  do { sum += 1; } while (sum < 1);
  for (const x in items) sum += Number(x);
  for (const y of items) sum += y;
  return sum;
}
`);
    expect((await analyzeCognitiveComplexity(root)).units[0]!.complexity).toBeGreaterThan(0);
    expect((await analyzeNestingDepth(root)).units[0]!.complexity).toBeGreaterThan(0);
  });

  it("renders unparsed files in complexity output", () => {
    const config = defaultMensuraConfig();
    const text = formatComplexityView(
      {
        units: [{ path: "src/a.ts", name: "fn", kind: "function", startLine: 1, endLine: 2, complexity: 1 }],
        files: [{ path: "src/a.ts", functionCount: 1, minComplexity: 1, maxComplexity: 1, sumComplexity: 1 }],
        unparsed: [{ path: "src/broken.ts", errorCount: 2 }],
      },
      {
        root: "/tmp/x",
        at: new Date(0),
        color: false,
        title: "Test",
        metric: "cyclomatic-complexity",
        config,
        scale: scaleFor("cyclomatic-complexity", config),
        direction: "higher-worse",
      },
    );
    expect(text).toContain("Unparseable files");
    expect(text).toContain("src/broken.ts");
  });

  it("detects write streams for ink rendering", () => {
    expect(writeStream({ write() {}, isTTY: true })).toBeUndefined();
    expect(writeStream(process.stdout)).toBe(process.stdout);
  });
});
