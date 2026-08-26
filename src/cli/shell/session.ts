import type { MetricStatus } from "../../index.js";

export type CatalogRow = {
  id: string;
  name: string;
  status: MetricStatus | "";
  snapshotCount: number;
  latest: string | null;
};

export type InspectSnapshot = {
  file: string;
  timestamp: string;
  latest: boolean;
  previous: boolean;
  current: boolean;
};

export type ShellKey =
  | "up"
  | "down"
  | "enter"
  | "tab"
  | "space"
  | "a"
  | "o"
  | "d"
  | "quit";

export type ShellEffect =
  | { type: "none" }
  | { type: "quit" }
  | { type: "inspect"; metric: string }
  | { type: "show"; metric: string; ref: string }
  | { type: "diff"; metric: string; baseline: string; current: string }
  | { type: "generate"; ids: string[] };

export type ShellScreen = "catalog" | "inspect" | "report" | "error";

export type ShellState = {
  mode: "view" | "run";
  screen: ShellScreen;
  cursor: number;
  inspectCursor: number;
  selected: Set<string>;
  marked: string[];
  rows: CatalogRow[];
  snapshots: InspectSnapshot[];
  generating: boolean;
  reportText: string;
  errorMessage: string;
  notice: string | null;
  metric: string | null;
};

export type ShellSession = {
  readonly state: ShellState;
  handle(key: ShellKey): ShellEffect;
  setSnapshots(snapshots: InspectSnapshot[]): void;
  openReport(text: string): void;
  openError(message: string): void;
  finishGenerate(rows: CatalogRow[], errors: Record<string, string>): void;
  failGenerate(message: string): void;
};

const NONE: ShellEffect = { type: "none" };

export function createSession(rows: CatalogRow[]): ShellSession {
  const state: ShellState = {
    mode: "view",
    screen: "catalog",
    cursor: 0,
    inspectCursor: 0,
    selected: new Set(),
    marked: [],
    rows,
    snapshots: [],
    generating: false,
    reportText: "",
    errorMessage: "",
    notice: null,
    metric: null,
  };

  return {
    get state() {
      return state;
    },
    handle(key) {
      return handle(state, key);
    },
    setSnapshots(snapshots) {
      state.snapshots = snapshots;
      state.inspectCursor = 0;
      state.marked = [];
      state.notice = snapshots.length === 0 ? "No snapshot — switch to Run" : null;
    },
    openReport(text) {
      state.screen = "report";
      state.reportText = text;
      state.notice = null;
    },
    openError(message) {
      state.screen = "error";
      state.errorMessage = message;
    },
    finishGenerate(nextRows, errors) {
      state.generating = false;
      state.rows = nextRows;
      state.cursor = clamp(state.cursor, nextRows.length);
      const failed = Object.keys(errors);
      state.notice =
        failed.length === 0 ? null : failed.map((id) => `${id}: ${errors[id]}`).join(" · ");
    },
    failGenerate(message) {
      state.generating = false;
      state.screen = "error";
      state.errorMessage = message;
    },
  };
}

function handle(state: ShellState, key: ShellKey): ShellEffect {
  if (state.screen === "report" || state.screen === "error") {
    if (key === "quit") {
      state.screen = state.metric ? "inspect" : "catalog";
      return NONE;
    }
    return NONE;
  }
  if (state.screen === "inspect") return handleInspect(state, key);
  return handleCatalog(state, key);
}

function handleCatalog(state: ShellState, key: ShellKey): ShellEffect {
  if (key === "quit") return { type: "quit" };
  if (state.generating) return NONE;
  if (key === "tab") {
    state.mode = state.mode === "view" ? "run" : "view";
    return NONE;
  }
  if (key === "up") {
    state.cursor = wrap(state.cursor - 1, state.rows.length);
    return NONE;
  }
  if (key === "down") {
    state.cursor = wrap(state.cursor + 1, state.rows.length);
    return NONE;
  }
  if (state.mode === "run") return handleRun(state, key);
  if (key === "enter") {
    const metric = state.rows[state.cursor];
    if (!metric) return NONE;
    state.screen = "inspect";
    state.metric = metric.id;
    state.snapshots = [];
    state.inspectCursor = 0;
    state.marked = [];
    state.notice = null;
    return { type: "inspect", metric: metric.id };
  }
  return NONE;
}

function handleRun(state: ShellState, key: ShellKey): ShellEffect {
  const focused = state.rows[state.cursor];
  if (key === "space" && focused) {
    toggle(state.selected, focused.id);
    return NONE;
  }
  if (key === "a") {
    state.selected = new Set(state.rows.map((row) => row.id));
    return NONE;
  }
  if (key === "o") {
    state.selected = new Set(
      state.rows
        .filter((row) => row.status === "outdated" || row.status === "missing")
        .map((row) => row.id),
    );
    return NONE;
  }
  if (key === "enter") {
    const ids =
      state.selected.size > 0
        ? state.rows.filter((row) => state.selected.has(row.id)).map((row) => row.id)
        : focused
          ? [focused.id]
          : [];
    if (ids.length === 0) return NONE;
    state.generating = true;
    state.notice = null;
    return { type: "generate", ids };
  }
  return NONE;
}

function handleInspect(state: ShellState, key: ShellKey): ShellEffect {
  if (key === "quit") {
    state.screen = "catalog";
    state.metric = null;
    state.snapshots = [];
    state.marked = [];
    state.notice = null;
    return NONE;
  }
  if (key === "up") {
    state.inspectCursor = wrap(state.inspectCursor - 1, state.snapshots.length);
    return NONE;
  }
  if (key === "down") {
    state.inspectCursor = wrap(state.inspectCursor + 1, state.snapshots.length);
    return NONE;
  }
  const focused = state.snapshots[state.inspectCursor];
  const metric = state.metric;
  if (!metric) return NONE;
  if (key === "space" && focused) {
    state.marked = toggleMark(state.marked, focused.file);
    return NONE;
  }
  if (key === "enter" && focused) {
    return { type: "show", metric, ref: focused.file };
  }
  if (key === "d") return diffEffect(state, metric);
  return NONE;
}

function diffEffect(state: ShellState, metric: string): ShellEffect {
  if (state.marked.length === 2) {
    const pair = [...state.marked].sort((a, b) => snapshotTime(state, a).localeCompare(snapshotTime(state, b)));
    return { type: "diff", metric, baseline: pair[0]!, current: pair[1]! };
  }
  const latest = state.snapshots.find((snapshot) => snapshot.latest);
  const previous = state.snapshots.find((snapshot) => snapshot.previous);
  if (!latest || !previous) {
    state.notice = "Need two snapshots to diff";
    return NONE;
  }
  return { type: "diff", metric, baseline: previous.file, current: latest.file };
}

function snapshotTime(state: ShellState, file: string): string {
  return state.snapshots.find((snapshot) => snapshot.file === file)?.timestamp ?? file;
}

function toggle(set: Set<string>, id: string): void {
  if (set.has(id)) set.delete(id);
  else set.add(id);
}

function toggleMark(marked: string[], file: string): string[] {
  if (marked.includes(file)) return marked.filter((entry) => entry !== file);
  if (marked.length < 2) return [...marked, file];
  return [marked[1]!, file];
}

function wrap(index: number, count: number): number {
  if (count === 0) return 0;
  return (index + count) % count;
}

function clamp(index: number, count: number): number {
  if (count === 0) return 0;
  return Math.min(index, count - 1);
}
