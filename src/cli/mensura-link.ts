import { join } from "node:path";

export function unixBinDir(home: string): string {
  return join(home, ".local", "bin");
}

export function windowsBinDir(env: NodeJS.ProcessEnv): string {
  const dir = env.PNPM_HOME || join(env.LOCALAPPDATA ?? "", "pnpm");
  if (!dir || dir === "pnpm") {
    throw new Error("PNPM_HOME / LOCALAPPDATA is unset; cannot place Windows shims.");
  }
  return dir;
}

export function binDir(isWin: boolean, home: string, env: NodeJS.ProcessEnv): string {
  if (isWin) return windowsBinDir(env);
  return unixBinDir(home);
}

export function shimPaths(isWin: boolean, dir: string, name: string): string[] {
  if (!isWin) return [join(dir, name)];
  return [join(dir, name), join(dir, `${name}.CMD`), join(dir, `${name}.ps1`)];
}

export function mensuraCmdContent(src: string): string {
  return `@ECHO off\r\nnode "${src}" %*\r\n`;
}

export function mensuraPs1Content(src: string): string {
  return `#!/usr/bin/env pwsh\nnode "${src}" @args\nexit $LASTEXITCODE\n`;
}

export function mensuraPosixShimContent(src: string): string {
  const posixSrc = src.replaceAll("\\", "/");
  return `#!/bin/sh\nexec node "${posixSrc}" "$@"\n`;
}

export function windowsShimContents(src: string): Readonly<Record<"CMD" | "ps1" | "posix", string>> {
  return {
    CMD: mensuraCmdContent(src),
    ps1: mensuraPs1Content(src),
    posix: mensuraPosixShimContent(src),
  };
}

export function pathHas(
  pathEnv: string,
  dir: string,
  isWin: boolean,
  resolveFn: (path: string) => string,
): boolean {
  const parts = pathEnv.split(isWin ? ";" : ":");
  const target = resolveFn(dir);
  return parts.some((part) => part && resolveFn(part) === target);
}

export function shimDest(isWin: boolean, dir: string, name: string): string {
  return isWin ? join(dir, `${name}.CMD`) : join(dir, name);
}
