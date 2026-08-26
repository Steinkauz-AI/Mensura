import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultMensuraConfig,
  MENSURA_CONFIG_FILE,
  MENSURA_DIR,
  parseMensuraConfig,
  serializeMensuraConfig,
  type MensuraConfig,
} from "./config.js";

export {
  MENSURA_CONFIG_FILE,
  MENSURA_DIR,
  parseMensuraConfig,
  serializeMensuraConfig,
  defaultMensuraConfig,
};
export type { MensuraConfig };

export async function loadMensuraConfig(
  root: string,
): Promise<MensuraConfig> {
  const source = join(root, MENSURA_DIR, MENSURA_CONFIG_FILE);
  let text: string;
  try {
    text = await readFile(source, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultMensuraConfig();
    }
    throw err;
  }
  return parseMensuraConfig(
    JSON.parse(text),
    `${MENSURA_DIR}/${MENSURA_CONFIG_FILE}`,
  );
}

export async function ensureMensuraConfigFile(root: string): Promise<void> {
  const dir = join(root, MENSURA_DIR);
  const path = join(dir, MENSURA_CONFIG_FILE);
  try {
    await access(path);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path, serializeMensuraConfig(defaultMensuraConfig()), "utf8");
}

export async function ensureMensuraConfig(
  root: string,
): Promise<MensuraConfig> {
  await ensureMensuraConfigFile(root);
  return loadMensuraConfig(root);
}

export async function loadMensuraConfigOrDefault(
  root: string,
): Promise<MensuraConfig> {
  try {
    return await loadMensuraConfig(root);
  } catch {
    return defaultMensuraConfig();
  }
}
