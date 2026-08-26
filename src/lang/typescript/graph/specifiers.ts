import ts from "typescript";

export type ImportSpecifier = {
  specifier: string;
  typeOnly: boolean;
};


export function specifiersInFile(source: ts.SourceFile): ImportSpecifier[] {
  const out: ImportSpecifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(node.importClause?.isTypeOnly),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(node.isTypeOnly),
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      out.push({
        specifier: node.moduleReference.expression.text,
        typeOnly: false,
      });
    } else if (ts.isCallExpression(node)) {
      const literal = stringArg(node);
      if (literal && isRequireOrImport(node)) {
        out.push({ specifier: literal, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function isRequireOrImport(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (expr.kind === ts.SyntaxKind.ImportKeyword) return true;
  return ts.isIdentifier(expr) && expr.text === "require";
}

function stringArg(node: ts.CallExpression): string | undefined {
  const arg = node.arguments[0];
  return arg && ts.isStringLiteral(arg) ? arg.text : undefined;
}
