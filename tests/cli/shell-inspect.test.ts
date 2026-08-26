import { describe, expect, it } from "vitest";
import {
  inspectRowLabel,
  inspectStatus,
  snapshotTags,
} from "../../src/cli/shell/inspect.js";

describe("snapshotTags", () => {
  it("joins active tags and pads to a fixed width", () => {
    const tags = snapshotTags({ current: true, latest: false, previous: true });
    expect(tags).toHaveLength(24);
    expect(tags.startsWith("current previous")).toBe(true);
  });

  it("returns padding when no tags apply", () => {
    expect(snapshotTags({ current: false, latest: false, previous: false })).toHaveLength(24);
    expect(snapshotTags({ current: false, latest: false, previous: false }).trim()).toBe("");
  });
});

describe("inspectStatus", () => {
  it("returns the status for the selected metric", () => {
    const rows = [
      { id: "crap", status: "up-to-date" as const },
      { id: "cycles", status: "missing" as const },
    ];
    expect(inspectStatus(rows, "cycles")).toBe("missing");
  });

  it("returns empty string when the metric is missing or null", () => {
    const rows = [{ id: "crap", status: "up-to-date" as const }];
    expect(inspectStatus(rows, "unknown")).toBe("");
    expect(inspectStatus(rows, null)).toBe("");
  });
});

describe("inspectRowLabel", () => {
  it("marks selected snapshots and formats the row label", () => {
    const snapshot = {
      file: "2026-01-01.json",
      timestamp: "2026-01-01T12:00:00.000Z",
      current: true,
      latest: false,
      previous: false,
    };
    const label = inspectRowLabel(snapshot, ["2026-01-01.json"], (iso) => iso.slice(0, 10));
    expect(label).toContain("•");
    expect(label).toContain("current");
    expect(label).toContain("2026-01-01");
    expect(label).toContain("2026-01-01.json");
  });

  it("uses a blank mark when the snapshot is not selected", () => {
    const snapshot = {
      file: "snap.json",
      timestamp: "2026-01-01T00:00:00.000Z",
      current: false,
      latest: true,
      previous: false,
    };
    const label = inspectRowLabel(snapshot, [], () => "ts");
    expect(label.startsWith("  ")).toBe(true);
    expect(label).toContain("latest");
  });
});
