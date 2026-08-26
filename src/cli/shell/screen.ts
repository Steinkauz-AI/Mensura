
export function recoverScreen(out: { write(text: string): void }): void {
  out.write("\x1b[2J\x1b[H");
}
