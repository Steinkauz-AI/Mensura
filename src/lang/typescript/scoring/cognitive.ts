import ts from "typescript";
import { isFunctionLike, unitName } from "../source/index.js";
import { isElseIf } from "./else-if.js";

const LOGICAL_OPS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
]);

type CognitiveCtx = {
  visit: (node: ts.Node, nest: number) => void;
  add: (points: number) => void;
  ownName: string;
  markRecursive: () => boolean;
};

type Handler = (node: ts.Node, nest: number, ctx: CognitiveCtx) => void;

export function cognitiveOf(fn: ts.Node): number {
  const ownName = unitName(fn);
  let score = 0;
  let recursive = false;

  const ctx: CognitiveCtx = {
    ownName,
    add: (points) => {
      score += points;
    },
    markRecursive: () => {
      if (recursive) return false;
      recursive = true;
      return true;
    },
    visit: (node, nest) => visitNode(fn, node, nest, ctx),
  };

  ctx.visit(fn, 0);
  return score;
}

function visitNode(
  fn: ts.Node,
  node: ts.Node,
  nest: number,
  ctx: CognitiveCtx,
): void {
  if (node !== fn && isFunctionLike(node)) return;
  const handler = HANDLERS[node.kind];
  if (handler) {
    handler(node, nest, ctx);
    return;
  }
  applyFlatIncrements(node, ctx);
  ts.forEachChild(node, (child) => ctx.visit(child, nest));
}

function applyFlatIncrements(node: ts.Node, ctx: CognitiveCtx): void {
  if (isLogical(node) && isLogicalRoot(node)) {
    ctx.add(logicalSequences(node));
  }
  if (
    (ts.isBreakStatement(node) || ts.isContinueStatement(node)) &&
    node.label
  ) {
    ctx.add(1);
  }
  if (isDirectRecursion(node, ctx.ownName) && ctx.markRecursive()) {
    ctx.add(1);
  }
}

function visitIf(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.IfStatement;
  ctx.add(isElseIf(stmt) ? 1 : 1 + nest);
  ctx.visit(stmt.expression, nest);
  ctx.visit(stmt.thenStatement, nest + 1);
  visitElseBranch(stmt.elseStatement, nest, ctx);
}

function visitElseBranch(
  elseStatement: ts.Statement | undefined,
  nest: number,
  ctx: CognitiveCtx,
): void {
  if (!elseStatement) return;
  if (ts.isIfStatement(elseStatement)) {
    ctx.visit(elseStatement, nest);
    return;
  }
  ctx.add(1);
  ctx.visit(elseStatement, nest + 1);
}

function visitFor(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.ForStatement;
  ctx.add(1 + nest);
  if (stmt.initializer) ctx.visit(stmt.initializer, nest);
  if (stmt.condition) ctx.visit(stmt.condition, nest);
  if (stmt.incrementor) ctx.visit(stmt.incrementor, nest);
  ctx.visit(stmt.statement, nest + 1);
}

function visitForInOrOf(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.ForInStatement | ts.ForOfStatement;
  ctx.add(1 + nest);
  ctx.visit(stmt.initializer, nest);
  ctx.visit(stmt.expression, nest);
  ctx.visit(stmt.statement, nest + 1);
}

function visitWhile(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.WhileStatement;
  ctx.add(1 + nest);
  ctx.visit(stmt.expression, nest);
  ctx.visit(stmt.statement, nest + 1);
}

function visitDo(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.DoStatement;
  ctx.add(1 + nest);
  ctx.visit(stmt.statement, nest + 1);
  ctx.visit(stmt.expression, nest);
}

function visitSwitch(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const stmt = node as ts.SwitchStatement;
  ctx.add(1 + nest);
  ctx.visit(stmt.expression, nest);
  for (const clause of stmt.caseBlock.clauses) {
    ctx.visit(clause, nest + 1);
  }
}

function visitCatch(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const clause = node as ts.CatchClause;
  ctx.add(1 + nest);
  if (clause.variableDeclaration) ctx.visit(clause.variableDeclaration, nest);
  ctx.visit(clause.block, nest + 1);
}

function visitConditional(node: ts.Node, nest: number, ctx: CognitiveCtx): void {
  const expr = node as ts.ConditionalExpression;
  ctx.add(1 + nest);
  ctx.visit(expr.condition, nest);
  ctx.visit(expr.whenTrue, nest + 1);
  ctx.visit(expr.whenFalse, nest + 1);
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
  collectLogicalOps(node, ops);
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

function collectLogicalOps(n: ts.Node, ops: ts.SyntaxKind[]): void {
  if (ts.isParenthesizedExpression(n)) {
    collectLogicalOps(n.expression, ops);
    return;
  }
  if (isLogical(n)) {
    collectLogicalOps(n.left, ops);
    ops.push(n.operatorToken.kind);
    collectLogicalOps(n.right, ops);
  }
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

const HANDLERS: Partial<Record<ts.SyntaxKind, Handler>> = {
  [ts.SyntaxKind.IfStatement]: visitIf,
  [ts.SyntaxKind.ForStatement]: visitFor,
  [ts.SyntaxKind.ForInStatement]: visitForInOrOf,
  [ts.SyntaxKind.ForOfStatement]: visitForInOrOf,
  [ts.SyntaxKind.WhileStatement]: visitWhile,
  [ts.SyntaxKind.DoStatement]: visitDo,
  [ts.SyntaxKind.SwitchStatement]: visitSwitch,
  [ts.SyntaxKind.CatchClause]: visitCatch,
  [ts.SyntaxKind.ConditionalExpression]: visitConditional,
};
