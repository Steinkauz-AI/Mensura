import { isDirectRun } from "./direct-run.js";
import { runMensuraCli } from "./cli.js";

export { runMensuraCli } from "./cli.js";
export {
  CHECK_DEFAULT_MAX,
  parseMensuraArgs,
  usage,
  type MensuraCommand,
} from "./args.js";
export * from "./format/index.js";

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
