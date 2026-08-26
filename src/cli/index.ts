import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runMensuraCli } from "./cli.js";

export { runMensuraCli } from "./cli.js";
export {
  CHECK_DEFAULT_MAX,
  parseMensuraArgs,
  usage,
  type MensuraCommand,
} from "./args.js";
export * from "./format/index.js";

function isDirectRun(argv: string[], url: string): boolean {
  const self = fileURLToPath(url);
  return argv.slice(1).some((arg) => {
    try {
      return realpathSync(arg) === realpathSync(self);
    } catch {
      return false;
    }
  });
}

if (isDirectRun(process.argv, import.meta.url)) {
  runMensuraCli(process.argv.slice(2), process.cwd()).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}
