export function table(
  rows: string[][],
  align: Array<"left" | "right">,
): string {
  const widths = columnWidths(rows);
  return rows
    .map((row) =>
      row
        .map((cell, i) => pad(cell, widths[i] ?? 0, align[i] ?? "left"))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function columnWidths(rows: string[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i] ?? 0, visibleWidth(row[i] ?? ""));
    }
  }
  return widths;
}

function pad(text: string, width: number, align: "left" | "right"): string {
  const extra = width - visibleWidth(text);
  if (extra <= 0) return text;
  const spaces = " ".repeat(extra);
  return align === "right" ? spaces + text : text + spaces;
}

function visibleWidth(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function shouldColor(
  stdout: { isTTY?: boolean },
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NO_COLOR !== undefined) return false;
  if (env.FORCE_COLOR === "0") return false;
  return stdout.isTTY === true || env.FORCE_COLOR !== undefined;
}
