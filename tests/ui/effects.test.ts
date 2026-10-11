import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// React calls whatever an effect returns as its cleanup. Browsers now return Promises from scrollIntoView and scrollTo,
// so `return el.scrollIntoView()` hands React a Promise and crashes the page on unmount (the N03 laptop redirect did).
// Rule: an effect body is a block, and each of its returns is bare or returns a function.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

function badEffects(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node) => `${file}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(useEffect|useLayoutEffect)$/.test(n.expression.getText()) && n.arguments[0]) {
      const fn = n.arguments[0];
      if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) out.push(`${at(n)} effect is not an inline function`);
      else if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) out.push(`${at(n)} async effect`);
      else if (!ts.isBlock(fn.body)) out.push(`${at(n)} effect returns its expression`);
      else {
        const inner = (m: ts.Node) => {
          if (ts.isFunctionLike(m)) return;
          if (ts.isReturnStatement(m) && m.expression && !ts.isArrowFunction(m.expression) && !ts.isFunctionExpression(m.expression) && !ts.isIdentifier(m.expression))
            out.push(`${at(m)} effect returns a value`);
          ts.forEachChild(m, inner);
        };
        ts.forEachChild(fn.body, inner);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe("effects", () => {
  it("never return anything but a cleanup function", () => {
    expect(["ui", "app"].flatMap(files).flatMap(badEffects)).toEqual([]);
  });
});
