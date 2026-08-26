import ts from "typescript";
import { isFunctionLike } from "../source/index.js";

type NestingCtx = {
  visit: (node: ts.Node, nest: number) => void;
  enter: (body: ts.Node, nest: number) => void;
  visitElse: (elseStatement: ts.Statement | undefined, nest: number) => void;
  note: (deeper: number) => void;
};

type Handler = (node: ts.Node, nest: number, ctx: NestingCtx) => void;

export function nestingOf(fn: ts.Node): number {
  let max = 0;

  const ctx: NestingCtx = {
    note: (deeper) => {
      if (deeper > max) max = deeper;
    },
    enter: (body, nest) => {
      const deeper = nest + 1;
      ctx.note(deeper);
      ctx.visit(body, deeper);
    },
    visitElse: (elseStatement, nest) => {
      if (!elseStatement) return;
      if (ts.isIfStatement(elseStatement)) {
        ctx.visit(elseStatement, nest);
        return;
      }
      ctx.visit(elseStatement, nest + 1);
    },
    visit: (node, nest) => visitNode(fn, node, nest, ctx),
  };

  ctx.visit(fn, 0);
  return max;
}

function visitNode(
  fn: ts.Node,
  node: ts.Node,
  nest: number,
  ctx: NestingCtx,
): void {
  if (node !== fn && isFunctionLike(node)) return;
  const handler = HANDLERS[node.kind];
  if (handler) {
    handler(node, nest, ctx);
    return;
  }
  ts.forEachChild(node, (child) => ctx.visit(child, nest));
}

function visitIf(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.IfStatement;
  ctx.visit(stmt.expression, nest);
  ctx.enter(stmt.thenStatement, nest);
  ctx.visitElse(stmt.elseStatement, nest);
}

function visitFor(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.ForStatement;
  if (stmt.initializer) ctx.visit(stmt.initializer, nest);
  if (stmt.condition) ctx.visit(stmt.condition, nest);
  if (stmt.incrementor) ctx.visit(stmt.incrementor, nest);
  ctx.enter(stmt.statement, nest);
}

function visitForInOrOf(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.ForInStatement | ts.ForOfStatement;
  ctx.visit(stmt.initializer, nest);
  ctx.visit(stmt.expression, nest);
  ctx.enter(stmt.statement, nest);
}

function visitWhile(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.WhileStatement;
  ctx.visit(stmt.expression, nest);
  ctx.enter(stmt.statement, nest);
}

function visitDo(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.DoStatement;
  ctx.enter(stmt.statement, nest);
  ctx.visit(stmt.expression, nest);
}

function visitSwitch(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const stmt = node as ts.SwitchStatement;
  ctx.visit(stmt.expression, nest);
  const deeper = nest + 1;
  ctx.note(deeper);
  for (const clause of stmt.caseBlock.clauses) {
    ctx.visit(clause, deeper);
  }
}

function visitCatch(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const clause = node as ts.CatchClause;
  if (clause.variableDeclaration) ctx.visit(clause.variableDeclaration, nest);
  ctx.enter(clause.block, nest);
}

function visitConditional(node: ts.Node, nest: number, ctx: NestingCtx): void {
  const expr = node as ts.ConditionalExpression;
  ctx.visit(expr.condition, nest);
  ctx.enter(expr.whenTrue, nest);
  ctx.enter(expr.whenFalse, nest);
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
