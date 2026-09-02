/** Minimal semver compare (spec-compliant for the numeric core we ship). */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/, "").split("-")[0];
    const [maj, min = 0, patch = 0] = clean.split(".").map((n) => parseInt(n, 10) || 0);
    return [maj, min, patch];
  };
  const [am, amin, ap] = parse(a);
  const [bm, bmin, bp] = parse(b);
  if (am !== bm) return am - bm;
  if (amin !== bmin) return amin - bmin;
  return ap - bp;
}

export function satisfies(version: string, range: string): boolean {
  if (!range || range === "*") return true;
  if (range.startsWith("^")) {
    const target = parse(range.slice(1));
    const v = parse(version);
    return v[0] === target[0] && v[1] >= target[1] && (v[1] !== target[1] || v[2] >= target[2]);
  }
  if (range.startsWith("~")) {
    const target = parse(range.slice(1));
    const v = parse(version);
    return v[0] === target[0] && v[1] === target[1];
  }
  if (range.startsWith(">=")) return compareSemver(version, range.slice(2)) >= 0;
  if (range.startsWith("<=")) return compareSemver(version, range.slice(2)) <= 0;
  if (range.startsWith(">")) return compareSemver(version, range.slice(1)) > 0;
  if (range.startsWith("<")) return compareSemver(version, range.slice(1)) < 0;
  return compareSemver(version, range) === 0;
}

function parse(v: string): [number, number, number] {
  const [maj, min = 0, patch = 0] = v.split(".").map((n) => parseInt(n, 10) || 0);
  return [maj, min, patch];
}
