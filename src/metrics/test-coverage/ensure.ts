import { spawn, type SpawnOptions } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type CoverageCommand = {
  manager: "npm" | "pnpm";
  script: string;
};

const SCRIPT = "test:coverage";


export async function coverageCommand(root: string): Promise<CoverageCommand> {
  let raw: string;
  try {
    raw = await readFile(join(root, "package.json"), "utf8");
  } catch {
    throw new Error(`No ${SCRIPT} script in package.json.`);
  }
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  } catch {
    throw new Error(`No ${SCRIPT} script in package.json.`);
  }
  if (typeof pkg.scripts?.[SCRIPT] !== "string") {
    throw new Error(`No ${SCRIPT} script in package.json.`);
  }
  let manager: CoverageCommand["manager"] = "npm";
  try {
    await readFile(join(root, "pnpm-lock.yaml"));
    manager = "pnpm";
  } catch {
    manager = "npm";
  }
  return { manager, script: SCRIPT };
}


export async function ensureTestCoverage(
  root: string,
  run: (cwd: string, command: CoverageCommand) => Promise<void> = runCoverage,
): Promise<void> {
  const command = await coverageCommand(root);
  await run(root, command);
}


export function coverageSpawnSpec(command: CoverageCommand): {
  file: string;
  args: string[];
  options: SpawnOptions;
} {
  const options: SpawnOptions = {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  };
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `${command.manager} run ${command.script}`],
      options,
    };
  }
  return {
    file: command.manager,
    args: ["run", command.script],
    options,
  };
}

function runCoverage(cwd: string, command: CoverageCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const spec = coverageSpawnSpec(command);
    const child = spawn(spec.file, spec.args, { cwd, ...spec.options });
    let stderr = "";
    child.stdout?.resume();
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command.manager} run ${command.script} exited ${code ?? -1}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

