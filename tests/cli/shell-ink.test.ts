import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import type { CatalogRow } from "../../src/cli/shell/session.js";
import { Shell } from "../../src/cli/shell.js";
import { ReportScrollView } from "../../src/cli/shell/scroll-view.js";
import * as store from "../../src/cli/shell/store.js";

const rows: CatalogRow[] = [
  {
    id: "cyclomatic-complexity",
    name: "Cyclomatic complexity",
    status: "up-to-date",
    snapshotCount: 1,
    latest: "2026-08-25T10:00:00.000Z",
  },
];

const snapshots = [
  {
    file: "new.json",
    timestamp: "2026-08-25T12:01:00.000Z",
    latest: true,
    previous: false,
    current: true,
  },
  {
    file: "old.json",
    timestamp: "2026-08-25T10:11:00.000Z",
    latest: false,
    previous: true,
    current: false,
  },
];

const shellProps = {
  cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: "1" },
  output: { write() {}, isTTY: true },
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shell presentation", () => {
  it("renders report scroll view and scrolls on arrow keys", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line-${i}`);
    const ink = render(
      React.createElement(ReportScrollView, {
        text: lines.join("\n"),
        footer: "footer",
        onQuit: vi.fn(),
      }),
    );
    await delay(30);
    ink.stdin.write("\u001B[B");
    await delay(30);
    expect(ink.lastFrame()).toContain("line-");
    ink.unmount();
  });

  it("Shell shows catalog after catalog load", async () => {
    vi.spyOn(store, "loadCatalog").mockResolvedValue(rows);
    const ink = render(React.createElement(Shell, shellProps));
    await delay(100);
    expect(ink.lastFrame()).toContain("Cyclomatic");
    ink.stdin.write("q");
    ink.unmount();
  });

  it("Shell opens inspect on enter", async () => {
    vi.spyOn(store, "loadCatalog").mockResolvedValue(rows);
    vi.spyOn(store, "loadInspectSnapshots").mockResolvedValue(snapshots);
    const ink = render(React.createElement(Shell, shellProps));
    await delay(100);
    ink.stdin.write("\r");
    await delay(100);
    expect(ink.lastFrame()).toContain("new.json");
    ink.unmount();
  });

  it("Shell shows report scroll view after show", async () => {
    vi.spyOn(store, "loadCatalog").mockResolvedValue(rows);
    vi.spyOn(store, "loadInspectSnapshots").mockResolvedValue(snapshots);
    vi.spyOn(store, "showSnapshot").mockResolvedValue("report alpha\nreport beta");
    const ink = render(React.createElement(Shell, shellProps));
    await delay(100);
    ink.stdin.write("\r");
    await delay(100);
    ink.stdin.write("\r");
    await delay(150);
    expect(ink.lastFrame()).toContain("report alpha");
    ink.stdin.write("q");
    await delay(50);
    ink.unmount();
  });

  it("Shell shows error screen when catalog load fails and returns on q", async () => {
    vi.spyOn(store, "loadCatalog").mockRejectedValue(new Error("catalog failed"));
    const ink = render(React.createElement(Shell, shellProps));
    await delay(100);
    expect(ink.lastFrame()).toContain("catalog failed");
    ink.stdin.write("q");
    await delay(50);
    ink.unmount();
  });
});
