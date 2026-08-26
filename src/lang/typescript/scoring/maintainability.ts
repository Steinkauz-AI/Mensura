import ts from "typescript";
import { complexityOf } from "./cyclomatic.js";
import { halsteadOf } from "./halstead-score.js";
import { isFunctionLike } from "../source/index.js";

export type MaintainabilityMeasures = {
  
  index: number;
  volume: number;
  cyclomatic: number;
  loc: number;
};


export function maintainabilityOf(fn: ts.Node): MaintainabilityMeasures {
  const { volume } = halsteadOf(fn);
  const cyclomatic = complexityOf(fn);
  const loc = locOf(fn);
  return {
    index: microsoftIndex(volume, cyclomatic, loc),
    volume,
    cyclomatic,
    loc,
  };
}

function microsoftIndex(volume: number, cyclomatic: number, loc: number): number {
  const V = Math.max(volume, 1);
  const L = Math.max(loc, 1);
  const raw = 171 - 5.2 * Math.log(V) - 0.23 * cyclomatic - 16.2 * Math.log(L);
  const scaled = (raw * 100) / 171;
  return clamp100(round2(scaled));
}


function locOf(fn: ts.Node): number {
  const source = fn.getSourceFile();
  const lines = new Set<number>();

  const visit = (node: ts.Node): void => {
    if (node !== fn && isFunctionLike(node)) return;
    if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node)) return;

    const children = node.getChildren(source);
    if (children.length === 0) {
      if (node.pos >= node.end) return;
      const start = node.getStart(source);
      if (start >= node.end) return;
      const last = Math.max(start, node.end - 1);
      const from = source.getLineAndCharacterOfPosition(start).line;
      const to = source.getLineAndCharacterOfPosition(last).line;
      for (let line = from; line <= to; line++) lines.add(line);
      return;
    }
    for (const child of children) visit(child);
  };

  visit(fn);
  return lines.size;
}

function clamp100(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
