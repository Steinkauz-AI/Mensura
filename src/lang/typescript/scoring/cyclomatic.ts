import ts from "typescript";
import { isFunctionLike } from "../source/index.js";


export function complexityOf(fn: ts.Node): number {
  let score = 1;
  const visit = (node: ts.Node): void => {
    if (node !== fn && isFunctionLike(node)) return;
    if (isDecision(node)) score += 1;
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return score;
}

function isDecision(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.CaseClause:
    case ts.SyntaxKind.CatchClause:
    case ts.SyntaxKind.ConditionalExpression:
      return true;
    case ts.SyntaxKind.BinaryExpression: {
      const op = (node as ts.BinaryExpression).operatorToken.kind;
      return (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      );
    }
    default:
      return false;
  }
}
