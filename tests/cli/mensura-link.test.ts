import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  binDir,
  mensuraCmdContent,
  mensuraPosixShimContent,
  mensuraPs1Content,
  pathHas,
  shimDest,
  shimPaths,
  unixBinDir,
  windowsBinDir,
  windowsShimContents,
} from "../../src/cli/mensura-link.js";

describe("unixBinDir", () => {
  it("places shims under ~/.local/bin on Unix", () => {
    expect(unixBinDir("/home/user")).toBe(join("/home/user", ".local", "bin"));
  });
});

describe("windowsBinDir", () => {
  it("prefers PNPM_HOME when set", () => {
    expect(windowsBinDir({ PNPM_HOME: "C:\\pnpm" })).toBe("C:\\pnpm");
  });

  it("falls back to LOCALAPPDATA/pnpm", () => {
    expect(windowsBinDir({ LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" })).toBe(
      join("C:\\Users\\me\\AppData\\Local", "pnpm"),
    );
  });

  it("throws when no Windows bin directory can be resolved", () => {
    expect(() => windowsBinDir({})).toThrow(/PNPM_HOME/);
  });
});

describe("binDir", () => {
  it("selects the platform-specific bin directory", () => {
    expect(binDir(false, "/home/user", {})).toBe(unixBinDir("/home/user"));
    expect(binDir(true, "/home/user", { PNPM_HOME: "C:\\pnpm" })).toBe("C:\\pnpm");
  });
});

describe("shimPaths", () => {
  it("returns one path on Unix and three on Windows", () => {
    expect(shimPaths(false, "/bin", "mensura")).toEqual([join("/bin", "mensura")]);
    expect(shimPaths(true, "C:\\bin", "mensura")).toEqual([
      join("C:\\bin", "mensura"),
      join("C:\\bin", "mensura.CMD"),
      join("C:\\bin", "mensura.ps1"),
    ]);
  });
});

describe("windows shim contents", () => {
  const src = "C:\\repo\\bin\\mensura.mjs";

  it("builds CMD, ps1, and posix shims referencing the CLI source", () => {
    expect(mensuraCmdContent(src)).toContain(`node "${src}"`);
    expect(mensuraPs1Content(src)).toContain(`node "${src}"`);
    expect(mensuraPosixShimContent(src)).toContain('exec node "C:/repo/bin/mensura.mjs"');
    expect(windowsShimContents(src)).toEqual({
      CMD: mensuraCmdContent(src),
      ps1: mensuraPs1Content(src),
      posix: mensuraPosixShimContent(src),
    });
  });
});

describe("pathHas", () => {
  it("detects a directory on PATH using platform separators", () => {
    const resolve = (part: string) => join("/abs", part.replace(/^\/+/, ""));
    expect(pathHas("/abs/bin:/abs/other", "/abs/bin", false, resolve)).toBe(true);
    expect(pathHas("/abs/other", "/abs/bin", false, resolve)).toBe(false);
    expect(pathHas("C:\\tools;C:\\apps", "C:\\tools", true, (p) => p)).toBe(true);
  });
});

describe("shimDest", () => {
  it("returns the primary shim path for each platform", () => {
    expect(shimDest(false, "/bin", "mensura")).toBe(join("/bin", "mensura"));
    expect(shimDest(true, "C:\\bin", "mensura")).toBe(join("C:\\bin", "mensura.CMD"));
  });
});
