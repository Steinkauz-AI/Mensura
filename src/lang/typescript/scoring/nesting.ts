import ts from "typescript";
import { isFunctionLike } from "../source/index.js";


export function nestingOf(fn: ts.Node): number {
  let max = 0;

  const visit = (node: ts.Node, nest: number): void => {
    if (node !== fn && isFunctionLike(node)) return;

    if (ts.isIfStatement(node)) {
      if (isElseIf(node)) {
        visit(node.expression, nest);
        enter(node.thenStatement, nest);
        visitElse(node.elseStatement, nest);
        return;
      }
      visit(node.expression, nest);
      enter(node.thenStatement, nest);
      visitElse(node.elseStatement, nest);
      return;
    }
    if (ts.isForStatement(node)) {
      if (node.initializer) visit(node.initializer, nest);
      if (node.condition) visit(node.condition, nest);
      if (node.incrementor) visit(node.incrementor, nest);
      enter(node.statement, nest);
      return;
    }
    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      visit(node.initializer, nest);
      visit(node.expression, nest);
      enter(node.statement, nest);
      return;
    }
    if (ts.isWhileStatement(node)) {
      visit(node.expression, nest);
      enter(node.statement, nest);
      return;
    }
    if (ts.isDoStatement(node)) {
      enter(node.statement, nest);
      visit(node.expression, nest);
      return;
    }
    if (ts.isSwitchStatement(node)) {
      visit(node.expression, nest);
      const deeper = nest + 1;
      if (deeper > max) max = deeper;
      for (const clause of node.caseBlock.clauses) {
        visit(clause, deeper);
      }
      return;
    }
    if (ts.isCatchClause(node)) {
      if (node.variableDeclaration) visit(node.variableDeclaration, nest);
      enter(node.block, nest);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, nest);
      enter(node.whenTrue, nest);
      enter(node.whenFalse, nest);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, nest));
  };

  const enter = (body: ts.Node, nest: number): void => {
    const deeper = nest + 1;
    if (deeper > max) max = deeper;
    visit(body, deeper);
  };

  const visitElse = (elseStatement: ts.Statement | undefined, nest: number): void => {
    if (!elseStatement) return;
    if (ts.isIfStatement(elseStatement)) {
      visit(elseStatement, nest);
      return;
    }
    visit(elseStatement, nest + 1);
  };

  visit(fn, 0);
  return max;
}

function isElseIf(node: ts.IfStatement): boolean {
  const parent = node.parent;
  return ts.isIfStatement(parent) && parent.elseStatement === node;
}
