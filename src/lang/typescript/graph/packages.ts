import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { posix } from "node:path";
import type { WorkspacePackage } from "./types.js";
import { resolveExportFile, resolvePackageEntry } from "./resolve.js";
import { interpretExportTarget, subpathExports } from "./exports.js";

type PackageJson = {
  name?: unknown;
  exports?: unknown;
  main?: unknown;
};


export async function loadWorkspacePackages(
  root: string,
  sourcePaths: readonly string[],
  files: ReadonlySet<string>,
): Promise<WorkspacePackage[]> {
  const dirCache = new Map<string, string | undefined>();
  const byDir = new Map<string, WorkspacePackage>();
  for (const path of sourcePaths) {
    const dir = await nearestPackageDir(root, posix.dirname(path), dirCache);
    if (dir === undefined || byDir.has(dir)) continue;
    const pkg = await readPackage(root, dir, files);
    if (pkg) byDir.set(dir, pkg);
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
}

export function packageDirOf(
  path: string,
  packages: readonly WorkspacePackage[],
): string {
  const dirs = packages.map((pkg) => pkg.dir).sort((a, b) => b.length - a.length);
  const from = posix.dirname(path);
  for (const dir of dirs) {
    if (dir === "") return "";
    if (from === dir || from.startsWith(`${dir}/`)) return dir;
  }
  return packages.some((pkg) => pkg.dir === "") ? "" : "";
}

async function nearestPackageDir(
  root: string,
  startDir: string,
  cache: Map<string, string | undefined>,
): Promise<string | undefined> {
  let dir = startDir === "." ? "" : startDir;
  const chain: string[] = [];
  while (true) {
    const cached = cachedPackageDir(dir, chain, cache);
    if (cached.hit) return cached.value;
    chain.push(dir);
    const found = await tryPackageAt(root, dir);
    if (found) {
      fillCache(chain, dir, cache);
      return dir;
    }
    if (dir === "") {
      fillCache(chain, undefined, cache);
      return undefined;
    }
    dir = parentDir(dir);
  }
}

function cachedPackageDir(
  dir: string,
  chain: string[],
  cache: Map<string, string | undefined>,
): { hit: true; value: string | undefined } | { hit: false } {
  if (!cache.has(dir)) return { hit: false };
  const value = cache.get(dir);
  fillCache(chain, value, cache);
  return { hit: true, value };
}

async function tryPackageAt(root: string, dir: string): Promise<boolean> {
  try {
    await readFile(join(root, dir, "package.json"), "utf8");
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
}

function fillCache(
  chain: string[],
  value: string | undefined,
  cache: Map<string, string | undefined>,
): void {
  for (const step of chain) cache.set(step, value);
}

function parentDir(dir: string): string {
  const next = posix.dirname(dir);
  return next === "." ? "" : next;
}

async function readPackage(
  root: string,
  dir: string,
  files: ReadonlySet<string>,
): Promise<WorkspacePackage | undefined> {
  const raw = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8")) as PackageJson;
  if (typeof raw.name !== "string" || raw.name.length === 0) return undefined;
  const publicFiles = publicEntryFiles(dir, raw, files);
  return { dir, name: raw.name, publicFiles, exports: raw.exports };
}

function publicEntryFiles(
  dir: string,
  pkg: PackageJson,
  files: ReadonlySet<string>,
): string[] {
  const resolved = new Set<string>();
  const fromExports = subpathExports(pkg.exports);
  if (Object.hasOwn(pkg, "exports")) {
    if (fromExports) collectExportFiles(fromExports.values(), dir, files, resolved);
    return [...resolved].sort();
  }
  const entry = resolvePackageEntry(dir, files);
  return entry ? [entry] : [];
}

function collectExportFiles(
  values: Iterable<unknown>,
  dir: string,
  files: ReadonlySet<string>,
  resolved: Set<string>,
): void {
  for (const value of values) {
    for (const target of interpretExportTarget(value)) {
      const hit = resolveExportFile(dir, target, files);
      if (hit) resolved.add(hit);
    }
  }
}
