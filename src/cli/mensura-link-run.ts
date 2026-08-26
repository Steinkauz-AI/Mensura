import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  binDir,
  pathHas,
  shimDest,
  shimPaths,
  windowsShimContents,
} from "./mensura-link.js";

export type LinkIo = {
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => void;
};

const defaultIo: LinkIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  exit: (code) => process.exit(code),
};

export function packageRootFromScript(scriptUrl: string): string {
  return join(dirname(fileURLToPath(scriptUrl)), "..");
}

export function runMensuraLink(
  argv: string[],
  options: {
    pkgRoot: string;
    isWin?: boolean;
    home?: string;
    env?: NodeJS.ProcessEnv;
    io?: LinkIo;
  },
): void {
  const isWin = options.isWin ?? process.platform === "win32";
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const io = options.io ?? defaultIo;
  const src = join(options.pkgRoot, "bin", "mensura.mjs");
  const cmd = argv[2] ?? "link";
  if (cmd === "link") {
    linkMensura({ pkgRoot: options.pkgRoot, src, isWin, home, env, io });
    return;
  }
  if (cmd === "unlink") {
    unlinkMensura({ src, isWin, home, env, io });
    return;
  }
  io.error(`usage: ${argv[1] ?? "mensura-link"} [link|unlink]`);
  io.exit(2);
}

function linkMensura(args: {
  pkgRoot: string;
  src: string;
  isWin: boolean;
  home: string;
  env: NodeJS.ProcessEnv;
  io: LinkIo;
}): void {
  if (!existsSync(args.src)) {
    args.io.error(`missing CLI bin: ${args.src}`);
    args.io.exit(1);
    return;
  }
  const dir = binDir(args.isWin, args.home, args.env);
  mkdirSync(dir, { recursive: true });
  installShims(dir, args.src, args.isWin);
  args.io.log(`linked ${shimDest(args.isWin, dir, "mensura")} -> ${args.src}`);
  if (!pathHas(args.env.PATH ?? "", dir, args.isWin, resolve)) {
    args.io.error(`mensura is not on PATH. Add ${dir} to PATH, then retry.`);
    args.io.exit(1);
  }
}

function unlinkMensura(args: {
  src: string;
  isWin: boolean;
  home: string;
  env: NodeJS.ProcessEnv;
  io: LinkIo;
}): void {
  const dir = binDir(args.isWin, args.home, args.env);
  const paths = shimPaths(args.isWin, dir, "mensura");
  const existing = paths.filter((path) => existsSync(path));
  if (existing.length === 0) {
    args.io.error(`no mensura shim at ${dir}`);
    args.io.exit(1);
    return;
  }
  for (const path of paths) rmSync(path, { force: true });
  args.io.log(`removed ${existing.join(", ")}`);
}

function installShims(dir: string, src: string, isWin: boolean): void {
  if (isWin) {
    const contents = windowsShimContents(src);
    writeFileSync(join(dir, "mensura.CMD"), contents.CMD);
    writeFileSync(join(dir, "mensura.ps1"), contents.ps1);
    writeFileSync(join(dir, "mensura"), contents.posix);
    return;
  }
  chmodSync(src, 0o755);
  const linkPath = join(dir, "mensura");
  rmSync(linkPath, { force: true });
  symlinkSync(src, linkPath);
}
