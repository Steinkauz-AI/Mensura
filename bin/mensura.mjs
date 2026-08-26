#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "dist", "cli", "index.js");
const args = existsSync(built)
  ? [built, ...process.argv.slice(2)]
  : ["--import", "tsx", join(root, "src", "cli", "index.ts"), ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
