import ts from "typescript";
import { isFunctionLike } from "../source/index.js";

export type VisitCtx = {
  visit: (node: ts.Node) => void;
  op: (kind: string) => void;
  operand: (name: string) => void;
  visitCommaList: (nodes: ts.NodeArray<ts.Node>) => void;
};

type Handler = (node: ts.Node, ctx: VisitCtx) => void;


export function walkHalstead(
  fn: ts.Node,
  op: (kind: string) => void,
  operand: (name: string) => void,
): void {
  const ctx = {} as VisitCtx;
  ctx.op = op;
  ctx.operand = operand;
  ctx.visit = (node) => visitNode(fn, node, ctx);
  ctx.visitCommaList = (nodes) => visitCommaList(nodes, ctx);
  visitSignature(fn, ctx);
}

function visitNode(fn: ts.Node, node: ts.Node, ctx: VisitCtx): void {
  if (node !== fn && isFunctionLike(node)) return;
  
  
  if (ts.isExpressionWithTypeArguments(node)) {
    ctx.visit((node as ts.ExpressionWithTypeArguments).expression);
    return;
  }
  if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node)) return;
  const handler = HANDLERS[node.kind];
  if (handler) {
    handler(node, ctx);
    return;
  }
  ts.forEachChild(node, ctx.visit);
}

function visitCommaList(nodes: ts.NodeArray<ts.Node>, ctx: VisitCtx): void {
  nodes.forEach((child, index) => {
    if (index > 0) ctx.op(",");
    ctx.visit(child);
  });
}

function visitSignature(fn: ts.Node, ctx: VisitCtx): void {
  if (!isFunctionLike(fn)) {
    ctx.visit(fn);
    return;
  }
  emitFunctionKeyword(fn, ctx.op);
  emitParameterList(fn, ctx);
  if (fn.body) ctx.visit(fn.body);
}

function emitFunctionKeyword(
  fn: ts.FunctionLikeDeclaration,
  op: (kind: string) => void,
): void {
  if (ts.isArrowFunction(fn)) {
    op("=>");
    return;
  }
  if (ts.isConstructorDeclaration(fn)) {
    op("constructor");
    return;
  }
  emitNamedFunctionKeyword(fn, op);
}

function emitNamedFunctionKeyword(
  fn: ts.FunctionLikeDeclaration,
  op: (kind: string) => void,
): void {
  if (ts.isGetAccessorDeclaration(fn)) {
    op("get");
    return;
  }
  if (ts.isSetAccessorDeclaration(fn)) {
    op("set");
    return;
  }
  emitCallableKeyword(fn, op);
}

function emitCallableKeyword(
  fn: ts.FunctionLikeDeclaration,
  op: (kind: string) => void,
): void {
  if (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) {
    op("function");
    if (fn.asteriskToken) op("*");
    return;
  }
  if (ts.isMethodDeclaration(fn) && fn.asteriskToken) op("*");
}

function emitParameterList(fn: ts.FunctionLikeDeclaration, ctx: VisitCtx): void {
  const hasParens = fn.getChildren().some((child) => child.kind === ts.SyntaxKind.OpenParenToken);
  if (hasParens) {
    ctx.op("(");
    ctx.visitCommaList(fn.parameters);
    ctx.op(")");
    return;
  }
  fn.parameters.forEach(ctx.visit);
}

function operandOf(label: string): Handler {
  return function visitKeyword(_node: ts.Node, ctx: VisitCtx): void {
    ctx.operand(label);
  };
}

function visitIdentifier(node: ts.Node, ctx: VisitCtx): void {
  ctx.operand((node as ts.Identifier).text);
}

function visitLiteral(node: ts.Node, ctx: VisitCtx): void {
  ctx.operand((node as ts.LiteralLikeNode).text);
}

function visitBinaryExpression(node: ts.Node, ctx: VisitCtx): void {
  const bin = node as ts.BinaryExpression;
  ctx.visit(bin.left);
  ctx.op(bin.operatorToken.getText());
  ctx.visit(bin.right);
}

function visitPrefixUnary(node: ts.Node, ctx: VisitCtx): void {
  const unary = node as ts.PrefixUnaryExpression;
  ctx.op(unaryOperator(unary.operator));
  ctx.visit(unary.operand);
}

function visitPostfixUnary(node: ts.Node, ctx: VisitCtx): void {
  const unary = node as ts.PostfixUnaryExpression;
  ctx.visit(unary.operand);
  ctx.op(unaryOperator(unary.operator));
}

function visitPropertyAccess(node: ts.Node, ctx: VisitCtx): void {
  const access = node as ts.PropertyAccessExpression;
  ctx.visit(access.expression);
  ctx.op(access.questionDotToken ? "?." : ".");
  ctx.visit(access.name);
}

function visitElementAccess(node: ts.Node, ctx: VisitCtx): void {
  const access = node as ts.ElementAccessExpression;
  ctx.visit(access.expression);
  if (access.questionDotToken) ctx.op("?.");
  ctx.op("[");
  ctx.visit(access.argumentExpression);
  ctx.op("]");
}

function visitCallExpression(node: ts.Node, ctx: VisitCtx): void {
  const call = node as ts.CallExpression;
  ctx.visit(call.expression);
  if (call.questionDotToken) ctx.op("?.");
  ctx.op("(");
  ctx.visitCommaList(call.arguments);
  ctx.op(")");
}

function visitNewExpression(node: ts.Node, ctx: VisitCtx): void {
  const created = node as ts.NewExpression;
  ctx.op("new");
  ctx.visit(created.expression);
  if (created.arguments) {
    ctx.op("(");
    ctx.visitCommaList(created.arguments);
    ctx.op(")");
  }
}

function visitConditional(node: ts.Node, ctx: VisitCtx): void {
  const cond = node as ts.ConditionalExpression;
  ctx.visit(cond.condition);
  ctx.op("?");
  ctx.visit(cond.whenTrue);
  ctx.op(":");
  ctx.visit(cond.whenFalse);
}

function visitSpread(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("...");
  ts.forEachChild(node, ctx.visit);
}

function visitParenthesized(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("(");
  ctx.visit((node as ts.ParenthesizedExpression).expression);
  ctx.op(")");
}

function visitArrayLiteral(node: ts.Node, ctx: VisitCtx): void {
  const array = node as ts.ArrayLiteralExpression;
  ctx.op("[");
  ctx.visitCommaList(array.elements);
  ctx.op("]");
}

function visitObjectLiteral(node: ts.Node, ctx: VisitCtx): void {
  const object = node as ts.ObjectLiteralExpression;
  ctx.op("{");
  ctx.visitCommaList(object.properties);
  ctx.op("}");
}

function visitPropertyAssignment(node: ts.Node, ctx: VisitCtx): void {
  const prop = node as ts.PropertyAssignment;
  ctx.visit(prop.name);
  ctx.op(":");
  ctx.visit(prop.initializer);
}

function visitShorthandProperty(node: ts.Node, ctx: VisitCtx): void {
  ctx.visit((node as ts.ShorthandPropertyAssignment).name);
}

function visitPropertyDeclaration(node: ts.Node, ctx: VisitCtx): void {
  const prop = node as ts.PropertyDeclaration;
  ctx.visit(prop.name);
  if (prop.initializer) {
    ctx.op("=");
    ctx.visit(prop.initializer);
  }
}

function visitEnumMember(node: ts.Node, ctx: VisitCtx): void {
  const member = node as ts.EnumMember;
  ctx.visit(member.name);
  if (member.initializer) {
    ctx.op("=");
    ctx.visit(member.initializer);
  }
}

function visitBraced(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("{");
  ts.forEachChild(node, ctx.visit);
  ctx.op("}");
}

function visitIfStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.IfStatement;
  ctx.op("if");
  ctx.op("(");
  ctx.visit(stmt.expression);
  ctx.op(")");
  ctx.visit(stmt.thenStatement);
  if (stmt.elseStatement) {
    ctx.op("else");
    ctx.visit(stmt.elseStatement);
  }
}

function visitWhileStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.WhileStatement;
  ctx.op("while");
  ctx.op("(");
  ctx.visit(stmt.expression);
  ctx.op(")");
  ctx.visit(stmt.statement);
}

function visitDoStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.DoStatement;
  ctx.op("do");
  ctx.visit(stmt.statement);
  ctx.op("while");
  ctx.op("(");
  ctx.visit(stmt.expression);
  ctx.op(")");
}

function visitForStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.ForStatement;
  ctx.op("for");
  ctx.op("(");
  if (stmt.initializer) ctx.visit(stmt.initializer);
  if (stmt.condition) ctx.visit(stmt.condition);
  if (stmt.incrementor) ctx.visit(stmt.incrementor);
  ctx.op(")");
  ctx.visit(stmt.statement);
}

function visitForInStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.ForInStatement;
  ctx.op("for");
  ctx.op("(");
  ctx.visit(stmt.initializer);
  ctx.op("in");
  ctx.visit(stmt.expression);
  ctx.op(")");
  ctx.visit(stmt.statement);
}

function visitForOfStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.ForOfStatement;
  ctx.op("for");
  if (stmt.awaitModifier) ctx.op("await");
  ctx.op("(");
  ctx.visit(stmt.initializer);
  ctx.op("of");
  ctx.visit(stmt.expression);
  ctx.op(")");
  ctx.visit(stmt.statement);
}

function visitSwitchStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.SwitchStatement;
  ctx.op("switch");
  ctx.op("(");
  ctx.visit(stmt.expression);
  ctx.op(")");
  ctx.visit(stmt.caseBlock);
}

function visitCaseClause(node: ts.Node, ctx: VisitCtx): void {
  const clause = node as ts.CaseClause;
  ctx.op("case");
  ctx.visit(clause.expression);
  ctx.op(":");
  clause.statements.forEach(ctx.visit);
}

function visitDefaultClause(node: ts.Node, ctx: VisitCtx): void {
  const clause = node as ts.DefaultClause;
  ctx.op("default");
  ctx.op(":");
  clause.statements.forEach(ctx.visit);
}

function visitReturnStatement(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("return");
  const stmt = node as ts.ReturnStatement;
  if (stmt.expression) ctx.visit(stmt.expression);
}

function visitThrowStatement(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("throw");
  ctx.visit((node as ts.ThrowStatement).expression);
}

function visitBreakStatement(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("break");
  if ((node as ts.BreakStatement).label) {
    ctx.visit((node as ts.BreakStatement).label!);
  }
}

function visitContinueStatement(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("continue");
  if ((node as ts.ContinueStatement).label) {
    ctx.visit((node as ts.ContinueStatement).label!);
  }
}

function visitTryStatement(node: ts.Node, ctx: VisitCtx): void {
  const stmt = node as ts.TryStatement;
  ctx.op("try");
  ctx.visit(stmt.tryBlock);
  if (stmt.catchClause) ctx.visit(stmt.catchClause);
  if (stmt.finallyBlock) {
    ctx.op("finally");
    ctx.visit(stmt.finallyBlock);
  }
}

function visitCatchClause(node: ts.Node, ctx: VisitCtx): void {
  const clause = node as ts.CatchClause;
  ctx.op("catch");
  if (clause.variableDeclaration) {
    ctx.op("(");
    ctx.visit(clause.variableDeclaration.name);
    ctx.op(")");
  }
  ctx.visit(clause.block);
}

function visitVariableStatement(node: ts.Node, ctx: VisitCtx): void {
  ctx.visit((node as ts.VariableStatement).declarationList);
}

function visitVariableDeclarationList(node: ts.Node, ctx: VisitCtx): void {
  const list = node as ts.VariableDeclarationList;
  ctx.op(declarationKeyword(list));
  ctx.visitCommaList(list.declarations);
}

function visitVariableDeclaration(node: ts.Node, ctx: VisitCtx): void {
  const decl = node as ts.VariableDeclaration;
  ctx.visit(decl.name);
  if (decl.initializer) {
    ctx.op("=");
    ctx.visit(decl.initializer);
  }
}

function visitParameter(node: ts.Node, ctx: VisitCtx): void {
  const param = node as ts.ParameterDeclaration;
  if (param.dotDotDotToken) ctx.op("...");
  ctx.visit(param.name);
  if (param.initializer) {
    ctx.op("=");
    ctx.visit(param.initializer);
  }
}

function visitTypeSugar(node: ts.Node, ctx: VisitCtx): void {
  if (ts.isAsExpression(node)) {
    ctx.visit(node.expression);
    return;
  }
  if (ts.isTypeAssertionExpression(node)) {
    ctx.visit(node.expression);
    return;
  }
  ctx.visit((node as ts.SatisfiesExpression).expression);
}

function visitNonNull(node: ts.Node, ctx: VisitCtx): void {
  ctx.visit((node as ts.NonNullExpression).expression);
  ctx.op("!");
}

function visitAwait(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("await");
  ctx.visit((node as ts.AwaitExpression).expression);
}

function visitYield(node: ts.Node, ctx: VisitCtx): void {
  const yielded = node as ts.YieldExpression;
  ctx.op("yield");
  if (yielded.asteriskToken) ctx.op("*");
  if (yielded.expression) ctx.visit(yielded.expression);
}

function visitDelete(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("delete");
  ctx.visit((node as ts.DeleteExpression).expression);
}

function visitTypeOf(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("typeof");
  ctx.visit((node as ts.TypeOfExpression).expression);
}

function visitVoid(node: ts.Node, ctx: VisitCtx): void {
  ctx.op("void");
  ctx.visit((node as ts.VoidExpression).expression);
}

function visitTemplateExpression(node: ts.Node, ctx: VisitCtx): void {
  const tmpl = node as ts.TemplateExpression;
  ctx.visit(tmpl.head);
  for (const span of tmpl.templateSpans) ctx.visit(span);
}

function visitTemplateSpan(node: ts.Node, ctx: VisitCtx): void {
  const span = node as ts.TemplateSpan;
  ctx.op("{");
  ctx.visit(span.expression);
  ctx.op("}");
  ctx.visit(span.literal);
}

function visitMetaProperty(node: ts.Node, ctx: VisitCtx): void {
  ctx.operand(node.getText());
}

function declarationKeyword(list: ts.VariableDeclarationList): string {
  if (list.flags & ts.NodeFlags.Const) return "const";
  if (list.flags & ts.NodeFlags.Let) return "let";
  return "var";
}

function unaryOperator(kind: ts.PrefixUnaryOperator | ts.PostfixUnaryOperator): string {
  return ts.tokenToString(kind) ?? "unknown";
}

const HANDLERS: Partial<Record<ts.SyntaxKind, Handler>> = {
  [ts.SyntaxKind.Identifier]: visitIdentifier,
  [ts.SyntaxKind.ThisKeyword]: operandOf("this"),
  [ts.SyntaxKind.SuperKeyword]: operandOf("super"),
  [ts.SyntaxKind.NullKeyword]: operandOf("null"),
  [ts.SyntaxKind.TrueKeyword]: operandOf("true"),
  [ts.SyntaxKind.FalseKeyword]: operandOf("false"),
  [ts.SyntaxKind.NumericLiteral]: visitLiteral,
  [ts.SyntaxKind.BigIntLiteral]: visitLiteral,
  [ts.SyntaxKind.StringLiteral]: visitLiteral,
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: visitLiteral,
  [ts.SyntaxKind.RegularExpressionLiteral]: visitLiteral,
  [ts.SyntaxKind.TemplateHead]: visitLiteral,
  [ts.SyntaxKind.TemplateMiddle]: visitLiteral,
  [ts.SyntaxKind.TemplateTail]: visitLiteral,
  [ts.SyntaxKind.BinaryExpression]: visitBinaryExpression,
  [ts.SyntaxKind.PrefixUnaryExpression]: visitPrefixUnary,
  [ts.SyntaxKind.PostfixUnaryExpression]: visitPostfixUnary,
  [ts.SyntaxKind.PropertyAccessExpression]: visitPropertyAccess,
  [ts.SyntaxKind.ElementAccessExpression]: visitElementAccess,
  [ts.SyntaxKind.CallExpression]: visitCallExpression,
  [ts.SyntaxKind.NewExpression]: visitNewExpression,
  [ts.SyntaxKind.ConditionalExpression]: visitConditional,
  [ts.SyntaxKind.SpreadElement]: visitSpread,
  [ts.SyntaxKind.SpreadAssignment]: visitSpread,
  [ts.SyntaxKind.ParenthesizedExpression]: visitParenthesized,
  [ts.SyntaxKind.ArrayLiteralExpression]: visitArrayLiteral,
  [ts.SyntaxKind.ObjectLiteralExpression]: visitObjectLiteral,
  [ts.SyntaxKind.PropertyAssignment]: visitPropertyAssignment,
  [ts.SyntaxKind.ShorthandPropertyAssignment]: visitShorthandProperty,
  [ts.SyntaxKind.PropertyDeclaration]: visitPropertyDeclaration,
  [ts.SyntaxKind.EnumMember]: visitEnumMember,
  [ts.SyntaxKind.Block]: visitBraced,
  [ts.SyntaxKind.IfStatement]: visitIfStatement,
  [ts.SyntaxKind.WhileStatement]: visitWhileStatement,
  [ts.SyntaxKind.DoStatement]: visitDoStatement,
  [ts.SyntaxKind.ForStatement]: visitForStatement,
  [ts.SyntaxKind.ForInStatement]: visitForInStatement,
  [ts.SyntaxKind.ForOfStatement]: visitForOfStatement,
  [ts.SyntaxKind.SwitchStatement]: visitSwitchStatement,
  [ts.SyntaxKind.CaseBlock]: visitBraced,
  [ts.SyntaxKind.CaseClause]: visitCaseClause,
  [ts.SyntaxKind.DefaultClause]: visitDefaultClause,
  [ts.SyntaxKind.ReturnStatement]: visitReturnStatement,
  [ts.SyntaxKind.ThrowStatement]: visitThrowStatement,
  [ts.SyntaxKind.BreakStatement]: visitBreakStatement,
  [ts.SyntaxKind.ContinueStatement]: visitContinueStatement,
  [ts.SyntaxKind.TryStatement]: visitTryStatement,
  [ts.SyntaxKind.CatchClause]: visitCatchClause,
  [ts.SyntaxKind.VariableStatement]: visitVariableStatement,
  [ts.SyntaxKind.VariableDeclarationList]: visitVariableDeclarationList,
  [ts.SyntaxKind.VariableDeclaration]: visitVariableDeclaration,
  [ts.SyntaxKind.Parameter]: visitParameter,
  [ts.SyntaxKind.AsExpression]: visitTypeSugar,
  [ts.SyntaxKind.TypeAssertionExpression]: visitTypeSugar,
  [ts.SyntaxKind.SatisfiesExpression]: visitTypeSugar,
  [ts.SyntaxKind.NonNullExpression]: visitNonNull,
  [ts.SyntaxKind.AwaitExpression]: visitAwait,
  [ts.SyntaxKind.YieldExpression]: visitYield,
  [ts.SyntaxKind.DeleteExpression]: visitDelete,
  [ts.SyntaxKind.TypeOfExpression]: visitTypeOf,
  [ts.SyntaxKind.VoidExpression]: visitVoid,
  [ts.SyntaxKind.TemplateExpression]: visitTemplateExpression,
  [ts.SyntaxKind.TemplateSpan]: visitTemplateSpan,
  [ts.SyntaxKind.MetaProperty]: visitMetaProperty,
};
