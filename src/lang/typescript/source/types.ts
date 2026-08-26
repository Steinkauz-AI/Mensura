export type ComplexityUnitKind =
  | "function"
  | "method"
  | "constructor"
  | "getter"
  | "setter"
  | "arrow"
  | "file";

export type ComplexityUnit = {
  path: string;
  name: string;
  kind: ComplexityUnitKind;
  startLine: number;
  endLine: number;
  
  complexity: number;
  
  difficulty?: number;
  
  effort?: number;
  
  volume?: number;
  
  cyclomatic?: number;
  
  loc?: number;
  
  coverage?: number;
  
  ca?: number;
  
  ce?: number;
  
  instability?: number;
};

export type FileComplexity = {
  path: string;
  functionCount: number;
  minComplexity: number;
  maxComplexity: number;
  sumComplexity: number;
};

export type UnparsedFile = {
  path: string;
  errorCount: number;
};

export type ComplexityReport = {
  units: ComplexityUnit[];
  files: FileComplexity[];
  unparsed: UnparsedFile[];
  
  score?: number;
};
