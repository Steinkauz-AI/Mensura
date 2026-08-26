import type { WriteStream } from "node:tty";

type Output = { write(text: string): void; isTTY?: boolean };

export function writeStream(out: Output): WriteStream | undefined {
  if ("fd" in out || "on" in out) return out as WriteStream;
  return undefined;
}
