import { PLACES, ROUTE_EDGES, SOURCES } from './registry';
import type { CycleResult } from './engine';
import type { GraphData, GraphEdge, GraphNode } from './types';

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const LAYOUT = { width: 1000, sourceX: 390, placeX: 700, top: 78, rowH: 40 };

/** Turns one analysis cycle into drawable nodes and edges. Nothing here invents data: no signal means NO_DATA. */
export function buildGraph(cycle: CycleResult): GraphData {
  const { now } = cycle;
  const ordered = [...SOURCES].sort((a, b) => (a.phase === b.phase ? 0 : a.phase === 'prototype' ? -1 : 1));
  const height = LAYOUT.top + ordered.length * LAYOUT.rowH + 34;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  ordered.forEach((src, i) => {
    const st = cycle.sources[src.id];
    let detail: string;
    if (st.status === 'NO_DATA') detail = src.phase === 'later' ? 'planned for a later phase' : 'not connected yet';
    else if (st.status === 'STALE') detail = `stale, last reading ${ago(st.lastSeen!, now)}`;
    else detail = `last reading ${ago(st.lastSeen!, now)}`;
    nodes.push({
      id: src.id, label: src.name, group: 'source', phase: src.phase, lastSeen: st.lastSeen,
      status: st.status === 'OK' ? 'OK' : st.status, detail,
      metrics: src.metrics, url: src.url, terms: src.terms, verified: src.verified, needsKey: src.needsKey, links: src.nodes,
      x: LAYOUT.sourceX, y: LAYOUT.top + i * LAYOUT.rowH,
    });
  });

  const span = (ordered.length - 1) * LAYOUT.rowH;
  PLACES.forEach((p, i) => {
    const st = cycle.nodes[p.id];
    let detail: string;
    if (st.status === 'NO_DATA') detail = 'no data yet';
    else if (st.status === 'STALE') detail = `stale, last reading ${ago(st.lastSeen!, now)}`;
    else if (st.status === 'ALERT') detail = st.reasons[0] ?? 'alert';
    else {
      const k = st.sources.filter((id) => cycle.sources[id].status === 'OK').length;
      detail = `${k} ${k === 1 ? 'source' : 'sources'} reporting`;
    }
    nodes.push({
      id: p.id, label: p.label, group: 'place', status: st.status, lastSeen: st.lastSeen, detail,
      reasons: st.reasons, links: st.sources,
      x: LAYOUT.placeX, y: LAYOUT.top + (span * i) / Math.max(1, PLACES.length - 1),
    });
  });

  for (const src of ordered) {
    for (const node of src.nodes) {
      edges.push({ from: src.id, to: node, kind: 'feeds', live: cycle.sources[src.id].status === 'OK' && cycle.nodes[node].lastSeen !== null });
    }
  }
  for (const [a, b] of ROUTE_EDGES) {
    edges.push({ from: a, to: b, kind: 'route', live: cycle.nodes[a].status !== 'NO_DATA' && cycle.nodes[b].status !== 'NO_DATA' });
  }
  return { generatedAt: now, nodes, edges, sparks: cycle.sparks, width: LAYOUT.width, height };
}
