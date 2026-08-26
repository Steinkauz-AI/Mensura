import ts from "typescript";
import { isFunctionLike, unitName } from "../source/index.js";

const LOGICAL_OPS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
]);


export function cognitiveOf(fn: ts.Node): number {
  const ownName = unitName(fn);
  let score = 0;
  let recursive = false;

  const visit = (node: ts.Node, nest: number): void => {
    if (node !== fn && isFunctionLike(node)) return;

    if (ts.isIfStatement(node)) {
      if (isElseIf(node)) {
        score += 1;
      } else {
        score += 1 + nest;
      }
      visit(node.expression, nest);
      visit(node.thenStatement, nest + 1);
      if (node.elseStatement) {
        if (ts.isIfStatement(node.elseStatement)) {
          visit(node.elseStatement, nest);
        } else {
          score += 1;
          visit(node.elseStatement, nest + 1);
        }
      }
      return;
    }
    if (ts.isForStatement(node)) {
      score += 1 + nest;
      if (node.initializer) visit(node.initializer, nest);
      if (node.condition) visit(node.condition, nest);
      if (node.incrementor) visit(node.incrementor, nest);
      visit(node.statement, nest + 1);
      return;
    }
    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      score += 1 + nest;
      visit(node.initializer, nest);
      visit(node.expression, nest);
      visit(node.statement, nest + 1);
      return;
    }
    if (ts.isWhileStatement(node)) {
      score += 1 + nest;
      visit(node.expression, nest);
      visit(node.statement, nest + 1);
      return;
    }
    if (ts.isDoStatement(node)) {
      score += 1 + nest;
      visit(node.statement, nest + 1);
      visit(node.expression, nest);
      return;
    }
    if (ts.isSwitchStatement(node)) {
      score += 1 + nest;
      visit(node.expression, nest);
      for (const clause of node.caseBlock.clauses) {
        visit(clause, nest + 1);
      }
      return;
    }
    if (ts.isCatchClause(node)) {
      score += 1 + nest;
      if (node.variableDeclaration) visit(node.variableDeclaration, nest);
      visit(node.block, nest + 1);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      score += 1 + nest;
      visit(node.condition, nest);
      visit(node.whenTrue, nest + 1);
      visit(node.whenFalse, nest + 1);
      return;
    }
    if (isLogical(node) && isLogicalRoot(node)) {
      score += logicalSequences(node);
    }
    if (
      (ts.isBreakStatement(node) || ts.isContinueStatement(node)) &&
      node.label
    ) {
      score += 1;
    }
    if (!recursive && isDirectRecursion(node, ownName)) {
      recursive = true;
      score += 1;
    }
    ts.forEachChild(node, (child) => visit(child, nest));
  };

  visit(fn, 0);
  return score;
}

function isElseIf(node: ts.IfStatement): boolean {
  const parent = node.parent;
  return ts.isIfStatement(parent) && parent.elseStatement === node;
}

function isLogical(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && LOGICAL_OPS.has(node.operatorToken.kind);
}

function isLogicalRoot(node: ts.BinaryExpression): boolean {
  return !isInsideLogicalChain(node);
}

function isInsideLogicalChain(node: ts.Node): boolean {
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) {
    parent = parent.parent;
  }
  return parent !== undefined && isLogical(parent);
}

function logicalSequences(node: ts.BinaryExpression): number {
  const ops: ts.SyntaxKind[] = [];
  const collect = (n: ts.Node): void => {
    if (ts.isParenthesizedExpression(n)) {
      collect(n.expression);
      return;
    }
    if (isLogical(n)) {
      collect(n.left);
      ops.push(n.operatorToken.kind);
      collect(n.right);
      return;
    }
  };
  collect(node);
  let sequences = 0;
  let prev: ts.SyntaxKind | undefined;
  for (const op of ops) {
    if (op !== prev) {
      sequences += 1;
      prev = op;
    }
  }
  return sequences;
}

function isDirectRecursion(node: ts.Node, ownName: string): boolean {
  if (ownName === "(anonymous)" || ownName === "constructor") return false;
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text === ownName;
  return (
    ts.isPropertyAccessExpression(expr) &&
    expr.expression.kind === ts.SyntaxKind.ThisKeyword &&
    expr.name.text === ownName
  );
}
