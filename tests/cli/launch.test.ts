import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCliLaunchArgs } from "../../src/cli/launch.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function pkgRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "launch-"));
  dirs.push(root);
  mkdirSync(join(root, "src", "cli"), { recursive: true });
  writeFileSync(join(root, "src", "cli", "index.ts"), "export {}\n");
  return root;
}

describe("resolveCliLaunchArgs", () => {
  it("uses the built CLI when dist/cli/index.js exists", () => {
    const root = pkgRoot();
    const built = join(root, "dist", "cli", "index.js");
    mkdirSync(join(root, "dist", "cli"), { recursive: true });
    writeFileSync(built, "export {}\n");
    expect(resolveCliLaunchArgs(root, ["node", "mensura", "check"])).toEqual([
      built,
      "check",
    ]);
  });

  it("falls back to tsx and source when the built CLI is missing", () => {
    const root = pkgRoot();
    const args = resolveCliLaunchArgs(root, ["node", "mensura", "list"]);
    expect(args.at(-1)).toBe("list");
    expect(args.some((part) => part.replaceAll("\\", "/").endsWith("src/cli/index.ts"))).toBe(true);
    expect(args.some((part) => part.includes("tsx"))).toBe(true);
  });
});
