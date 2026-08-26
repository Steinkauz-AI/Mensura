import { describe, expect, it } from "vitest";
import { inspectChrome, inspectRowFocused } from "../../src/cli/shell/inspect-view.js";
import type { InspectSnapshot } from "../../src/cli/shell/session.js";

const snapshot = (file: string): InspectSnapshot => ({
  file,
  timestamp: "2026-08-25T10:00:00.000Z",
  current: file === "a.json",
  latest: file === "b.json",
  previous: false,
});

function emptyChrome() {
  return inspectChrome(
    {
      metric: "cyclomatic-complexity",
      snapshots: [],
      inspectCursor: 0,
      marked: [],
      notice: null,
      rows: [{ id: "cyclomatic-complexity", status: "missing" }],
    },
    (iso) => iso,
  );
}

function filledChrome() {
  return inspectChrome(
    {
      metric: "cyclomatic-complexity",
      snapshots: [snapshot("a.json"), snapshot("b.json")],
      inspectCursor: 1,
      marked: ["b.json"],
      notice: "note",
      rows: [{ id: "cyclomatic-complexity", status: "up-to-date" }],
    },
    (iso) => iso.slice(0, 10),
  );
}

describe("inspectChrome", () => {
  it("builds empty inspect chrome", () => {
    const empty = emptyChrome();
    expect(empty.status).toBe("missing");
    expect(empty.rows).toEqual([]);
    expect(empty.emptyMessage).toBe("No snapshot");
    expect(empty.showNoticeBelow).toBe(false);
  });

  it("builds populated inspect chrome", () => {
    const filled = filledChrome();
    expect(filled.status).toBe("up-to-date");
    expect(filled.rows[1]).toContain("•");
    expect(filled.showNoticeBelow).toBe(true);
    expect(inspectRowFocused(1, 1)).toBe(true);
    expect(inspectRowFocused(0, 1)).toBe(false);
  });
});
