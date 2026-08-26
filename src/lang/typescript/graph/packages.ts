import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { posix } from "node:path";
import type { WorkspacePackage } from "./types.js";
import { resolvePackageEntry, resolveSpecifier } from "./resolve.js";

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
    if (cache.has(dir)) {
      const hit = cache.get(dir);
      for (const step of chain) cache.set(step, hit);
      return hit;
    }
    chain.push(dir);
    try {
      await readFile(join(root, dir, "package.json"), "utf8");
      for (const step of chain) cache.set(step, dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (dir === "") {
      for (const step of chain) cache.set(step, undefined);
      return undefined;
    }
    dir = posix.dirname(dir);
    if (dir === ".") dir = "";
  }
}

async function readPackage(
  root: string,
  dir: string,
  files: ReadonlySet<string>,
): Promise<WorkspacePackage | undefined> {
  const raw = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8")) as PackageJson;
  if (typeof raw.name !== "string" || raw.name.length === 0) return undefined;
  const packagesByName = new Map([[raw.name, dir]]);
  const publicFiles = publicEntryFiles(dir, raw, files, packagesByName);
  return { dir, name: raw.name, publicFiles };
}

function publicEntryFiles(
  dir: string,
  pkg: PackageJson,
  files: ReadonlySet<string>,
  packagesByName: ReadonlyMap<string, string>,
): string[] {
  const fromExports = exportTargets(pkg.exports);
  const resolved = new Set<string>();
  for (const target of fromExports) {
    const hit =
      resolveSpecifier(
        dir === "" ? "package.json" : `${dir}/package.json`,
        target.startsWith(".") ? target : `./${target}`,
        files,
        packagesByName,
      ) ?? rewriteDistToSrc(dir, target, files);
    if (hit) resolved.add(hit);
  }
  if (resolved.size > 0) return [...resolved].sort();
  const entry = resolvePackageEntry(dir, files);
  return entry ? [entry] : [];
}

function exportTargets(exportsField: unknown): string[] {
  if (typeof exportsField === "string") return [exportsField];
  if (!exportsField || typeof exportsField !== "object") return [];
  const out: string[] = [];
  collectExportStrings(exportsField, out);
  return out;
}

function collectExportStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectExportStrings(nested, out);
  }
}

function rewriteDistToSrc(
  dir: string,
  target: string,
  files: ReadonlySet<string>,
): string | undefined {
  const cleaned = target.replace(/^\.\//, "");
  const rewritten = cleaned.replace(/(^|\/)dist\//, "$1src/").replace(/\.js$/, ".ts");
  const path = dir === "" ? rewritten : posix.join(dir, rewritten);
  return files.has(path) ? path : undefined;
}
