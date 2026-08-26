import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEffect } from "../../src/cli/shell/effects.js";
import type { CatalogRow, InspectSnapshot, ShellSession } from "../../src/cli/shell/session.js";

const storeMocks = vi.hoisted(() => ({
  loadInspectSnapshots: vi.fn(),
  showSnapshot: vi.fn(),
  diffSnapshots: vi.fn(),
  generateMetrics: vi.fn(),
}));

vi.mock("../../src/cli/shell/store.js", () => storeMocks);
vi.mock("../../src/cli/shell/screen.js", () => ({
  recoverScreen: vi.fn(),
}));

import { recoverScreen } from "../../src/cli/shell/screen.js";

function session(overrides: Partial<ShellSession["state"]> = {}): ShellSession & {
  calls: {
    setSnapshots: InspectSnapshot[][];
    openReport: string[];
    openError: string[];
    finishGenerate: Array<[CatalogRow[], Record<string, string>]>;
    failGenerate: string[];
  };
} {
  const calls = {
    setSnapshots: [] as InspectSnapshot[][],
    openReport: [] as string[],
    openError: [] as string[],
    finishGenerate: [] as Array<[CatalogRow[], Record<string, string>]>,
    failGenerate: [] as string[],
  };
  const state = {
    mode: "view" as const,
    screen: "catalog" as const,
    cursor: 0,
    inspectCursor: 0,
    selected: new Set<string>(),
    marked: [],
    rows: [] as CatalogRow[],
    snapshots: [] as InspectSnapshot[],
    generating: false,
    reportText: "",
    errorMessage: "",
    notice: null as string | null,
    metric: null as string | null,
    ...overrides,
  };
  return {
    get state() {
      return state;
    },
    handle: () => ({ type: "none" as const }),
    setSnapshots(snapshots) {
      calls.setSnapshots.push(snapshots);
      state.snapshots = snapshots;
    },
    openReport(text) {
      calls.openReport.push(text);
    },
    openError(message) {
      calls.openError.push(message);
    },
    finishGenerate(rows, errors) {
      calls.finishGenerate.push([rows, errors]);
    },
    failGenerate(message) {
      calls.failGenerate.push(message);
    },
    calls,
  };
}

const props = {
  cwd: "/tmp/project",
  env: {},
  output: { write: vi.fn(), isTTY: true },
};

describe("applyEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.loadInspectSnapshots.mockResolvedValue([
      { file: "a.json", timestamp: "2026-01-01T00:00:00.000Z", latest: true, previous: false, current: false },
    ]);
    storeMocks.showSnapshot.mockResolvedValue("report body");
    storeMocks.diffSnapshots.mockResolvedValue("diff body");
    storeMocks.generateMetrics.mockResolvedValue({ rows: [], errors: {} });
  });

  it("loads inspect snapshots and bumps on success", async () => {
    const s = session();
    const bump = vi.fn();
    await applyEffect(s, { type: "inspect", metric: "cyclomatic-complexity" }, props, bump);
    expect(storeMocks.loadInspectSnapshots).toHaveBeenCalledWith("/tmp/project", "cyclomatic-complexity");
    expect(s.calls.setSnapshots).toHaveLength(1);
    expect(bump).toHaveBeenCalledOnce();
  });

  it("opens a show report and bumps on success", async () => {
    const s = session();
    const bump = vi.fn();
    await applyEffect(s, { type: "show", metric: "crap", ref: "snap.json" }, props, bump);
    expect(storeMocks.showSnapshot).toHaveBeenCalledWith(
      "/tmp/project",
      "crap",
      "snap.json",
      props.output,
      props.env,
    );
    expect(s.calls.openReport).toEqual(["report body"]);
    expect(bump).toHaveBeenCalledOnce();
  });

  it("opens a diff report and bumps on success", async () => {
    const s = session();
    const bump = vi.fn();
    await applyEffect(
      s,
      { type: "diff", metric: "crap", baseline: "old.json", current: "new.json" },
      props,
      bump,
    );
    expect(storeMocks.diffSnapshots).toHaveBeenCalledWith(
      "/tmp/project",
      "crap",
      "old.json",
      "new.json",
      props.output,
      props.env,
    );
    expect(s.calls.openReport).toEqual(["diff body"]);
    expect(bump).toHaveBeenCalledOnce();
  });

  it("finishes generate, recovers the screen, and bumps on success", async () => {
    const rows = [{ id: "crap", name: "CRAP", status: "", snapshotCount: 0, latest: null }];
    storeMocks.generateMetrics.mockResolvedValue({ rows, errors: { cycles: "boom" } });
    const s = session({ generating: true });
    const bump = vi.fn();
    await applyEffect(s, { type: "generate", ids: ["crap", "cycles"] }, props, bump);
    expect(storeMocks.generateMetrics).toHaveBeenCalledWith("/tmp/project", ["crap", "cycles"]);
    expect(recoverScreen).toHaveBeenCalledWith(props.output);
    expect(s.calls.finishGenerate).toEqual([[rows, { cycles: "boom" }]]);
    expect(bump).toHaveBeenCalledOnce();
  });

  it("opens an error when a non-generate effect throws", async () => {
    storeMocks.showSnapshot.mockRejectedValue(new Error("show failed"));
    const s = session();
    const bump = vi.fn();
    await applyEffect(s, { type: "show", metric: "crap", ref: "snap.json" }, props, bump);
    expect(recoverScreen).toHaveBeenCalledWith(props.output);
    expect(s.calls.openError).toEqual(["show failed"]);
    expect(s.calls.failGenerate).toHaveLength(0);
    expect(bump).toHaveBeenCalledOnce();
  });

  it("fails generate when generate throws while generating", async () => {
    storeMocks.generateMetrics.mockRejectedValue("broken");
    const s = session({ generating: true });
    const bump = vi.fn();
    await applyEffect(s, { type: "generate", ids: ["crap"] }, props, bump);
    expect(recoverScreen).toHaveBeenCalledWith(props.output);
    expect(s.calls.failGenerate).toEqual(["broken"]);
    expect(s.calls.openError).toHaveLength(0);
    expect(bump).toHaveBeenCalledOnce();
  });
});
