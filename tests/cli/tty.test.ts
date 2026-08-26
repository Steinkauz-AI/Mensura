import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runMensuraCli } from "../../src/cli/cli.js";

type Capture = {
  stdout: { write(text: string): void; isTTY?: boolean };
  stderr: { write(text: string): void; isTTY?: boolean };
  out: string;
  err: string;
};

function capture(isTTY = false): Capture {
  const io: Capture = {
    stdout: {
      isTTY,
      write(text: string) {
        io.out += text;
      },
    },
    stderr: {
      write(text: string) {
        io.err += text;
      },
    },
    out: "",
    err: "",
  };
  return io;
}

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkout(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mensura-tty-"));
  dirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source, "utf8");
  }
  return root;
}

describe("mensura TTY routing", () => {
  it("bare mensura on a TTY prints help and does not enter Ink", async () => {
    const io = capture(true);
    let ink = 0;
    const code = await runMensuraCli([], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: true,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(ink).toBe(0);
    expect(io.out).toContain("mensura -i");
    expect(io.out).toContain("Agents:");
  });

  it("bare mensura piped prints the same help and does not enter Ink", async () => {
    const io = capture(false);
    let ink = 0;
    const code = await runMensuraCli([], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: false,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(ink).toBe(0);
    expect(io.out).toContain("mensura -i");
    expect(io.out).toContain("list");
    expect(io.out).not.toContain("Metrics");
  });

  it("mensura -i on a TTY enters the Ink shell", async () => {
    const io = capture(true);
    let ink = 0;
    const code = await runMensuraCli(["-i"], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: true,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(ink).toBe(1);
    expect(io.out).toBe("");
  });

  it("mensura -i without a TTY exits 1 and does not enter Ink", async () => {
    const io = capture(false);
    let ink = 0;
    const code = await runMensuraCli(["-i"], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: false,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(1);
    expect(ink).toBe(0);
    expect(io.err).toMatch(/TTY/);
    expect(io.out).toBe("");
  });

  it("reads TTY from stdout.isTTY when options.isTTY is omitted", async () => {
    const io = capture(true);
    let ink = 0;
    await runMensuraCli(["-i"], process.cwd(), io.stdout, io.stderr, {}, {
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(ink).toBe(1);
    expect(io.out).toBe("");
  });

  it("explicit list on a TTY prints the registry and does not enter Ink", async () => {
    const io = capture(true);
    let ink = 0;
    const code = await runMensuraCli(["list"], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: true,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(ink).toBe(0);
    expect(io.out).toContain("cyclomatic-complexity");
    expect(io.out).toContain("Metrics");
  });

  it("does not enter Ink for an unknown flag on a TTY", async () => {
    const io = capture(true);
    let ink = 0;
    const code = await runMensuraCli(["--json"], process.cwd(), io.stdout, io.stderr, {}, {
      isTTY: true,
      runInkShell: async () => {
        ink += 1;
        return 0;
      },
    });
    expect(code).toBe(1);
    expect(ink).toBe(0);
    expect(io.err).toMatch(/Unknown flag "--json"/);
  });

  it("mensura run on a TTY prints plain text identical to piped output", async () => {
    const root = await checkout({
      "src/a.ts": "export function simple() {\n  return 1;\n}\n",
    });
    await expectTtyMatchesPiped(["run", "cyclomatic-complexity", "--no-save"], root);
  });
});

async function expectTtyMatchesPiped(
  args: string[],
  root: string,
  env: Record<string, string> = { NO_COLOR: "1" },
): Promise<void> {
  const tty = capture(true);
  const piped = capture(false);
  let ink = 0;
  const options = {
    runInkShell: async () => {
      ink += 1;
      return 0;
    },
  };
  const ttyCode = await runMensuraCli(args, root, tty.stdout, tty.stderr, env, {
    ...options,
    isTTY: true,
  });
  const pipedCode = await runMensuraCli(args, root, piped.stdout, piped.stderr, env, {
    ...options,
    isTTY: false,
  });
  expect(ttyCode).toBe(0);
  expect(pipedCode).toBe(0);
  expect(ink).toBe(0);
  expect(tty.out).toContain("simple");
  expect(/\x1b\[/.test(tty.out)).toBe(false);
  expect(stripTimestamp(tty.out)).toBe(stripTimestamp(piped.out));
}

function stripTimestamp(text: string): string {
  return text.replace(/^at\s+\S+$/m, "at  <ts>");
}
