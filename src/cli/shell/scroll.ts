export type ScrollKey = {
  escape: boolean;
  upArrow: boolean;
  downArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  home: boolean;
  end: boolean;
};

export type ScrollAction =
  | { type: "quit" }
  | { type: "offset"; next: number };

/** Pure scroll keymap for the Ink report viewer. */
export function scrollAction(
  input: string,
  key: ScrollKey,
  current: number,
  maxOffset: number,
  pageSize: number,
): ScrollAction | null {
  if (key.escape || input === "q") return { type: "quit" };
  if (key.upArrow) return { type: "offset", next: Math.max(0, current - 1) };
  if (key.downArrow) {
    return { type: "offset", next: Math.min(maxOffset, current + 1) };
  }
  if (key.pageUp) {
    return { type: "offset", next: Math.max(0, current - pageSize) };
  }
  if (key.pageDown) {
    return { type: "offset", next: Math.min(maxOffset, current + pageSize) };
  }
  if (key.home) return { type: "offset", next: 0 };
  if (key.end) return { type: "offset", next: maxOffset };
  return null;
}

export function scrollViewport(
  text: string,
  rows: number | undefined,
): { lines: string[]; height: number; maxOffset: number } {
  const lines = text.split("\n");
  const terminalRows = rows && rows > 2 ? rows : 24;
  const height = terminalRows - 1;
  return {
    lines,
    height,
    maxOffset: Math.max(0, lines.length - height),
  };
}
