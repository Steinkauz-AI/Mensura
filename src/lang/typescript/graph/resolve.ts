import { posix } from "node:path";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

const JS_TO_TS: Record<string, string> = {
  ".js": ".ts",
  ".jsx": ".tsx",
  ".mjs": ".mts",
  ".cjs": ".cts",
};


export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  files: ReadonlySet<string>,
  packagesByName: ReadonlyMap<string, string>,
): string | undefined {
  if (specifier.startsWith(".")) {
    return resolveRelative(posix.dirname(fromPath), specifier, files);
  }
  const bare = parseBareSpecifier(specifier);
  if (!bare) return undefined;
  const pkgDir = packagesByName.get(bare.name);
  if (pkgDir === undefined) return undefined;
  if (bare.subpath === "") {
    return resolvePackageEntry(pkgDir, files);
  }
  return resolveRelative(pkgDir, `./${bare.subpath}`, files);
}

export function parseBareSpecifier(
  specifier: string,
): { name: string; subpath: string } | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length < 2) return undefined;
    return { name: `${parts[0]}/${parts[1]}`, subpath: parts.slice(2).join("/") };
  }
  const slash = specifier.indexOf("/");
  if (slash < 0) return { name: specifier, subpath: "" };
  return { name: specifier.slice(0, slash), subpath: specifier.slice(slash + 1) };
}

export function resolvePackageEntry(
  pkgDir: string,
  files: ReadonlySet<string>,
): string | undefined {
  const prefixes = pkgDir === "" ? [] : [pkgDir];
  const bases = ["src/index", "index"];
  for (const base of bases) {
    const rel = prefixes.length === 0 ? base : posix.join(pkgDir, base);
    const hit = withExtensions(rel, files);
    if (hit) return hit;
  }
  return undefined;
}

function resolveRelative(
  fromDir: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | undefined {
  const joined = posix.normalize(posix.join(fromDir, specifier));
  const stripped = joined.replace(/^\.\//, "");
  if (files.has(stripped)) return stripped;
  const rewritten = rewriteJsExtension(stripped);
  if (rewritten !== stripped && files.has(rewritten)) return rewritten;
  const noExt = stripKnownExtension(stripped);
  const asFile = withExtensions(noExt, files);
  if (asFile) return asFile;
  return withExtensions(`${noExt}/index`, files);
}

function withExtensions(base: string, files: ReadonlySet<string>): string | undefined {
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

function rewriteJsExtension(path: string): string {
  for (const [from, to] of Object.entries(JS_TO_TS)) {
    if (path.endsWith(from) && !path.endsWith(`.d${from}`)) {
      return `${path.slice(0, -from.length)}${to}`;
    }
  }
  return path;
}

function stripKnownExtension(path: string): string {
  for (const ext of SOURCE_EXTENSIONS) {
    if (path.endsWith(ext)) return path.slice(0, -ext.length);
  }
  return path;
}
