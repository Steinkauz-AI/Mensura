import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { coverageCommand, coverageSpawnSpec, ensureTestCoverage } from "../../src/metrics/test-coverage/ensure.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkoutWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ensure-cov-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source);
  }
  return root;
}

describe("ensureTestCoverage", () => {
  it("throws when package.json has no test:coverage script", async () => {
    const root = await checkoutWith({
      "package.json": JSON.stringify({ name: "fixture", scripts: { test: "echo hi" } }),
    });
    await expect(ensureTestCoverage(root)).rejects.toThrow(/test:coverage/);
  });

  it("throws when package.json is missing", async () => {
    const root = await checkoutWith({
      "src/a.ts": "export function a() {}\n",
    });
    await expect(ensureTestCoverage(root)).rejects.toThrow(/test:coverage/);
  });

  it("runs the checkout's test:coverage script", async () => {
    const root = await checkoutWith({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: { "test:coverage": "echo hi" },
      }),
    });
    const ran: string[] = [];
    await ensureTestCoverage(root, async (cwd, command) => {
      ran.push(`${cwd}:${command.manager}:${command.script}`);
    });
    expect(ran).toEqual([`${root}:npm:test:coverage`]);
  });

  it("picks pnpm when a pnpm lockfile is present", async () => {
    const root = await checkoutWith({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: { "test:coverage": "vitest run --coverage" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    expect(await coverageCommand(root)).toEqual({ manager: "pnpm", script: "test:coverage" });
  });

  it("spawns the coverage runner without a shell so TTY output cannot leak", () => {
    const spec = coverageSpawnSpec({ manager: "pnpm", script: "test:coverage" });
    expect(spec.options.shell).toBe(false);
    expect(spec.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    if (process.platform === "win32") {
      expect(spec.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
      expect(spec.args[3]).toBe("pnpm run test:coverage");
    } else {
      expect(spec.file).toBe("pnpm");
      expect(spec.args).toEqual(["run", "test:coverage"]);
    }
  });

  it("does not leak coverage script stderr onto the parent process", async () => {
    const marker = "LEAKED-COVERAGE-STDERR";
    const root = await checkoutWith({
      "package.json": JSON.stringify({
        name: "fixture",
        scripts: {
          "test:coverage": `node -e "console.error('${marker}'); process.exit(0)"`,
        },
      }),
    });
    const leaked: string[] = [];
    const stdoutWrite = process.stdout.write.bind(process.stdout);
    const stderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
      leaked.push(String(chunk));
      return stdoutWrite(chunk as never, ...(args as never[]));
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
      leaked.push(String(chunk));
      return stderrWrite(chunk as never, ...(args as never[]));
    }) as typeof process.stderr.write;
    try {
      await ensureTestCoverage(root);
    } finally {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
    }
    expect(leaked.join("")).not.toContain(marker);
  });
});
