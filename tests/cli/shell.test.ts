import { describe, expect, it } from "vitest";
import { catalogChrome } from "../../src/cli/shell/catalog.js";
import { recoverScreen } from "../../src/cli/shell/screen.js";
import { createSession, type CatalogRow } from "../../src/cli/shell/session.js";

function row(partial: Partial<CatalogRow> & Pick<CatalogRow, "id" | "name">): CatalogRow {
  return {
    status: "outdated",
    snapshotCount: 1,
    latest: "2026-08-25T10:11:00.000Z",
    ...partial,
  };
}

const rows: CatalogRow[] = [
  row({ id: "cyclomatic-complexity", name: "Cyclomatic complexity", status: "up-to-date", snapshotCount: 2 }),
  row({ id: "cognitive-complexity", name: "Cognitive complexity", status: "outdated", snapshotCount: 2 }),
  row({ id: "nesting-depth", name: "Nesting depth", status: "missing", snapshotCount: 0, latest: null }),
];

describe("interactive catalog", () => {
  it("opens in view mode and labels the column status, not currency", () => {
    const session = createSession(rows);
    const chrome = catalogChrome(session.state);
    expect(session.state.mode).toBe("view");
    expect(chrome.columns).toContain("status");
    expect(chrome.columns.join(" ")).not.toMatch(/currency/i);
    expect(chrome.rollup).toBe("1 up-to-date  1 outdated  1 missing");
    expect(chrome.rollup).not.toMatch(/currency/i);
    expect(chrome.viewActive).toBe(true);
    expect(chrome.runActive).toBe(false);
    expect(chrome.footer).toMatch(/enter inspect/);
    expect(chrome.footer).toMatch(/tab run/);
  });

  it("tab switches between view and run on the same rows", () => {
    const session = createSession(rows);
    expect(session.handle("tab")).toEqual({ type: "none" });
    expect(session.state.mode).toBe("run");
    const run = catalogChrome(session.state);
    expect(run.viewActive).toBe(false);
    expect(run.runActive).toBe(true);
    expect(run.footer).toMatch(/space toggle/);
    expect(run.footer).toMatch(/enter generate/);
    expect(run.lines).toHaveLength(3);
    expect(session.handle("tab")).toEqual({ type: "none" });
    expect(session.state.mode).toBe("view");
  });

  it("view enter inspects the highlighted metric and does not generate", () => {
    const session = createSession(rows);
    session.handle("down");
    expect(session.handle("enter")).toEqual({
      type: "inspect",
      metric: "cognitive-complexity",
    });
    expect(session.state.screen).toBe("inspect");
    expect(session.state.metric).toBe("cognitive-complexity");
  });

  it("run space, a, and o change the selection; enter generates those ids", () => {
    const session = createSession(rows);
    session.handle("tab");
    session.handle("space");
    expect([...session.state.selected]).toEqual(["cyclomatic-complexity"]);
    session.handle("a");
    expect(session.state.selected.size).toBe(3);
    session.handle("o");
    expect([...session.state.selected]).toEqual(["cognitive-complexity", "nesting-depth"]);
    expect(session.handle("enter")).toEqual({
      type: "generate",
      ids: ["cognitive-complexity", "nesting-depth"],
    });
    expect(session.state.generating).toBe(true);
    expect(session.state.screen).toBe("catalog");
  });

  it("run enter with no checkboxes generates the focused metric", () => {
    const session = createSession(rows);
    session.handle("tab");
    session.handle("down");
    expect(session.handle("enter")).toEqual({
      type: "generate",
      ids: ["cognitive-complexity"],
    });
  });

  it("stays on the catalog after generate finishes and refreshes status", () => {
    const session = createSession(rows);
    session.handle("tab");
    session.handle("enter");
    session.finishGenerate(
      [
        row({ id: "cyclomatic-complexity", name: "Cyclomatic complexity", status: "up-to-date" }),
        row({ id: "cognitive-complexity", name: "Cognitive complexity", status: "up-to-date" }),
        row({ id: "nesting-depth", name: "Nesting depth", status: "missing", snapshotCount: 0, latest: null }),
      ],
      {},
    );
    expect(session.state.generating).toBe(false);
    expect(session.state.screen).toBe("catalog");
    expect(session.state.mode).toBe("run");
    expect(session.state.rows[1]?.status).toBe("up-to-date");
  });

  it("clears generating when a batch fails so keys work again", () => {
    const session = createSession(rows);
    session.handle("tab");
    session.handle("enter");
    session.failGenerate("disk full");
    expect(session.state.generating).toBe(false);
    expect(session.state.screen).toBe("error");
    expect(session.handle("quit")).toEqual({ type: "none" });
    expect(session.state.screen).toBe("catalog");
    expect(session.handle("tab")).toEqual({ type: "none" });
    expect(session.state.mode).toBe("view");
  });
});

describe("interactive inspect", () => {
  it("shows the current snapshot, diffs previous vs latest, or diffs two marked files", () => {
    const session = createSession(rows);
    session.handle("enter");
    session.setSnapshots([
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
    ]);
    expect(session.handle("enter")).toEqual({
      type: "show",
      metric: "cyclomatic-complexity",
      ref: "new.json",
    });
    expect(session.handle("d")).toEqual({
      type: "diff",
      metric: "cyclomatic-complexity",
      baseline: "old.json",
      current: "new.json",
    });
    session.handle("space");
    session.handle("down");
    session.handle("space");
    expect(session.handle("d")).toEqual({
      type: "diff",
      metric: "cyclomatic-complexity",
      baseline: "old.json",
      current: "new.json",
    });
  });

  it("quit from inspect returns to the catalog; quit from the catalog exits", () => {
    const session = createSession(rows);
    session.handle("enter");
    expect(session.handle("quit")).toEqual({ type: "none" });
    expect(session.state.screen).toBe("catalog");
    expect(session.handle("quit")).toEqual({ type: "quit" });
  });
});

describe("interactive screen recovery", () => {
  it("wipes the terminal so a later paint cannot stack on leftover lines", () => {
    const written: string[] = [];
    recoverScreen({ write: (text) => written.push(text) });
    expect(written.join("")).toBe("\x1b[2J\x1b[H");
  });
});
