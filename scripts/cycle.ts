/**
 * One analysis cycle: collect -> store -> analyse -> publish the snapshot the page is listening to.
 * Run it by hand with "npm run cycle", or on a schedule (GitHub Actions, see README).
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local locally, from GitHub secrets in Actions).
 */
import { createClient } from '@supabase/supabase-js';
import { collectPrototype, signalsFromEvents, type EventRow } from '../src/lib/collectors';
import { runCycle } from '../src/lib/engine';
import { buildGraph } from '../src/lib/graph';
import { PLACES } from '../src/lib/registry';
import type { Signal } from '../src/lib/types';

try { process.loadEnvFile('.env.local'); } catch { /* no .env.local: use real environment variables */ }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill them in .env.local (see README, step 5).');
  process.exit(1);
}
const db = createClient(url, key);

const toRow = (s: Signal) => ({ source_id: s.sourceId, node: s.node, metric: s.metric, ts: new Date(s.ts).toISOString(), value: s.value, unit: s.unit, url: s.url });

async function main() {
  const now = Date.now();

  // 1. Collect from the public sources; one failure never blocks the others
  const { signals: fresh, errors } = await collectPrototype(now);
  errors.forEach((e) => console.warn(`collector failed: ${e.source}: ${e.error}`));

  // 2. Counts from the main app's verified events, only if that table exists (it does once the main app is set up)
  const { data: events, error: evErr } = await db.from('events').select('node, status, severity');
  if (!evErr && events) {
    const groundNodes = PLACES.map((p) => p.id).filter((id) => id !== 'AIR_DAC' && id !== 'AIR_CGP');
    fresh.push(...signalsFromEvents(events as EventRow[], groundNodes, now));
  } else {
    console.log('events table not found yet: skipping verified-event counts (fine for now)');
  }

  if (fresh.length) {
    const { error } = await db.from('signals').upsert(fresh.map(toRow), { onConflict: 'source_id,node,metric,ts', ignoreDuplicates: true });
    if (error) throw new Error(`could not store readings: ${error.message}. Did you run supabase/live.sql?`);
  }

  // 3. Analyse the last 14 days of stored readings
  const since = new Date(now - 14 * 24 * 3_600_000).toISOString();
  const { data: rows, error: readErr } = await db.from('signals').select('source_id,node,metric,ts,value,unit,url').gte('ts', since).order('ts').limit(50_000);
  if (readErr) throw new Error(`could not read readings: ${readErr.message}`);
  const signals: Signal[] = (rows ?? []).map((r) => ({
    sourceId: r.source_id, node: r.node, metric: r.metric, ts: Date.parse(r.ts), value: r.value, unit: r.unit, url: r.url,
  }));
  // Rule learning needs real labeled past episodes. None are connected yet, so it reports "not enough history".
  const cycle = runCycle(signals, now, { episodes: [], outcomeLabel: 'a dip in port activity' });

  // 4. Publish
  const { error: pubErr } = await db.from('graph_snapshot').upsert({ id: 1, graph: buildGraph(cycle), insights: cycle.insights, updated_at: new Date(now).toISOString() });
  if (pubErr) throw new Error(`could not publish: ${pubErr.message}`);
  console.log(`cycle done: ${fresh.length} readings collected, ${cycle.insights.length} findings, ${errors.length} collector errors`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
