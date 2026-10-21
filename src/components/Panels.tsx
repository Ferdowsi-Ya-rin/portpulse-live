import { ago } from '../lib/graph';
import { EXCLUDED } from '../lib/registry';
import type { GraphData, GraphNode, Insight, Spark } from '../lib/types';
import { PALETTES, statusColor, type ThemeName } from './theme';

const kindLabel: Record<Insight['kind'], string> = {
  anomaly: 'Unusual reading', changepoint: 'Sustained shift', lead_lag: 'Link between two series',
  rule: 'Pattern from past episodes', rule_blocked: 'Not enough history yet',
};

const verifiedText = {
  EXCERPT: 'Seen in a search excerpt. Open it and read its terms before relying on it.',
  NOT_CHECKED: 'Not checked yet. Confirm that it exists and read its terms.',
  OWN: 'Our own pipeline.',
} as const;

export function Sparkline({ spark, theme }: { spark: Spark; theme: ThemeName }) {
  const P = PALETTES[theme];
  const pts = spark.points;
  if (pts.length < 2) return <p className="muted">{spark.metric}: one reading so far.</p>;
  const w = 260, h = 46, pad = 4;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - y0) / Math.max(1e-9, y1 - y0)) * (h - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <figure className="spark">
      <figcaption>
        <strong>{spark.metric}</strong>
        <span>{last[1]} {spark.unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${spark.metric}: latest ${last[1]} ${spark.unit}, range ${y0} to ${y1}, ${pts.length} readings`}>
        <path d={d} fill="none" stroke={P.ok} strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx={sx(last[0])} cy={sy(last[1])} r={3.2} fill={P.ok} />
      </svg>
      <small className="muted">{pts.length} readings, range {y0} to {y1}</small>
    </figure>
  );
}

export function DetailPanel({ graph, selected, theme, now }: { graph: GraphData; selected: GraphNode | null; theme: ThemeName; now: number }) {
  const P = PALETTES[theme];
  if (!selected) {
    return (
      <section className="card" aria-live="polite">
        <h3>Details</h3>
        <p className="muted">Select a source or a place on the graph to see what it measures, how far it has been checked, and its latest readings.</p>
      </section>
    );
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const isSource = selected.group === 'source';
  const sparks: Spark[] = isSource
    ? Object.values(graph.sparks).flat().filter((s): s is Spark => !!s && s.sourceId === selected.id)
    : (graph.sparks[selected.id as keyof typeof graph.sparks] ?? []);
  return (
    <section className="card" aria-live="polite">
      <h3>{selected.label}</h3>
      <p style={{ color: statusColor(P, selected.status), margin: '0 0 10px' }}>
        <strong>{selected.status === 'ALERT' ? 'Alert' : selected.status === 'OK' ? 'Reporting' : selected.status === 'STALE' ? 'Stale' : 'No data'}</strong>
        {' · '}{selected.detail}
      </p>
      {selected.reasons && selected.reasons.length > 0 && (
        <ul className="plain">{selected.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      {isSource && (
        <>
          <p className="kv"><span>Measures</span><span>{selected.metrics?.join(', ')}</span></p>
          <p className="kv"><span>Feeds</span><span>{selected.links?.map((id) => byId.get(id)?.label).filter(Boolean).join(', ')}</span></p>
          <p className="kv"><span>Terms</span><span>{selected.terms}</span></p>
          <p className="kv"><span>Checked</span><span>{selected.verified ? verifiedText[selected.verified] : ''}</span></p>
          {selected.needsKey && <p className="kv"><span>Key</span><span>Needs a free API key.</span></p>}
          {selected.phase === 'later' && <p className="kv"><span>Phase</span><span>Planned for later, not part of the 14-day prototype.</span></p>}
          {selected.url && <p className="kv"><span>Source</span><span><a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a></span></p>}
        </>
      )}
      {!isSource && selected.links && (
        <>
          <h4>Sources for this place</h4>
          <ul className="plain">
            {selected.links.map((id) => {
              const s = byId.get(id);
              return s ? <li key={id}><span style={{ color: statusColor(P, s.status) }}>●</span> {s.label}: {s.detail}</li> : null;
            })}
          </ul>
        </>
      )}
      <h4>Latest readings</h4>
      {sparks.length === 0 ? <p className="muted">No readings yet. Nothing is drawn until real data arrives.</p> : sparks.map((s) => <Sparkline key={`${s.sourceId}${s.metric}`} spark={s} theme={theme} />)}
      {selected.lastSeen && <small className="muted">Last reading {ago(selected.lastSeen, now)}</small>}
    </section>
  );
}

export function FindingsLog({ insights, now }: { insights: Insight[]; now: number }) {
  return (
    <section className="card">
      <h3>What the analysis found</h3>
      {insights.length === 0 ? (
        <p className="muted">Nothing yet. Findings appear here once real readings arrive and the analysis cycle has run.</p>
      ) : (
        <ol className="log">
          {insights.map((i) => (
            <li key={i.id} className={i.kind}>
              <small>{kindLabel[i.kind]} · {ago(i.computedAt, now)}</small>
              <p>{i.statement}</p>
              {i.sourceIds.length > 0 && <small className="muted">Sources: {i.sourceIds.join(', ')}</small>}
            </li>
          ))}
        </ol>
      )}
      <details>
        <summary>Not connected on purpose</summary>
        <ul className="plain">
          {EXCLUDED.map((x) => <li key={x.what}><strong>{x.what}.</strong> {x.why}</li>)}
        </ul>
      </details>
    </section>
  );
}

export type SetupState = 'no-env' | 'loading' | 'no-snapshot' | 'ok' | 'error';

export function SetupCheck({ state, message }: { state: SetupState; message?: string }) {
  const rank: Record<SetupState, number> = { 'no-env': 0, loading: 1, error: 1, 'no-snapshot': 2, ok: 3 };
  const r = rank[state];
  if (state === 'ok') return null;
  const steps = [
    { done: r >= 1, text: 'Supabase address and key found in .env.local' },
    { done: r >= 2, text: 'Database reachable and tables created (supabase/live.sql)' },
    { done: r >= 3, text: 'First analysis cycle has run (npm run cycle)' },
  ];
  return (
    <section className="card setup">
      <h3>Setup check</h3>
      <ol className="steps">
        {steps.map((s) => <li key={s.text} className={s.done ? 'done' : ''}><span aria-hidden="true">{s.done ? '✓' : '○'}</span> {s.text}</li>)}
      </ol>
      {state === 'loading' && <p className="muted">Checking the database…</p>}
      {state === 'error' && <p role="alert">Could not read the snapshot: {message}</p>}
      {state === 'no-env' && <p className="muted">Open the README, step 5, and fill in .env.local. Then restart npm run dev.</p>}
      {state === 'no-snapshot' && <p className="muted">Connected. Run <code>npm run cycle</code> once; this page updates by itself.</p>}
    </section>
  );
}
