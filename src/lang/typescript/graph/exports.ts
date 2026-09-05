/**
 * Shared interpretation of `package.json#exports` for workspace packages.
 *
 * Import resolution (`resolve.ts`) and encapsulation public-file detection
 * (`packages.ts`) both build on these helpers so the declared package
 * interface means the same thing in both places.
 *
 * Only exact subpath keys (`"."` and `"./subpath"`) are honored. Wildcard
 * keys containing `"*"` are out of scope and ignored.
 */

export function subpathExports(exportsField: unknown): Map<string, unknown> | undefined {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return new Map([[".", exportsField]]);
  }
  if (!exportsField || typeof exportsField !== "object") return undefined;
  const entries = Object.entries(exportsField as Record<string, unknown>);
  if (entries.length === 0) return new Map();
  if (entries.every(([key]) => !key.startsWith("."))) {
    return new Map([[".", exportsField]]);
  }
  const map = new Map<string, unknown>();
  for (const [key, value] of entries) {
    if (!key.startsWith(".") || key.includes("*")) continue;
    map.set(key, value);
  }
  return map;
}

export function exportTargetsForSubpath(exportsField: unknown, key: string): string[] {
  const value = subpathExports(exportsField)?.get(key);
  return value === undefined ? [] : interpretExportTarget(value);
}

export function exportTargetsForPackage(
  packageExports: ReadonlyMap<string, unknown> | undefined,
  name: string,
  subpath: string,
): string[] | undefined {
  const rawExports = packageExports?.get(name);
  if (rawExports === undefined) return undefined;
  return exportTargetsForSubpath(rawExports, subpath === "" ? "." : `./${subpath}`);
}

export function interpretExportTarget(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(interpretExportTarget);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const rest = Object.keys(record).filter((key) => key !== "import" && key !== "default");
    const ordered = ["import", "default", ...rest].filter((key) =>
      Object.hasOwn(record, key),
    );
    return ordered.flatMap((key) => interpretExportTarget(record[key]));
  }
  return [];
}
