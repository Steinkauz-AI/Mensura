import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  MENSURA_CONFIG_FILE,
  MENSURA_DIR,
  loadMensuraConfig,
  pathMatchesRule,
} from "./config/index.js";
import { listSourceFiles, SKIP_DIRS, toPosix } from "../lang/typescript/source/walk.js";
import { loadProjectConfigs } from "../lang/typescript/project.js";


export async function hashMetricInputs(root: string): Promise<string> {
  const config = await loadMensuraConfig(root);
  const skipDirs = new Set([...SKIP_DIRS, ...config.skipDirectories]);
  const allGrainPaths = config.skipPaths
    .filter((rule) => rule.grains === "all")
    .map((rule) => rule.path);
  const files = (await listSourceFiles(root, undefined, skipDirs)).filter(
    (abs) =>
      !allGrainPaths.some((rulePath) =>
        pathMatchesRule(toPosix(relative(root, abs)), rulePath),
      ),
  );
  const hash = createHash("sha256");
  await hashSourceFiles(hash, root, files);
  await hashConfigFiles(hash, root);
  const projects = loadProjectConfigs(root, files.map((path) => toPosix(relative(root, path))));
  for (const [path, text] of [...projects.inputs].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path);
    hash.update("\0");
    hash.update(text);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function hashSourceFiles(
  hash: ReturnType<typeof createHash>,
  root: string,
  files: string[],
): Promise<void> {
  for (const abs of files) {
    hash.update(toPosix(relative(root, abs)));
    hash.update("\0");
    hash.update(await readFile(abs));
    hash.update("\0");
  }
}

async function hashConfigFiles(
  hash: ReturnType<typeof createHash>,
  root: string,
): Promise<void> {
  for (const rel of ["package.json", `${MENSURA_DIR}/${MENSURA_CONFIG_FILE}`]) {
    try {
      hash.update(rel);
      hash.update("\0");
      hash.update(await readFile(join(root, rel)));
      hash.update("\0");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
