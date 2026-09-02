import type { HarnessTool } from "@greeneek/core";

/**
 * Safe arithmetic evaluator (no eval). Supports + - * / % ^, parentheses,
 * unary minus, and constants pi / e.
 */
export function registerCalcTool(registry: { register(t: HarnessTool): void }): void {
  registry.register({
    definition: {
      name: "calc.eval",
      description: "Evaluate a mathematical expression safely.",
      parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    },
    async execute(args) {
      const expr = String(args.expression ?? "");
      const value = evaluate(expr);
      return `${value}`;
    },
  });
}

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "lp" } | { t: "rp" };

export function evaluate(expr: string): number {
  const toks = tokenize(expr);
  let i = 0;

  function peek(): Tok | undefined {
    return toks[i];
  }
  function next(): Tok | undefined {
    return toks[i++];
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "+" || (peek()?.t === "op" && (peek() as { v: string }).v === "-")) {
      const op = (next() as { v: string }).v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const right = parseFactor();
      if (op === "*") left *= right;
      else if (op === "/") left /= right;
      else left %= right;
    }
    return left;
  }

  function parseFactor(): number {
    if (peek()?.t === "op" && (peek() as { v: string }).v === "-") {
      next();
      return -parseFactor();
    }
    if (peek()?.t === "op" && (peek() as { v: string }).v === "+") {
      next();
      return parseFactor();
    }
    const base = parsePower();
    if (peek()?.t === "op" && (peek() as { v: string }).v === "^") {
      next();
      return Math.pow(base, parseFactor());
    }
    return base;
  }

  function parsePower(): number {
    if (peek()?.t === "lp") {
      next();
      const v = parseExpr();
      if (peek()?.t !== "rp") throw new Error("Missing closing parenthesis");
      next();
      return v;
    }
    const tok = next();
    if (!tok || tok.t !== "num") throw new Error(`Unexpected token at ${i}`);
    return tok.v;
  }

  const result = parseExpr();
  if (i !== toks.length) throw new Error("Trailing tokens in expression");
  if (!Number.isFinite(result)) throw new Error("Non-finite result");
  return result;
}

function tokenize(expr: string): Tok[] {
  const out: Tok[] = [];
  let n = "";
  let ident = "";
  const flushNumber = () => {
    if (n) {
      out.push({ t: "num", v: parseFloat(n) });
      n = "";
    }
  };
  const flushIdent = () => {
    if (!ident) return;
    if (ident === "pi" || ident === "π") out.push({ t: "num", v: Math.PI });
    else if (ident === "e") out.push({ t: "num", v: Math.E });
    else throw new Error(`Unknown constant: ${ident}`);
    ident = "";
  };
  for (const ch of expr.replace(/\s+/g, "")) {
    if (/[0-9.]/.test(ch)) {
      flushIdent();
      n += ch;
      continue;
    }
    if (/[a-zπ]/i.test(ch)) {
      flushNumber();
      ident += ch.toLowerCase() === "π" ? "π" : ch.toLowerCase();
      continue;
    }
    flushNumber();
    flushIdent();
    if ("+-*/%^".includes(ch)) {
      out.push({ t: "op", v: ch });
    } else if (ch === "(") {
      out.push({ t: "lp" });
    } else if (ch === ")") {
      out.push({ t: "rp" });
    } else {
      throw new Error(`Unsupported token: ${ch}`);
    }
  }
  flushNumber();
  flushIdent();
  return out;
}
