import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { toPosix } from "./source/walk.js";

export type ProjectConfigs = {
  optionsByFile: Map<string, ts.CompilerOptions>;
  inputs: Map<string, string>;
};

export function loadProjectConfigs(root: string, paths: readonly string[]): ProjectConfigs {
  const checkout = resolve(root);
  const inputs = new Map<string, string>();
  const optionsByFile = new Map<string, ts.CompilerOptions>();
  const byDirectory = new Map<string, ts.CompilerOptions>();
  const host = configHost(checkout, inputs);

  function optionsAt(dir: string): ts.CompilerOptions {
    const cached = byDirectory.get(dir);
    if (cached) return cached;
    const config = ["tsconfig.json", "jsconfig.json"]
      .map((name) => join(dir, name))
      .find(host.fileExists);
    const options = config
      ? parseConfig(config, host)
      : dir === checkout ? {} : optionsAt(dirname(dir));
    byDirectory.set(dir, options);
    return options;
  }

  for (const path of paths) {
    optionsByFile.set(path, optionsAt(dirname(join(checkout, path))));
  }
  return { optionsByFile, inputs };
}

function configHost(root: string, inputs: Map<string, string>): ts.ParseConfigFileHost {
  return {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => root,
    readDirectory: () => [],
    fileExists: (path) => insideCheckout(root, path) && ts.sys.fileExists(path),
    readFile: (path) => {
      if (!insideCheckout(root, path)) return undefined;
      const text = ts.sys.readFile(path);
      if (text !== undefined) inputs.set(toPosix(relative(root, path)), text);
      return text;
    },
    onUnRecoverableConfigFileDiagnostic: failConfig,
  };
}

function parseConfig(path: string, host: ts.ParseConfigFileHost): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(toPosix(path), {}, host);
  // Source discovery belongs to Mensura; empty TypeScript file lists are valid here.
  const error = parsed?.errors.find((diagnostic) => ![18002, 18003].includes(diagnostic.code));
  if (error) failConfig(error);
  return parsed?.options ?? {};
}

function failConfig(diagnostic: ts.Diagnostic): never {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  throw new Error(`Cannot load project config: ${message}`);
}

function insideCheckout(root: string, path: string): boolean {
  const rel = toPosix(relative(root, path));
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}
