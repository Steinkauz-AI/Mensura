import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function resolveCliLaunchArgs(pkgRoot: string, argv: string[]): string[] {
  const built = join(pkgRoot, "dist", "cli", "index.js");
  const cliArgs = argv.slice(2);
  if (existsSync(built)) {
    return [built, ...cliArgs];
  }
  const require = createRequire(import.meta.url);
  const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
  return [tsxCli, join(pkgRoot, "src", "cli", "index.ts"), ...cliArgs];
}
