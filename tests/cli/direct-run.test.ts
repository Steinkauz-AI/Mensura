import { describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDirectRun } from "../../src/cli/direct-run.js";

describe("isDirectRun", () => {
  it("returns true when argv includes this module path", () => {
    const self = fileURLToPath(import.meta.url);
    expect(isDirectRun(["node", self], import.meta.url)).toBe(true);
  });

  it("returns false when argv does not reference this module", () => {
    expect(isDirectRun(["node", "/other/script.js"], import.meta.url)).toBe(false);
  });

  it("returns false when argv entry cannot be resolved", () => {
    expect(isDirectRun(["node", "/no/such/file.ts"], import.meta.url)).toBe(false);
  });

  it("matches symlinked paths via realpath", () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(join(tmpdir(), "direct-run-"));
    try {
      const target = join(dir, "target.mjs");
      const link = join(dir, "link.mjs");
      writeFileSync(target, "export {}\n");
      symlinkSync(target, link);
      expect(isDirectRun(["node", link], pathToFileURL(realpathSync(target)).href)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
