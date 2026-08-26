import { afterEach, describe, expect, it, vi } from "vitest";

describe("cli index direct run", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../src/cli/direct-run.js");
    vi.doUnmock("../../src/cli/cli.js");
    process.exitCode = undefined;
  });

  it("sets exitCode when runMensuraCli resolves", async () => {
    vi.doMock("../../src/cli/direct-run.js", () => ({
      isDirectRun: () => true,
    }));
    vi.doMock("../../src/cli/cli.js", () => ({
      runMensuraCli: vi.fn().mockResolvedValue(2),
    }));
    await import("../../src/cli/index.js");
    await vi.waitFor(() => expect(process.exitCode).toBe(2));
  });

  it("writes errors and sets exitCode when runMensuraCli rejects", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    vi.doMock("../../src/cli/direct-run.js", () => ({
      isDirectRun: () => true,
    }));
    vi.doMock("../../src/cli/cli.js", () => ({
      runMensuraCli: vi.fn().mockRejectedValue(new Error("cli failed")),
    }));
    await import("../../src/cli/index.js");
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(writes.join("")).toContain("cli failed");
  });

  it("does not run when imported as a module", async () => {
    const runMensuraCli = vi.fn();
    vi.doMock("../../src/cli/direct-run.js", () => ({
      isDirectRun: () => false,
    }));
    vi.doMock("../../src/cli/cli.js", () => ({ runMensuraCli }));
    await import("../../src/cli/index.js");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(runMensuraCli).not.toHaveBeenCalled();
  });
});
