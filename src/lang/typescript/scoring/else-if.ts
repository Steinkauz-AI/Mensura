import ts from "typescript";

export function isElseIf(node: ts.IfStatement): boolean {
  const parent = node.parent;
  return ts.isIfStatement(parent) && parent.elseStatement === node;
}
