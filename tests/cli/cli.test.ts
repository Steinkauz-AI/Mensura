import { beforeAll, describe, expect, it } from "vitest";
import {
  ensureBuiltinMetrics,
  listMetrics,
  hashMetricInputs,
  ensureMensuraConfigFile,
} from "../../src/index.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runMensuraCli } from "../../src/cli/cli.js";
import { capture, checkout, seedSnapshotStore, type Capture } from "./helpers.js";

const METRIC = "cyclomatic-complexity";
const SIMPLE_TS = "export function simple() {\n  return 1;\n}\n";

beforeAll(async () => {
  await ensureBuiltinMetrics();
});

const FIXTURE: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", private: true }),
  "src/a.ts": SIMPLE_TS,
};

async function manifest(
  root: string,
  metric = METRIC,
): Promise<Array<{ file: string; timestamp: string }>> {
  return JSON.parse(
    await readFile(join(root, ".mensura", "metrics", metric, "manifest.json"), "utf8"),
  ) as Array<{ file: string; timestamp: string }>;
}

async function run(
  argv: string[],
  root: string,
  io: Capture = capture(),
): Promise<Capture & { code: number }> {
  const code = await runMensuraCli(argv, root, io.stdout, io.stderr, { NO_COLOR: "1" });
  return { ...io, code };
}

async function seedCoverage(root: string): Promise<void> {
  const abs = join(root, "src", "a.ts");
  const statementMap: Record<string, { start: { line: number; column: number }; end: { line: number; column: number } }> =
    {};
  const s: Record<string, number> = {};
  for (const [index, line] of [1, 2, 3].entries()) {
    statementMap[String(index)] = {
      start: { line, column: 0 },
      end: { line, column: 8 },
    };
    s[String(index)] = 1;
  }
  await mkdir(join(root, "coverage"), { recursive: true });
  await writeFile(
    join(root, "coverage", "coverage-final.json"),
    JSON.stringify({ [abs]: { path: abs, statementMap, s, fnMap: {}, f: {}, branchMap: {}, b: {} } }),
  );
}

describe("mensura usage and runtime errors", () => {
  it("unknown command exits 1 with the message on stderr and nothing on stdout", async () => {
    const result = await run(["nope"], process.cwd());
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Unknown command "nope"/);
    expect(result.out).toBe("");
  });

  it("a runtime failure exits 1 and puts the error message on stderr", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["snapshot", "show", METRIC, "latest"], root);
    expect(result.code).toBe(1);
    expect(result.err).toContain('No snapshot "latest"');
    expect(result.out).toBe("");
  });
});

describe("mensura help and list", () => {
  it("appends the status rollup to the help map", async () => {
    const root = await checkout(FIXTURE);
    const result = await run([], root);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(
      new RegExp(`0 up-to-date, 0 outdated, ${listMetrics().length} missing`),
    );
    expect(result.out).toContain("See mensura list.");
  });

  it("says status unavailable on help when .mensura/config.json cannot be parsed", async () => {
    const root = await checkout({ ...FIXTURE, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const result = await run(["--help"], root);
    expect(result.code).toBe(0);
    expect(result.out.trimEnd().endsWith("status unavailable. See mensura list.")).toBe(true);
  });

  it("list keeps every metric row with blank status when status is unavailable", async () => {
    const root = await checkout({ ...FIXTURE, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const result = await run(["list"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("cyclomatic-complexity");
    expect(result.out.trimEnd().endsWith("status unavailable")).toBe(true);
    expect(result.out).not.toContain("up-to-date");
  });
});

describe("mensura completion command", () => {
  it("prints the requested shell script followed by one newline and exits 0", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["completion", "zsh"], root);
    expect(result.code).toBe(0);
    expect(result.out.startsWith("#compdef mensura\n")).toBe(true);
    expect(result.out.endsWith("\n")).toBe(true);
    expect(result.out.endsWith("\n\n")).toBe(false);
  });

  it("does not create .mensura/config.json", async () => {
    const root = await checkout(FIXTURE);
    await run(["completion", "bash"], root);
    await expect(readFile(join(root, ".mensura", "config.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("mensura config file", () => {
  it("writes catalog defaults to .mensura/config.json when missing", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["list"], root);
    expect(result.code).toBe(0);
    const text = await readFile(join(root, ".mensura", "config.json"), "utf8");
    const parsed = JSON.parse(text) as {
      metrics: { "cyclomatic-complexity": { threshold: number } };
    };
    expect(parsed.metrics["cyclomatic-complexity"].threshold).toBe(20);
  });

  it("does not overwrite an existing config.json", async () => {
    const root = await checkout({
      ...FIXTURE,
      ".mensura/config.json": JSON.stringify({
        skipDirectories: ["keep-me"],
        metrics: { "cyclomatic-complexity": { threshold: 7 } },
      }),
    });
    await run(["list"], root);
    const text = await readFile(join(root, ".mensura", "config.json"), "utf8");
    expect(JSON.parse(text)).toMatchObject({
      skipDirectories: ["keep-me"],
      metrics: { "cyclomatic-complexity": { threshold: 7 } },
    });
  });

  it("honors a configured threshold for --check", async () => {
    const root = await checkout({
      ...FIXTURE,
      ".mensura/config.json": JSON.stringify({
        metrics: { "cyclomatic-complexity": { threshold: 0 } },
      }),
    });
    const result = await run(["run", METRIC, "--check"], root);
    expect(result.code).toBe(2);
    expect(result.out).toContain("threshold  max 0");
  });
});

describe("mensura run", () => {
  it("saves a snapshot by default and reports the path on stderr", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["run", METRIC], root);
    expect(result.code).toBe(0);
    expect(result.err).toMatch(/saved .*\.mensura[\\/]metrics[\\/]cyclomatic-complexity[\\/]/);
    expect(await manifest(root)).toHaveLength(1);
  });

  it("reports reused and shows the original snapshot timestamp when inputs are unchanged", async () => {
    const root = await checkout(FIXTURE);
    await run(["run", METRIC], root);
    const [entry] = await manifest(root);
    const second = await run(["run", METRIC], root);
    expect(second.code).toBe(0);
    expect(second.err).toMatch(/reused /);
    expect(second.err).not.toContain("saved");
    expect(second.out).toContain(entry!.timestamp);
    expect(await manifest(root)).toHaveLength(1);
  });

  it("--no-save writes neither saved nor reused lines and leaves no store", async () => {
    const root = await checkout(FIXTURE);
    const first = await run(["run", METRIC, "--no-save"], root);
    const second = await run(["run", METRIC, "--no-save"], root);
    expect(first.err).toBe("");
    expect(second.err).toBe("");
    await expect(manifest(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--check shares stdout with run and exits 2 only on a threshold miss", async () => {
    const root = await checkout({
      ...FIXTURE,
      "src/deep.ts": [
        "export function deep() {",
        "  if (1) {",
        "    if (2) {",
        "      if (3) {",
        "        if (4) { return 1; }",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    });
    const plain = await run(["run", "nesting-depth"], root);
    const checked = await run(["run", "nesting-depth", "--check"], root);
    expect(plain.code).toBe(0);
    expect(checked.code).toBe(2);
    expect(plain.out).toContain("threshold  max 3");
    expect(checked.out).toBe(plain.out);

    const passing = await run(["run", METRIC, "--check"], root);
    expect(passing.code).toBe(0);
    expect(passing.out).toContain("threshold  max 20");
  });

  it("piggybacked coverage siblings report their saved paths beside the requested metric", async () => {
    const root = await checkout({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: { "test:coverage": "node -e \"process.exit(0)\"" },
      }),
      "src/a.ts": SIMPLE_TS,
    });
    await seedCoverage(root);
    const result = await run(["run", "crap"], root);
    expect(result.code).toBe(0);
    expect(result.err).toMatch(/saved .*crap/);
    expect(result.err).toMatch(/saved .*test-coverage/);
    expect(result.err.match(/saved /g)).toHaveLength(2);
  });
});

describe("mensura run --all", () => {
  it("evaluates every metric, saves a snapshot each, and reports the counts line", async () => {
    const root = await checkout({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: { "test:coverage": "node -e \"process.exit(0)\"" },
      }),
      "src/a.ts": SIMPLE_TS,
    });
    await seedCoverage(root);
    const result = await run(["run", "--all"], root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Metric summary");
    expect(result.out).toContain(
      `passed ${listMetrics().length}  failed 0  errors 0`,
    );
    expect(result.err.match(/saved /g)).toHaveLength(listMetrics().length);
  });

  it("--no-save keeps the dashboard identical and writes no store lines", async () => {
    const root = await checkout({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: { "test:coverage": "node -e \"process.exit(0)\"" },
      }),
      "src/a.ts": SIMPLE_TS,
    });
    await seedCoverage(root);
    const saving = await run(["run", "--all"], root);
    const dry = await run(["run", "--all", "--check", "--no-save"], root);
    expect(dry.code).toBe(0);
    expect(dry.err).toBe("");
    expect(dry.out).toBe(saving.out);
  });

  it("renders coverage metrics as error rows when the coverage runner is missing", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["run", "--all", "--check", "--no-save"], root);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/test-coverage\s+error\s+No test:coverage script/);
    expect(result.out).toMatch(/crap\s+error\s+No test:coverage script/);
    expect(result.out).toMatch(/cyclomatic-complexity\s+pass/);
    expect(result.out).toContain("errors 2");
  });
});

describe("mensura snapshot show and diff against a crafted store", () => {
  it("diff omits the outdated note when both refs match the current inputs", async () => {
    const root = await checkout(FIXTURE);
    await ensureMensuraConfigFile(root);
    const hash = await hashMetricInputs(root);
    await seedSnapshotStore(root, METRIC, [
      { timestamp: "2026-08-24T10:00:00.000Z", inputsHash: hash },
      { timestamp: "2026-08-25T10:00:00.000Z", inputsHash: hash },
    ]);
    const result = await run(["snapshot", "diff", METRIC], root);
    expect(result.code).toBe(0);
    expect(result.out.startsWith("outdated")).toBe(false);
    expect(result.out).toContain("No changes.");
  });

  it("show still labels a snapshot outdated when hashing the checkout fails", async () => {
    const root = await checkout({ ...FIXTURE, ".mensura/config.json": "{ not json" });
    await seedSnapshotStore(root, METRIC, [{ timestamp: "2026-08-25T10:00:00.000Z" }]);
    const result = await run(["snapshot", "show", METRIC, "latest"], root);
    expect(result.code).toBe(0);
    expect(result.out.startsWith("outdated\n")).toBe(true);
  });

  it("diff exits 1 naming the missing ref when the store is empty", async () => {
    const root = await checkout(FIXTURE);
    const result = await run(["snapshot", "diff", METRIC], root);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/No snapshot "previous"/);
  });
});
