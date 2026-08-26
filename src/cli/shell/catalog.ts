import type { MetricStatus } from "../../index.js";
import { columnWidths } from "../format/table.js";
import type { ShellState } from "./session.js";

export type CatalogChrome = {
  title: string;
  viewActive: boolean;
  runActive: boolean;
  rollup: string;
  footer: string;
  columns: string[];
  header: string[];
  lines: Array<{
    focused: boolean;
    checked: boolean;
    cells: string[];
    status: MetricStatus | "";
  }>;
};

export function catalogChrome(state: ShellState): CatalogChrome {
  const columns =
    state.mode === "run"
      ? ["", "metric", "name", "status", "snapshots", "latest"]
      : ["metric", "name", "status", "snapshots", "latest"];
  const raw = state.rows.map((row) => {
    const cells = [
      row.id,
      row.name,
      row.status,
      String(row.snapshotCount),
      formatLatest(row.latest),
    ];
    if (state.mode === "run") {
      cells.unshift(state.selected.has(row.id) ? "[x]" : "[ ]");
    }
    return cells;
  });
  const widths = columnWidths([columns, ...raw]);
  return {
    title: "mensura",
    viewActive: state.mode === "view",
    runActive: state.mode === "run",
    rollup: statusRollup(state.rows),
    footer: catalogFooter(state),
    columns,
    header: padRow(columns, widths),
    lines: state.rows.map((row, i) => ({
      focused: i === state.cursor,
      checked: state.selected.has(row.id),
      cells: padRow(raw[i] ?? [], widths),
      status: row.status,
    })),
  };
}

export function statusRollup(rows: Array<{ status: MetricStatus | "" }>): string {
  let upToDate = 0;
  let outdated = 0;
  let missing = 0;
  for (const row of rows) {
    if (row.status === "up-to-date") upToDate += 1;
    else if (row.status === "outdated") outdated += 1;
    else if (row.status === "missing") missing += 1;
  }
  return `${upToDate} up-to-date  ${outdated} outdated  ${missing} missing`;
}

export function formatLatest(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}

export function statusColor(
  status: MetricStatus | "",
): "green" | "yellow" | undefined {
  if (status === "up-to-date") return "green";
  if (status === "outdated") return "yellow";
  return undefined;
}

function catalogFooter(state: ShellState): string {
  if (state.generating) return "generating…";
  if (state.mode === "run") {
    return "space toggle  a all  o outdated+missing  enter generate  tab view  q quit";
  }
  return "enter inspect  tab run  q quit";
}

function padRow(cells: string[], widths: number[]): string[] {
  return cells.map((cell, i) => cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - cell.length)));
}
