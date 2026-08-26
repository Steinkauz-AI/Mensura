import { describe, expect, it } from "vitest";
import ts from "typescript";
import { walkHalstead } from "../../src/lang/typescript/scoring/halstead-visit.js";
import { isFunctionLike } from "../../src/lang/typescript/source/index.js";

type Token = { kind: "op" | "operand"; text: string };

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("snippet.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function firstUnit(source: ts.SourceFile): ts.Node {
  let found: ts.Node | undefined;
  const search = (node: ts.Node): void => {
    if (found) return;
    if (node !== source && isFunctionLike(node) && node.body) {
      found = node;
      return;
    }
    ts.forEachChild(node, search);
  };
  search(source);
  if (!found) throw new Error("snippet has no function-like unit");
  return found;
}

function tokensOf(fn: ts.Node): Token[] {
  const tokens: Token[] = [];
  walkHalstead(
    fn,
    (text) => tokens.push({ kind: "op", text }),
    (text) => tokens.push({ kind: "operand", text }),
  );
  return tokens;
}

function counted(body: string): Token[] {
  return tokensOf(firstUnit(parse(`export function underTest() {\n${body}\n}\n`)));
}

function countedUnit(snippet: string): Token[] {
  return tokensOf(firstUnit(parse(`${snippet}\n`)));
}

function countedFile(text: string): Token[] {
  return tokensOf(parse(text));
}

function operators(tokens: Token[]): string[] {
  return tokens.filter((token) => token.kind === "op").map((token) => token.text);
}

function operands(tokens: Token[]): string[] {
  return tokens.filter((token) => token.kind === "operand").map((token) => token.text);
}

function expectTokens(tokens: Token[], ops: string[], names: string[]): void {
  expect(operators(tokens), "operators").toEqual(ops);
  expect(operands(tokens), "operands").toEqual(names);
}

describe("signature emission", () => {
  it("emits the function keyword and grouping tokens for an empty declaration", () => {
    expectTokens(counted(""), ["function", "(", ")", "{", "}"], []);
  });

  it("emits => instead of a function keyword for an arrow", () => {
    expectTokens(countedUnit("const f = () => 1;"), ["=>", "(", ")"], ["1"]);
  });

  it("omits parameter grouping for a parenless arrow parameter", () => {
    expectTokens(countedUnit("const f = x => x;"), ["=>"], ["x", "x"]);
  });

  it("emits => but no async operator for an async arrow", () => {
    expectTokens(countedUnit("const f = async () => 1;"), ["=>", "(", ")"], ["1"]);
  });

  it("emits the function keyword for a named function expression", () => {
    const tokens = countedUnit("const f = function named(g) { return g; };");
    expectTokens(tokens, ["function", "(", ")", "{", "return", "}"], ["g", "g"]);
  });

  it("emits * for generator declarations", () => {
    expectTokens(countedUnit("function* g() {}"), ["function", "*", "(", ")", "{", "}"], []);
  });

  it("emits get for getters", () => {
    expectTokens(
      countedUnit("class C { get g() { return this.v; } }"),
      ["get", "(", ")", "{", "return", ".", "}"],
      ["this", "v"],
    );
  });

  it("emits set for setters", () => {
    expectTokens(
      countedUnit("class C { set g(v) { this.v = v; } }"),
      ["set", "(", ")", "{", ".", "=", "}"],
      ["v", "this", "v", "v"],
    );
  });

  it("emits constructor for constructors", () => {
    expectTokens(
      countedUnit("class C { constructor(a) { this.a = a; } }"),
      ["constructor", "(", ")", "{", ".", "=", "}"],
      ["a", "this", "a", "a"],
    );
  });

  it("emits * without a function keyword for generator methods", () => {
    expectTokens(countedUnit("class C { *gen() { yield 1; } }"), ["*", "(", ")", "{", "yield", "}"], ["1"]);
  });

  it("emits rest and default parameter markers once each", () => {
    const tokens = countedUnit("function underTest(a, b = 1, ...rest) { return a; }");
    expectTokens(
      tokens,
      ["function", "(", ",", "=", ",", "...", ")", "{", "return", "}"],
      ["a", "b", "1", "rest", "a"],
    );
  });

  it("counts super as an operand of the overriding method", () => {
    expectTokens(
      countedUnit("class C extends B { m() { super.m(); } }"),
      ["(", ")", "{", ".", "(", ")", "}"],
      ["super", "m"],
    );
  });

  it("walks a non-function entry as a bare token tree", () => {
    expectTokens(countedFile("a || b;\n"), ["||"], ["a", "b"]);
  });
});

describe("operator classification", () => {
  it("counts logical || and ?? as distinct operators", () => {
    expectTokens(
      counted("p = a || b ?? c;"),
      ["function", "(", ")", "{", "=", "||", "??", "}"],
      ["p", "a", "b", "c"],
    );
  });

  it("counts compound assignment as one += operator", () => {
    expectTokens(
      counted("x += y;"),
      ["function", "(", ")", "{", "+=", "}"],
      ["x", "y"],
    );
  });

  it("counts the comma operator between expressions", () => {
    expectTokens(
      counted("x = (a, b);"),
      ["function", "(", ")", "{", "=", "(", ",", ")", "}"],
      ["x", "a", "b"],
    );
  });

  it("counts in and instanceof as operators", () => {
    expectTokens(
      counted("t = a in b && c instanceof d;"),
      ["function", "(", ")", "{", "=", "in", "&&", "instanceof", "}"],
      ["t", "a", "b", "c", "d"],
    );
  });

  it("emits a postfix increment after its operand", () => {
    expect(
      counted("t = n++;").map((token) => `${token.kind}:${token.text}`),
    ).toEqual([
      "op:function",
      "op:(",
      "op:)",
      "op:{",
      "operand:t",
      "op:=",
      "operand:n",
      "op:++",
      "op:}",
    ]);
  });

  it("emits a prefix decrement before its operand", () => {
    expect(
      counted("t = --n;").map((token) => `${token.kind}:${token.text}`),
    ).toEqual([
      "op:function",
      "op:(",
      "op:)",
      "op:{",
      "operand:t",
      "op:=",
      "op:--",
      "operand:n",
      "op:}",
    ]);
  });

  it("emits ! for non-null assertions", () => {
    expectTokens(
      counted("len = v!.length;"),
      ["function", "(", ")", "{", "=", "!", ".", "}"],
      ["len", "v", "length"],
    );
  });

  it("emits typeof as an operator distinct from ===", () => {
    expectTokens(
      counted('kind = typeof v === "u";'),
      ["function", "(", ")", "{", "=", "typeof", "===", "}"],
      ["kind", "v", "u"],
    );
  });
});

describe("operand classification", () => {
  it.each([
    ["numeric", "42", ["x", "42"]],
    ["bigint", "1n", ["x", "1n"]],
    ["regular expression", "/ab+c/gi", ["x", "/ab+c/gi"]],
    ["string", '"hi"', ["x", "hi"]],
    ["template literal", "`plain`", ["x", "plain"]],
  ])("counts a %s literal as an operand", (_name, literal, expected) => {
    expectTokens(
      counted(`x = ${literal};`),
      ["function", "(", ")", "{", "=", "}"],
      expected,
    );
  });

  it("counts keyword literals this null true false as operands", () => {
    expectTokens(
      counted("f(this, null, true, false);"),
      ["function", "(", ")", "{", "(", ",", ",", ",", ")", "}"],
      ["f", "this", "null", "true", "false"],
    );
  });

  it("counts new.target as a single operand", () => {
    expectTokens(
      counted("who = new.target;"),
      ["function", "(", ")", "{", "=", "}"],
      ["who", "new.target"],
    );
  });
});

describe("expression visitors", () => {
  it("emits one dot operator per property-access hop", () => {
    expectTokens(
      counted("n = a.b.c;"),
      ["function", "(", ")", "{", "=", ".", ".", "}"],
      ["n", "a", "b", "c"],
    );
  });

  it("emits ?. for optional chaining", () => {
    expectTokens(
      counted("n = a?.b;"),
      ["function", "(", ")", "{", "=", "?.", "}"],
      ["n", "a", "b"],
    );
  });

  it("emits bracket operators around element access", () => {
    expectTokens(
      counted("v = a[b];"),
      ["function", "(", ")", "{", "=", "[", "]", "}"],
      ["v", "a", "b"],
    );
  });

  it("separates call arguments with commas", () => {
    expectTokens(
      counted("f(x, y);"),
      ["function", "(", ")", "{", "(", ",", ")", "}"],
      ["f", "x", "y"],
    );
  });

  it("emits new with argument parens when arguments are present", () => {
    expectTokens(
      counted("o = new F(a);"),
      ["function", "(", ")", "{", "=", "new", "(", ")", "}"],
      ["o", "F", "a"],
    );
  });

  it("emits new without parens for a bare constructor reference", () => {
    expectTokens(
      counted("o = new F;"),
      ["function", "(", ")", "{", "=", "new", "}"],
      ["o", "F"],
    );
  });

  it("splits a conditional into ? and : operators", () => {
    expectTokens(
      counted("r = c ? t : f;"),
      ["function", "(", ")", "{", "=", "?", ":", "}"],
      ["r", "c", "t", "f"],
    );
  });

  it("emits ... for spread call arguments", () => {
    expectTokens(
      counted("f(...xs);"),
      ["function", "(", ")", "{", "(", "...", ")", "}"],
      ["f", "xs"],
    );
  });

  it("emits braces colons and commas around object properties including spread and shorthand", () => {
    expectTokens(
      counted("o = { ...base, k: 1, short };"),
      ["function", "(", ")", "{", "=", "{", "...", ",", ":", ",", "}", "}"],
      ["o", "base", "k", "1", "short"],
    );
  });

  it("counts a computed property key expression as an operand", () => {
    expectTokens(
      counted("o = { [k]: 1 };"),
      ["function", "(", ")", "{", "=", "{", ":", "}", "}"],
      ["o", "k", "1"],
    );
  });

  it("counts grouping parens around a parenthesized expression", () => {
    expectTokens(
      counted("y = (x);"),
      ["function", "(", ")", "{", "=", "(", ")", "}"],
      ["y", "x"],
    );
  });

  it("separates array elements with commas inside brackets", () => {
    expectTokens(
      counted("ys = [a, b];"),
      ["function", "(", ")", "{", "=", "[", ",", "]", "}"],
      ["ys", "a", "b"],
    );
  });

  it("wraps each substitution span of a template in braces", () => {
    expectTokens(
      counted("tag = `h${a}m${b}t`;"),
      ["function", "(", ")", "{", "=", "{", "}", "{", "}", "}"],
      ["tag", "h", "a", "m", "b", "t"],
    );
  });

  it("keeps the tag and spans of a tagged template", () => {
    expectTokens(
      counted("t = tag`x${y}z`;"),
      ["function", "(", ")", "{", "=", "{", "}", "}"],
      ["t", "tag", "x", "y", "z"],
    );
  });

  it("emits delete before the deleted operand", () => {
    expectTokens(
      counted("ok = delete box[k];"),
      ["function", "(", ")", "{", "=", "delete", "[", "]", "}"],
      ["ok", "box", "k"],
    );
  });

  it("emits void before its operand", () => {
    expectTokens(
      counted("z = void 0;"),
      ["function", "(", ")", "{", "=", "void", "}"],
      ["z", "0"],
    );
  });

  it("emits await before the awaited call", () => {
    expectTokens(
      counted("done = await work();"),
      ["function", "(", ")", "{", "=", "await", "(", ")", "}"],
      ["done", "work"],
    );
  });

  it("skips call-site type arguments", () => {
    expectTokens(
      counted("w = make<Known>(v);"),
      ["function", "(", ")", "{", "=", "(", ")", "}"],
      ["w", "make", "v"],
    );
  });
});

describe("statement visitors", () => {
  it("emits if else and their grouping parens", () => {
    expectTokens(
      counted("if (a) { b(); } else { c(); }"),
      [
        "function", "(", ")", "{",
        "if", "(", ")", "{", "(", ")", "}",
        "else", "{", "(", ")", "}",
        "}",
      ],
      ["a", "b", "c"],
    );
  });

  it("emits while with its condition parens", () => {
    expectTokens(
      counted("while (a) b();"),
      ["function", "(", ")", "{", "while", "(", ")", "(", ")", "}"],
      ["a", "b"],
    );
  });

  it("emits do while around the loop body", () => {
    expectTokens(
      counted("do { b(); } while (a);"),
      ["function", "(", ")", "{", "do", "{", "(", ")", "}", "while", "(", ")", "}"],
      ["b", "a"],
    );
  });

  it("emits for with its three clauses and keyword", () => {
    expectTokens(
      counted("for (let i = 0; i < n; i++) step(i);"),
      ["function", "(", ")", "{", "for", "(", "let", "=", "<", "++", ")", "(", ")", "}"],
      ["i", "0", "i", "n", "i", "step", "i"],
    );
  });

  it("emits a bare for with no clauses and no semicolons", () => {
    expectTokens(
      counted("for (;;) break;"),
      ["function", "(", ")", "{", "for", "(", ")", "break", "}"],
      [],
    );
  });

  it("emits for in around the enumeration", () => {
    expectTokens(
      counted("for (const k in obj) use(k);"),
      ["function", "(", ")", "{", "for", "(", "const", "in", ")", "(", ")", "}"],
      ["k", "obj", "use", "k"],
    );
  });

  it("emits for await of for async iteration", () => {
    expectTokens(
      countedUnit("async function go() { for await (const c of xs) use(c); }"),
      [
        "function", "(", ")", "{",
        "for", "await", "(", "const", "of", ")", "(", ")", "}",
      ],
      ["c", "xs", "use", "c"],
    );
  });

  it("emits switch case and default clauses with their colons", () => {
    expectTokens(
      counted("switch (x) { case 1: one(); break; case 2: two(); break; default: other(); }"),
      [
        "function", "(", ")", "{",
        "switch", "(", ")", "{",
        "case", ":", "(", ")", "break",
        "case", ":", "(", ")", "break",
        "default", ":", "(", ")",
        "}", "}",
      ],
      ["x", "1", "one", "2", "two", "other"],
    );
  });

  it("counts a labelled break target as an operand", () => {
    expectTokens(
      counted("outer: while (a) { while (b) break outer; }"),
      [
        "function", "(", ")", "{",
        "while", "(", ")", "{", "while", "(", ")", "break", "}", "}",
      ],
      ["outer", "a", "b", "outer"],
    );
  });

  it("counts a labelled continue target as an operand", () => {
    expectTokens(
      counted("outer: for (;;) { continue outer; }"),
      ["function", "(", ")", "{", "for", "(", ")", "{", "continue", "}", "}"],
      ["outer", "outer"],
    );
  });

  it("emits try catch finally with the binding parens", () => {
    expectTokens(
      counted("try { risk(); } catch (err) { log(err); } finally { done(); }"),
      [
        "function", "(", ")", "{",
        "try", "{", "(", ")", "}",
        "catch", "(", ")", "{", "(", ")", "}",
        "finally", "{", "(", ")", "}",
        "}",
      ],
      ["risk", "err", "log", "err", "done"],
    );
  });

  it("emits catch without binding parens for optional catch binding", () => {
    expectTokens(
      counted("try { risk(); } catch { swallow(); }"),
      ["function", "(", ")", "{", "try", "{", "(", ")", "}", "catch", "{", "(", ")", "}", "}"],
      ["risk", "swallow"],
    );
  });

  it("emits finally without catch when only a finally block exists", () => {
    expectTokens(
      counted("try { risk(); } finally { done(); }"),
      ["function", "(", ")", "{", "try", "{", "(", ")", "}", "finally", "{", "(", ")", "}", "}"],
      ["risk", "done"],
    );
  });

  it("emits throw before the thrown construction", () => {
    expectTokens(
      counted('throw new Error("boom");'),
      ["function", "(", ")", "{", "throw", "new", "(", ")", "}"],
      ["Error", "boom"],
    );
  });

  it("emits a bare return without operands", () => {
    expectTokens(counted("return;"), ["function", "(", ")", "{", "return", "}"], []);
  });

  it("separates declarators of one const statement with commas", () => {
    expectTokens(
      counted("const a = 1, b = 2;"),
      ["function", "(", ")", "{", "const", "=", ",", "=", "}"],
      ["a", "1", "b", "2"],
    );
  });

  it("emits let without an equals for an uninitialized declaration", () => {
    expectTokens(
      counted("let x;"),
      ["function", "(", ")", "{", "let", "}"],
      ["x"],
    );
  });

  it("emits var for legacy declarations", () => {
    expectTokens(
      counted("var x = 1;"),
      ["function", "(", ")", "{", "var", "=", "}"],
      ["x", "1"],
    );
  });
});

describe("type syntax skipping", () => {
  it("skips variable annotations", () => {
    expectTokens(
      counted("const n: number = 1;"),
      ["function", "(", ")", "{", "const", "=", "}"],
      ["n", "1"],
    );
  });

  it.each([
    ["as expressions", "w = v as Known;"],
    ["angle-bracket assertions", "w = <Known>v;"],
    ["satisfies expressions", "w = v satisfies Known;"],
  ])("keeps only the value side of %s", (_name, body) => {
    expectTokens(
      counted(body),
      ["function", "(", ")", "{", "=", "}"],
      ["w", "v"],
    );
  });

  it("skips type parameters and annotated parameter types", () => {
    expectTokens(
      countedUnit("function underTest<T>(x: T) { return x; }"),
      ["function", "(", ")", "{", "return", "}"],
      ["x", "x"],
    );
  });
});

describe("unit boundaries", () => {
  it("excludes nested function bodies from the enclosing unit", () => {
    expectTokens(
      counted("h = (a) => a + 1;"),
      ["function", "(", ")", "{", "=", "}"],
      ["h"],
    );
  });

  it("excludes object literal accessor bodies from the enclosing unit", () => {
    expectTokens(
      counted("o = { get g() { return 1; }, set s(v) {} };"),
      ["function", "(", ")", "{", "=", "{", ",", "}", "}"],
      ["o"],
    );
  });
});

describe("heritage clauses", () => {
  it("counts the base class of an extends clause", () => {
    expectTokens(
      counted(`class K extends Base { m() { return 1; } }
return K;`),
      ["function", "(", ")", "{", "return", "}"],
      ["K", "Base", "K"],
    );
  });

  it("counts every interface of an implements clause", () => {
    expectTokens(
      counted(`class K extends B implements Shape, Disposable { m() { return 1; } }
return K;`),
      ["function", "(", ")", "{", "return", "}"],
      ["K", "B", "Shape", "Disposable", "K"],
    );
  });

  it("keeps type arguments of a parameterized base out of the count", () => {
    expectTokens(
      counted(`class K extends Base<string> { m() { return 1; } }
return K;`),
      ["function", "(", ")", "{", "return", "}"],
      ["K", "Base", "K"],
    );
  });
});

describe("member initializers", () => {
  it("emits = for a class field initializer", () => {
    expectTokens(
      counted(`class K { p = 1; }
return K;`),
      ["function", "(", ")", "{", "=", "return", "}"],
      ["K", "p", "1", "K"],
    );
  });

  it("counts a bare class field without emitting =", () => {
    expectTokens(
      counted(`class K { p; q = 2; }
return K;`),
      ["function", "(", ")", "{", "=", "return", "}"],
      ["K", "p", "q", "2", "K"],
    );
  });

  it("emits = for an enum member initializer", () => {
    expectTokens(
      counted(`enum E { A, B = 2 }
return E;`),
      ["function", "(", ")", "{", "=", "return", "}"],
      ["E", "A", "B", "2", "E"],
    );
  });
});

describe("optional chains on calls and element access", () => {
  it("emits ?. for an optional call", () => {
    expectTokens(
      counted("r = f?.(1);"),
      ["function", "(", ")", "{", "=", "?.", "(", ")", "}"],
      ["r", "f", "1"],
    );
  });

  it("emits ?. for optional element access", () => {
    expectTokens(
      counted("v = a?.[k];"),
      ["function", "(", ")", "{", "=", "?.", "[", "]", "}"],
      ["v", "a", "k"],
    );
  });

  it("emits ?. once per link in a mixed optional chain", () => {
    expectTokens(
      counted("v = a?.b.c?.[0]();"),
      ["function", "(", ")", "{", "=", "?.", ".", "?.", "[", "]", "(", ")", "}"],
      ["v", "a", "b", "c", "0"],
    );
  });
});
