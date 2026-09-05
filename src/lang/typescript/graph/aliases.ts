import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { loadProjectConfigs } from "../project.js";
import { toPosix } from "../source/walk.js";

export type AliasResolver = (from: string, specifier: string) => string | undefined;

export function createAliasResolver(root: string, files: ReadonlySet<string>): AliasResolver {
  const checkout = resolve(root);
  const { optionsByFile } = loadProjectConfigs(checkout, [...files]);
  const directories = sourceDirectories(files);
  const host: ts.ModuleResolutionHost = {
    fileExists: (path) => files.has(toPosix(relative(checkout, path))),
    readFile: () => undefined,
    directoryExists: (path) => directories.has(toPosix(relative(checkout, path))),
    getCurrentDirectory: () => checkout,
  };

  return (from, specifier) => {
    if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
    const options = optionsByFile.get(from);
    if (!options?.paths && !options?.baseUrl) return undefined;
    // Probe only scored files, independent of the target's build and module mode.
    const resolved = ts.resolveModuleName(specifier, join(checkout, from), {
      ...options,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
    }, host).resolvedModule;
    if (!resolved) return undefined;
    const path = toPosix(relative(checkout, resolved.resolvedFileName));
    return files.has(path) ? path : undefined;
  };
}

function sourceDirectories(files: ReadonlySet<string>): Set<string> {
  const directories = new Set<string>([""]);
  for (const file of files) {
    let dir = toPosix(dirname(file));
    while (dir !== "." && !directories.has(dir)) {
      directories.add(dir);
      dir = toPosix(dirname(dir));
    }
  }
  return directories;
}
