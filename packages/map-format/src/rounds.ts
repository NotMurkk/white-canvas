/**
 * Round filters for branch policies, 1-based: "all", "odd", "even", "3", "2-5", "10+", or any
 * comma-separated mix ("1-3, 7, 10+"). A branch is open in a round if any term matches.
 */
export type RoundSpecResult = { ok: true; test: (round: number) => boolean } | { ok: false; error: string };

export function parseRoundSpec(spec: string): RoundSpecResult {
  const terms = spec
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return { ok: false, error: 'empty round filter (use "all", "odd", "even", "3", "2-5" or "10+")' };
  const tests: ((r: number) => boolean)[] = [];
  for (const t of terms) {
    let m: RegExpExecArray | null;
    if (t === 'all') tests.push(() => true);
    else if (t === 'none') tests.push(() => false);
    else if (t === 'odd') tests.push((r) => r % 2 === 1);
    else if (t === 'even') tests.push((r) => r % 2 === 0);
    else if ((m = /^(\d+)$/.exec(t))) {
      const n = Number(m[1]);
      tests.push((r) => r === n);
    } else if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(t))) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > b) return { ok: false, error: `"${t}": range runs backwards` };
      tests.push((r) => r >= a && r <= b);
    } else if ((m = /^(\d+)\s*\+$/.exec(t))) {
      const a = Number(m[1]);
      tests.push((r) => r >= a);
    } else return { ok: false, error: `"${t}" is not a round filter (use "all", "odd", "even", "3", "2-5" or "10+")` };
  }
  return { ok: true, test: (r) => tests.some((f) => f(r)) };
}

/** Like parseRoundSpec, but invalid specs never match (validation reports them separately). */
export function roundFilter(spec: string): (round: number) => boolean {
  const r = parseRoundSpec(spec);
  return r.ok ? r.test : () => false;
}
