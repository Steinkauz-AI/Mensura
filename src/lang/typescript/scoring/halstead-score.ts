import ts from "typescript";
import { walkHalstead } from "./halstead-visit.js";

export type HalsteadMeasures = {
  volume: number;
  difficulty: number;
  effort: number;
};


export function halsteadOf(fn: ts.Node): HalsteadMeasures {
  const operators: string[] = [];
  const operands: string[] = [];
  walkHalstead(
    fn,
    (kind) => {
      operators.push(kind);
    },
    (name) => {
      operands.push(name);
    },
  );
  return measuresOf(operators, operands);
}

function measuresOf(operators: string[], operands: string[]): HalsteadMeasures {
  const n1 = unique(operators);
  const n2 = unique(operands);
  const N1 = operators.length;
  const N2 = operands.length;
  const n = n1 + n2;
  const N = N1 + N2;
  const volume = n === 0 ? 0 : N * Math.log2(n);
  const difficulty = n2 === 0 ? 0 : (n1 / 2) * (N2 / n2);
  const effort = volume * difficulty;
  return {
    volume: round2(volume),
    difficulty: round2(difficulty),
    effort: round2(effort),
  };
}

function unique(tokens: string[]): number {
  return new Set(tokens).size;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
