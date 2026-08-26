
export function isTestSourcePath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return /\.(?:test|spec)\./.test(base);
}
