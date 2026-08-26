#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(pkgRoot, "dist", "cli", "index.js");

let args;
if (existsSync(built)) {
  args = [built, ...process.argv.slice(2)];
} else {
  const require = createRequire(import.meta.url);
  const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
  args = [tsxCli, join(pkgRoot, "src", "cli", "index.ts"), ...process.argv.slice(2)];
}

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
