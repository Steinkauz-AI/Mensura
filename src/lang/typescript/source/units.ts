import ts from "typescript";
import type { ComplexityUnit, ComplexityUnitKind } from "./types.js";

export type ParsedFile = {
  units: ComplexityUnit[];
  parseErrorCount: number;
};

type DiagnosticsSource = { parseDiagnostics?: readonly ts.Diagnostic[] };

export type UnitMeasures = {
  complexity: number;
  difficulty?: number;
  effort?: number;
  volume?: number;
  cyclomatic?: number;
  loc?: number;
};

export type UnitScore = (fn: ts.Node) => number | UnitMeasures;


export function unitsInFile(
  path: string,
  text: string,
  scriptKind: ts.ScriptKind,
  score: UnitScore,
): ParsedFile {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const units: ComplexityUnit[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node) && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source));
      const end = source.getLineAndCharacterOfPosition(node.end);
      const measures = asMeasures(score(node));
      units.push({
        path,
        name: unitName(node),
        kind: unitKind(node),
        startLine: start.line + 1,
        endLine: end.line + 1,
        ...measures,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return {
    units,
    parseErrorCount: (source as DiagnosticsSource).parseDiagnostics?.length ?? 0,
  };
}

function asMeasures(score: number | UnitMeasures): UnitMeasures {
  return typeof score === "number" ? { complexity: score } : score;
}

export function isFunctionLike(
  node: ts.Node,
): node is
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

export function unitKind(node: ts.Node): ComplexityUnitKind {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isArrowFunction(node)) return "arrow";
  return "function";
}

export function unitName(node: ts.Node): string {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  const bound = bindingName(node);
  if (bound) return bound;
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText();
  }
  return "(anonymous)";
}

function bindingName(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (!parent) return undefined;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return ts.isIdentifier(parent.name) ? parent.name.text : parent.name.getText();
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  ) {
    return parent.left.text;
  }
  return undefined;
}
