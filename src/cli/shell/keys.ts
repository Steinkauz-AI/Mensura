import type { ShellKey } from "./session.js";

export type InkKey = {
  upArrow: boolean;
  downArrow: boolean;
  return: boolean;
  escape: boolean;
  tab?: boolean;
};

export function mapKey(input: string, key: InkKey): ShellKey | null {
  if (key.escape || input === "q") return "quit";
  if (key.upArrow) return "up";
  if (key.downArrow) return "down";
  if (key.return) return "enter";
  if (key.tab === true || input === "\t") return "tab";
  if (input === " ") return "space";
  if (input === "a") return "a";
  if (input === "o") return "o";
  if (input === "d") return "d";
  return null;
}
