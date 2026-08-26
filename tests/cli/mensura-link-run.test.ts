import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { packageRootFromScript, runMensuraLink } from "../../src/cli/mensura-link-run.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mensura-link-run-"));
  dirs.push(root);
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(join(root, "bin", "mensura.mjs"), "#!/usr/bin/env node\n");
  return root;
}

describe("runMensuraLink", () => {
  it("derives package root from the script URL", () => {
    const script = join(tmpdir(), "pkg", "scripts", "link.mjs");
    expect(packageRootFromScript(`file:///${script.replace(/\\/g, "/")}`)).toBe(
      join(tmpdir(), "pkg"),
    );
  });

  it("links and unlinks windows shims through the io seam", async () => {
    const root = await fixture();
    const bin = join(root, "shim-bin");
    const logs: string[] = [];
    const errors: string[] = [];
    const io = {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    };
    runMensuraLink(["node", "link", "link"], {
      pkgRoot: root,
      isWin: true,
      home: root,
      env: { PNPM_HOME: bin, PATH: bin },
      io,
    });
    expect(logs.some((line) => line.includes("linked"))).toBe(true);
    runMensuraLink(["node", "link", "unlink"], {
      pkgRoot: root,
      isWin: true,
      home: root,
      env: { PNPM_HOME: bin, PATH: bin },
      io,
    });
    expect(logs.some((line) => line.includes("removed"))).toBe(true);
    expect(errors).toEqual([]);
  });

  it("exits when the CLI bin is missing", async () => {
    const root = await fixture();
    await rm(join(root, "bin", "mensura.mjs"));
    let code: number | undefined;
    runMensuraLink(["node", "link", "link"], {
      pkgRoot: root,
      isWin: true,
      home: root,
      env: { PNPM_HOME: join(root, "bin"), PATH: join(root, "bin") },
      io: {
        log: () => undefined,
        error: () => undefined,
        exit: (value) => {
          code = value;
        },
      },
    });
    expect(code).toBe(1);
  });

  it("requires PATH to include the shim directory", async () => {
    const root = await fixture();
    let code: number | undefined;
    runMensuraLink(["node", "link", "link"], {
      pkgRoot: root,
      isWin: true,
      home: root,
      env: { PNPM_HOME: join(root, "away"), PATH: join(root, "missing") },
      io: {
        log: () => undefined,
        error: () => undefined,
        exit: (value) => {
          code = value;
        },
      },
    });
    expect(code).toBe(1);
  });
});
