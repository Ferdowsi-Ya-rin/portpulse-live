/** Pure statistics. No network, no LLM. Every function says "INSUFFICIENT" instead of guessing. */

export interface Insufficient { state: 'INSUFFICIENT'; n: number; need: number }

export interface EwmaResult { state: 'OK'; z: number; mean: number; sd: number; latest: number; n: number }

/** Exponentially weighted z-score of the latest value against the earlier ones. */
export function ewmaZ(values: number[], alpha = 0.2, minPoints = 24): EwmaResult | Insufficient {
  const n = values.length;
  if (n < minPoints) return { state: 'INSUFFICIENT', n, need: minPoints };
  let mean = values[0];
  let variance = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = values[i] - mean;
    mean += alpha * d;
    variance = (1 - alpha) * (variance + alpha * d * d);
  }
  const sd = Math.sqrt(variance);
  const latest = values[n - 1];
  const z = sd > 1e-9 ? (latest - mean) / sd : 0;
  return { state: 'OK', z, mean, sd, latest, n };
}

export interface CusumResult { state: 'OK'; shift: 'none' | 'up' | 'down'; index: number | null; ongoing: boolean; n: number }

/** Two-sided CUSUM against a baseline taken from the first part of the series. */
export function cusum(values: number[], k = 0.5, h = 5, minPoints = 24): CusumResult | Insufficient {
  const n = values.length;
  if (n < minPoints) return { state: 'INSUFFICIENT', n, need: minPoints };
  const baseN = Math.max(12, Math.floor(n / 2));
  const base = values.slice(0, baseN);
  const mean = base.reduce((s, v) => s + v, 0) / base.length;
  const sd = Math.sqrt(base.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, base.length - 1));
  if (sd < 1e-9) return { state: 'OK', shift: 'none', index: null, ongoing: false, n };
  let hi = 0, lo = 0;
  let first: { dir: 'up' | 'down'; index: number } | null = null;
  for (let i = baseN; i < n; i++) {
    const z = (values[i] - mean) / sd;
    hi = Math.max(0, hi + z - k);
    lo = Math.max(0, lo - z - k);
    if (!first && hi > h) first = { dir: 'up', index: i };
    if (!first && lo > h) first = { dir: 'down', index: i };
  }
  return {
    state: 'OK',
    shift: first ? first.dir : 'none',
    index: first ? first.index : null,
    ongoing: hi > h || lo > h,
    n,
  };
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den < 1e-12 ? 0 : num / den;
}

export interface LeadLagResult { state: 'OK'; lag: number; r: number; n: number; band: number; significant: boolean }

/** Pearson correlation at lags -maxLag..maxLag. Positive lag means a leads b. A correlation, never proof of cause. */
export function crossCorrelation(a: number[], b: number[], maxLag = 24, minPoints = 30): LeadLagResult | Insufficient {
  const len = Math.min(a.length, b.length);
  if (len < minPoints + maxLag) return { state: 'INSUFFICIENT', n: len, need: minPoints + maxLag };
  let best: { lag: number; r: number; n: number } | null = null;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const xa: number[] = [], xb: number[] = [];
    for (let i = 0; i < len; i++) {
      const j = i + lag;
      if (j >= 0 && j < len) { xa.push(a[i]); xb.push(b[j]); }
    }
    if (xa.length < minPoints) continue;
    const r = pearson(xa, xb);
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { lag, r, n: xa.length };
  }
  if (!best) return { state: 'INSUFFICIENT', n: len, need: minPoints + maxLag };
  const band = 1.96 / Math.sqrt(best.n);
  return { state: 'OK', lag: best.lag, r: best.r, n: best.n, band, significant: Math.abs(best.r) >= band };
}

export interface Point { ts: number; value: number }

/** Average each series into hourly buckets and keep only the hours present in both. */
export function alignHourly(a: Point[], b: Point[]): { a: number[]; b: number[]; hours: number[] } {
  const bucket = (pts: Point[]) => {
    const m = new Map<number, { s: number; c: number }>();
    for (const p of pts) {
      const h = Math.floor(p.ts / 3_600_000);
      const cur = m.get(h) ?? { s: 0, c: 0 };
      cur.s += p.value; cur.c += 1;
      m.set(h, cur);
    }
    return m;
  };
  const ma = bucket(a), mb = bucket(b);
  const hours = [...ma.keys()].filter((h) => mb.has(h)).sort((x, y) => x - y);
  return {
    hours,
    a: hours.map((h) => ma.get(h)!.s / ma.get(h)!.c),
    b: hours.map((h) => mb.get(h)!.s / mb.get(h)!.c),
  };
}

/** Wilson score interval for a proportion. */
export function wilson(hits: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lower: Math.max(0, (centre - margin) / d), upper: Math.min(1, (centre + margin) / d) };
}

export interface Episode { flags: string[]; outcome: boolean }

export interface Rule {
  antecedent: string[];
  support: number;
  hits: number;
  confidence: number;
  baseRate: number;
  lift: number;
  lower: number;
  upper: number;
}

export interface RuleResult { state: 'OK'; n: number; baseRate: number; rules: Rule[]; blocked: number }

export interface RuleOptions { minSupport?: number; minEpisodes?: number; maxSize?: 1 | 2 }

/**
 * Inductive generalization over past episodes: "when these conditions were present, the outcome followed X% of the time".
 * A rule is reported only if it has enough support AND its 95% lower bound beats the base rate.
 * Candidates with too little support are counted in `blocked` and never shown as findings.
 */
export function induceRules(episodes: Episode[], opts: RuleOptions = {}): RuleResult | Insufficient {
  const minSupport = opts.minSupport ?? 3;
  const minEpisodes = opts.minEpisodes ?? 10;
  const maxSize = opts.maxSize ?? 2;
  const n = episodes.length;
  if (n < minEpisodes) return { state: 'INSUFFICIENT', n, need: minEpisodes };
  const outcomes = episodes.filter((e) => e.outcome).length;
  const baseRate = outcomes / n;
  const flags = [...new Set(episodes.flatMap((e) => e.flags))].sort();
  const candidates: string[][] = flags.map((f) => [f]);
  if (maxSize === 2) {
    for (let i = 0; i < flags.length; i++)
      for (let j = i + 1; j < flags.length; j++) candidates.push([flags[i], flags[j]]);
  }
  const rules: Rule[] = [];
  let blocked = 0;
  for (const antecedent of candidates) {
    const matching = episodes.filter((e) => antecedent.every((f) => e.flags.includes(f)));
    const support = matching.length;
    if (support === 0) continue;
    if (support < minSupport) { blocked++; continue; }
    const hits = matching.filter((e) => e.outcome).length;
    const confidence = hits / support;
    const { lower, upper } = wilson(hits, support);
    const lift = baseRate > 0 ? confidence / baseRate : 0;
    if (lift > 1 && lower > baseRate) rules.push({ antecedent, support, hits, confidence, baseRate, lift, lower, upper });
  }
  rules.sort((x, y) => y.lower - x.lower);
  return { state: 'OK', n, baseRate, rules, blocked };
}
