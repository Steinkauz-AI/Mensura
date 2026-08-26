import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMock = vi.hoisted(() =>
  vi.fn(() => ({
    waitUntilExit: () => Promise.resolve(),
    unmount: () => undefined,
    clear: () => undefined,
    rerender: () => undefined,
  })),
);

vi.mock("ink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ink")>();
  return { ...actual, render: renderMock };
});

const storeMocks = vi.hoisted(() => ({
  loadCatalog: vi.fn().mockResolvedValue([
    {
      id: "cyclomatic-complexity",
      name: "Cyclomatic complexity",
      status: "missing",
      snapshotCount: 0,
      latest: null,
    },
  ]),
}));

vi.mock("../../src/cli/shell/store.js", () => storeMocks);

import { renderInkShell } from "../../src/cli/shell.js";

describe("renderInkShell", () => {
  beforeEach(() => {
    renderMock.mockClear();
  });

  it("returns 0 when ink exits cleanly", async () => {
    const code = await renderInkShell({
      cwd: process.cwd(),
      stdout: { write() {}, isTTY: true },
      stderr: { write() {}, isTTY: true },
      env: { NO_COLOR: "1" },
    });
    expect(code).toBe(0);
    expect(renderMock).toHaveBeenCalled();
  });

  it("returns 1 when ink rejects exit", async () => {
    renderMock.mockReturnValueOnce({
      waitUntilExit: () => Promise.reject(new Error("ink failed")),
      unmount: () => undefined,
      clear: () => undefined,
      rerender: () => undefined,
    });
    const code = await renderInkShell({
      cwd: process.cwd(),
      stdout: { write() {}, isTTY: true },
      stderr: process.stdout,
      env: { NO_COLOR: "1" },
    });
    expect(code).toBe(1);
  });
});
