import type { MetricStatus } from "../../index.js";
import type { InspectSnapshot } from "./session.js";
import { inspectRowLabel, inspectStatus } from "./inspect.js";

export type InspectChrome = {
  metric: string;
  status: MetricStatus | "";
  emptyMessage: string;
  rows: string[];
  notice: string | null;
  showNoticeBelow: boolean;
  footer: string;
};

export function inspectChrome(
  state: {
    metric: string | null;
    snapshots: InspectSnapshot[];
    inspectCursor: number;
    marked: string[];
    notice: string | null;
    rows: Array<{ id: string; status: MetricStatus | "" }>;
  },
  formatTimestamp: (iso: string) => string,
): InspectChrome {
  const metric = state.metric ?? "";
  const status = inspectStatus(state.rows, state.metric);
  const emptyMessage = state.notice ?? "No snapshot";
  const rows = state.snapshots.map((snapshot) =>
    inspectRowLabel(snapshot, state.marked, formatTimestamp),
  );
  return {
    metric,
    status,
    emptyMessage,
    rows,
    notice: state.notice,
    showNoticeBelow: Boolean(state.notice && state.snapshots.length > 0),
    footer: "enter show  d diff vs previous  space mark  q back",
  };
}

export function inspectRowFocused(index: number, cursor: number): boolean {
  return index === cursor;
}
