#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRun = join(root, "dist", "cli", "mensura-link-run.js");
const mod = existsSync(distRun)
  ? await import(pathToFileURL(distRun).href)
  : await import(pathToFileURL(join(root, "src", "cli", "mensura-link-run.ts")).href);
mod.runMensuraLink(process.argv, { pkgRoot: root });
