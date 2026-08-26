import type { LanguageBackend } from "../types.js";

export const typescriptBackend: LanguageBackend = {
  id: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
};
