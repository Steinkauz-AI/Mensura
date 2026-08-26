/** Paths under tests trees, or basenames matching `*.test.*` / `*.spec.*`. */
export function isTestSourcePath(path: string): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  if (parts.some((part) => part === "tests" || part === "__tests__")) return true;
  const base = parts.pop() ?? path;
  return /\.(?:test|spec)\./.test(base);
}
