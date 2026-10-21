import { ALERT_RULES, LEAD_LAG_PAIRS, PLACES, SOURCES } from './registry';
import { alignHourly, crossCorrelation, cusum, ewmaZ, induceRules, type Episode } from './analysis';
import type { Insight, NodeId, Signal, Spark, Status } from './types';

export interface NodeState { status: Status; lastSeen: number | null; reasons: string[]; sources: string[] }
export interface SourceState { status: 'NO_DATA' | 'STALE' | 'OK'; lastSeen: number | null }

export interface CycleResult {
  now: number;
  nodes: Record<NodeId, NodeState>;
  sources: Record<string, SourceState>;
  insights: Insight[];
  sparks: Partial<Record<NodeId, Spark[]>>;
}

export interface CycleOptions {
  /** Past episodes for rule induction: which conditions were present, and whether the outcome followed. Must come from real records. */
  episodes?: Episode[];
  outcomeLabel?: string;
  staleFactor?: number;
}

const nodeLabel = (id: NodeId) => PLACES.find((p) => p.id === id)?.label ?? id;
const round = (v: number, d = 2) => Number(v.toFixed(d));

function group(signals: Signal[]): Map<string, Signal[]> {
  const m = new Map<string, Signal[]>();
  for (const s of signals) {
    const key = `${s.node}|${s.metric}`;
    const arr = m.get(key) ?? [];
    arr.push(s);
    m.set(key, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.ts - b.ts);
  return m;
}

export function runCycle(signals: Signal[], now: number, opts: CycleOptions = {}): CycleResult {
  const staleFactor = opts.staleFactor ?? 3;
  const insights: Insight[] = [];
  const series = group(signals);

  // Source freshness
  const sources: Record<string, SourceState> = {};
  for (const src of SOURCES) {
    const mine = signals.filter((s) => s.sourceId === src.id);
    const lastSeen = mine.length ? Math.max(...mine.map((s) => s.ts)) : null;
    let status: SourceState['status'] = 'NO_DATA';
    if (lastSeen !== null) status = now - lastSeen > staleFactor * src.cadenceMinutes * 60_000 ? 'STALE' : 'OK';
    sources[src.id] = { status, lastSeen };
  }

  // Per-series analysis: anomalies and change-points
  const flaggedNodes = new Map<NodeId, string[]>();
  const flag = (node: NodeId, reason: string) => {
    const arr = flaggedNodes.get(node) ?? [];
    arr.push(reason);
    flaggedNodes.set(node, arr);
  };
  for (const [key, arr] of series) {
    const [node, metric] = key.split('|') as [NodeId, string];
    const values = arr.map((s) => s.value);
    const unit = arr[arr.length - 1].unit;
    const ids = [...new Set(arr.map((s) => s.sourceId))];
    const z = ewmaZ(values);
    if (z.state === 'OK' && Math.abs(z.z) >= 3) {
      const dir = z.z > 0 ? 'above' : 'below';
      insights.push({
        id: `anomaly:${key}`, kind: 'anomaly', node,
        statement: `${metric} at ${nodeLabel(node)} is ${round(Math.abs(z.z), 1)} standard deviations ${dir} its recent average (latest ${round(z.latest)} ${unit}, average ${round(z.mean)} ${unit}, ${z.n} readings).`,
        stats: { z: round(z.z), latest: round(z.latest), mean: round(z.mean), n: z.n },
        sourceIds: ids, computedAt: now,
      });
      flag(node, `${metric} unusual (z = ${round(z.z, 1)})`);
    }
    const c = cusum(values);
    if (c.state === 'OK' && c.shift !== 'none' && c.ongoing && c.index !== null) {
      const hoursAgo = Math.max(0, Math.round((now - arr[c.index].ts) / 3_600_000));
      insights.push({
        id: `changepoint:${key}`, kind: 'changepoint', node,
        statement: `${metric} at ${nodeLabel(node)} shifted ${c.shift === 'up' ? 'upward' : 'downward'} about ${hoursAgo} hours ago and has not returned to its earlier level (${c.n} readings).`,
        stats: { shift: c.shift, hoursAgo, n: c.n },
        sourceIds: ids, computedAt: now,
      });
      flag(node, `${metric} shifted ${c.shift}`);
    }
  }

  // Alert rules on the latest value of a metric
  for (const rule of ALERT_RULES) {
    for (const [key, arr] of series) {
      const [node, metric] = key.split('|') as [NodeId, string];
      if (metric !== rule.metric) continue;
      const latest = arr[arr.length - 1].value;
      const hit = rule.op === '>=' ? latest >= rule.threshold : latest > rule.threshold;
      if (hit) flag(node, rule.reason);
    }
  }

  // Lead-lag relationships (correlation, not cause)
  for (const pair of LEAD_LAG_PAIRS) {
    const a = series.get(`${pair.node}|${pair.a}`);
    const b = series.get(`${pair.node}|${pair.b}`);
    if (!a || !b) continue;
    const al = alignHourly(a, b);
    const res = crossCorrelation(al.a, al.b);
    if (res.state === 'OK' && res.significant) {
      insights.push({
        id: `lead_lag:${pair.node}:${pair.a}:${pair.b}`, kind: 'lead_lag', node: pair.node,
        statement: `${pair.label}: the strongest relationship is at a lag of ${res.lag} hours (r = ${round(res.r)}, ${res.n} paired readings, noise band ±${round(res.band)}). This is a correlation, not proof of cause.`,
        stats: { lag: res.lag, r: round(res.r), n: res.n, band: round(res.band) },
        sourceIds: [...new Set([...a, ...b].map((s) => s.sourceId))], computedAt: now,
      });
    }
  }

  // Rule induction over real past episodes
  if (opts.episodes) {
    const r = induceRules(opts.episodes);
    if (r.state === 'INSUFFICIENT') {
      insights.push({
        id: 'rule:insufficient', kind: 'rule_blocked', node: null,
        statement: `Not enough history to learn rules yet: ${r.n} past episodes, at least ${r.need} needed. Findings appear as real episodes accumulate.`,
        stats: { n: r.n, need: r.need }, sourceIds: [], computedAt: now,
      });
    } else {
      for (const rule of r.rules.slice(0, 5)) {
        const pct = (v: number) => Math.round(v * 100);
        insights.push({
          id: `rule:${rule.antecedent.join('+')}`, kind: 'rule', node: null,
          statement: `When ${rule.antecedent.join(' and ')} were present, ${opts.outcomeLabel ?? 'the outcome'} followed ${rule.hits} of ${rule.support} times (${pct(rule.confidence)}%, 95% interval ${pct(rule.lower)}-${pct(rule.upper)}%), against ${pct(rule.baseRate)}% of all ${r.n} episodes.`,
          stats: { support: rule.support, hits: rule.hits, lift: round(rule.lift), n: r.n },
          sourceIds: [], computedAt: now,
        });
      }
      if (r.rules.length === 0) {
        insights.push({
          id: 'rule:none', kind: 'rule_blocked', node: null,
          statement: `No rule is strong enough yet: ${r.n} episodes, ${r.blocked} candidate patterns had too little support to report.`,
          stats: { n: r.n, blocked: r.blocked }, sourceIds: [], computedAt: now,
        });
      }
    }
  }

  // Node status
  const nodes = {} as Record<NodeId, NodeState>;
  for (const place of PLACES) {
    const mine = signals.filter((s) => s.node === place.id);
    const feeding = SOURCES.filter((s) => s.nodes.includes(place.id));
    const lastSeen = mine.length ? Math.max(...mine.map((s) => s.ts)) : null;
    const reasons = flaggedNodes.get(place.id) ?? [];
    let status: Status = 'NO_DATA';
    if (lastSeen !== null) {
      const live = feeding.filter((s) => sources[s.id].status === 'OK');
      status = reasons.length ? 'ALERT' : live.length ? 'OK' : 'STALE';
    }
    nodes[place.id] = { status, lastSeen, reasons, sources: feeding.map((s) => s.id) };
  }

  // Recent readings for the sparklines (stored values only)
  const sparks: Partial<Record<NodeId, Spark[]>> = {};
  for (const [key, arr] of series) {
    const [node, metric] = key.split('|') as [NodeId, string];
    const last = arr.slice(-72);
    const tail = last[last.length - 1];
    (sparks[node] ??= []).push({ metric, unit: tail.unit, sourceId: tail.sourceId, points: last.map((s) => [s.ts, round(s.value, 3)]) });
  }

  return { now, nodes, sources, insights, sparks };
}
