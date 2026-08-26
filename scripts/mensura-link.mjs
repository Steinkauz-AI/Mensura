#!/usr/bin/env node


import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "bin", "mensura.mjs");
const isWin = process.platform === "win32";

function binDir() {
  if (isWin) return windowsBinDir();
  return join(homedir(), ".local", "bin");
}

function windowsBinDir() {
  const dir = process.env.PNPM_HOME || join(process.env.LOCALAPPDATA ?? "", "pnpm");
  if (!dir || dir === "pnpm") {
    throw new Error("PNPM_HOME / LOCALAPPDATA is unset; cannot place Windows shims.");
  }
  return dir;
}

function shimPaths(dir, name) {
  if (!isWin) return [join(dir, name)];
  return [join(dir, name), join(dir, `${name}.CMD`), join(dir, `${name}.ps1`)];
}

function removeShims(dir, name) {
  for (const path of shimPaths(dir, name)) {
    rmSync(path, { force: true });
  }
}

function writeWindowsShims(dir) {
  const posixSrc = src.replaceAll("\\", "/");
  writeFileSync(join(dir, "mensura.CMD"), `@ECHO off\r\nnode "${src}" %*\r\n`);
  writeFileSync(
    join(dir, "mensura.ps1"),
    `#!/usr/bin/env pwsh\nnode "${src}" @args\nexit $LASTEXITCODE\n`,
  );
  writeFileSync(join(dir, "mensura"), `#!/bin/sh\nexec node "${posixSrc}" "$@"\n`);
}

function pathHas(dir) {
  const parts = (process.env.PATH ?? "").split(isWin ? ";" : ":");
  const target = resolve(dir);
  return parts.some((part) => part && resolve(part) === target);
}

function link() {
  ensureBinExists();
  const dir = binDir();
  mkdirSync(dir, { recursive: true });
  installShims(dir);
  console.log(`linked ${shimDest(dir)} -> ${src}`);
  requireOnPath(dir);
}

function ensureBinExists() {
  if (existsSync(src)) return;
  console.error(`missing CLI bin: ${src}`);
  process.exit(1);
}

function installShims(dir) {
  if (isWin) {
    writeWindowsShims(dir);
    return;
  }
  chmodSync(src, 0o755);
  const linkPath = join(dir, "mensura");
  rmSync(linkPath, { force: true });
  symlinkSync(src, linkPath);
}

function shimDest(dir) {
  return isWin ? join(dir, "mensura.CMD") : join(dir, "mensura");
}

function requireOnPath(dir) {
  if (pathHas(dir)) return;
  console.error(`mensura is not on PATH. Add ${dir} to PATH, then retry.`);
  process.exit(1);
}

function unlink() {
  const dir = binDir();
  const paths = shimPaths(dir, "mensura");
  const existing = paths.filter((path) => existsSync(path));
  if (existing.length === 0) {
    console.error(`no mensura shim at ${dir}`);
    process.exit(1);
  }
  removeShims(dir, "mensura");
  console.log(`removed ${existing.join(", ")}`);
}

const cmd = process.argv[2] ?? "link";
if (cmd === "link") link();
else if (cmd === "unlink") unlink();
else {
  console.error(`usage: ${process.argv[1]} [link|unlink]`);
  process.exit(2);
}
