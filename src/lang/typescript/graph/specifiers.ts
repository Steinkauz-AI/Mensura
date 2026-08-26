import ts from "typescript";

export type ImportSpecifier = {
  specifier: string;
  typeOnly: boolean;
};


export function specifiersInFile(source: ts.SourceFile): ImportSpecifier[] {
  const out: ImportSpecifier[] = [];
  collectSpecifiers(source, out);
  return out;
}

function collectSpecifiers(node: ts.Node, out: ImportSpecifier[]): void {
  const specifier = specifierFromNode(node);
  if (specifier) out.push(specifier);
  ts.forEachChild(node, (child) => collectSpecifiers(child, out));
}

function specifierFromNode(node: ts.Node): ImportSpecifier | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return {
      specifier: node.moduleSpecifier.text,
      typeOnly: Boolean(node.importClause?.isTypeOnly),
    };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return {
      specifier: node.moduleSpecifier.text,
      typeOnly: Boolean(node.isTypeOnly),
    };
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return {
      specifier: node.moduleReference.expression.text,
      typeOnly: false,
    };
  }
  if (ts.isCallExpression(node)) {
    const literal = stringArg(node);
    if (literal && isRequireOrImport(node)) {
      return { specifier: literal, typeOnly: false };
    }
  }
  return undefined;
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
