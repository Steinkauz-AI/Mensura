import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isDirectRun(argv: string[], url: string): boolean {
  const self = fileURLToPath(url);
  return argv.slice(1).some((arg) => {
    try {
      return realpathSync(arg) === realpathSync(self);
    } catch {
      return false;
    }
  });
}
