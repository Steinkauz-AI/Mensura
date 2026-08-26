import type { UnparsedFile } from "../source/types.js";

export type ImportEdgeKind = "value" | "type";

export type ImportNode = {
  path: string;
  
  packageDir: string;
};

export type ImportEdge = {
  from: string;
  to: string;
  kind: ImportEdgeKind;
};

export type WorkspacePackage = {
  dir: string;
  name: string;
  publicFiles: string[];
};

export type ImportGraph = {
  nodes: ImportNode[];
  edges: ImportEdge[];
  packages: WorkspacePackage[];
  unparsed: UnparsedFile[];
};
