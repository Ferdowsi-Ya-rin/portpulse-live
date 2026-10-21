import { describe, expect, it } from 'vitest';
import { runCycle } from '../src/lib/engine';
import { buildGraph } from '../src/lib/graph';
import type { Signal } from '../src/lib/types';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
// TEST FIXTURE ONLY.
const sig = (over: Partial<Signal>): Signal => ({
  sourceId: 'open_meteo_marine', node: 'CTG_PORT', metric: 'marine.wave_height_m', ts: NOW, value: 1, unit: 'm', url: 'https://example.test', ...over,
});

describe('runCycle and buildGraph', () => {
  it('marks everything NO_DATA when nothing has arrived (no invented readings)', () => {
    const c = runCycle([], NOW);
    expect(Object.values(c.nodes).every((n) => n.status === 'NO_DATA')).toBe(true);
    expect(Object.values(c.sources).every((s) => s.status === 'NO_DATA')).toBe(true);
    const g = buildGraph(c);
    expect(g.nodes.every((n) => n.status === 'NO_DATA')).toBe(true);
    expect(g.edges.every((e) => !e.live)).toBe(true);
  });

  it('shows OK for a fresh source and STALE for an old one', () => {
    const fresh = runCycle([sig({ ts: NOW - 5 * MIN })], NOW);
    expect(fresh.nodes.CTG_PORT.status).toBe('OK');
    const old = runCycle([sig({ ts: NOW - 600 * MIN })], NOW);
    expect(old.sources.open_meteo_marine.status).toBe('STALE');
    expect(old.nodes.CTG_PORT.status).toBe('STALE');
  });

  it('raises ALERT when a rule fires and writes a template insight', () => {
    const c = runCycle([sig({ sourceId: 'gdacs', node: 'BAY_WEATHER', metric: 'gdacs.max_alert_level_bd', value: 2, unit: 'level', ts: NOW - MIN })], NOW);
    expect(c.nodes.BAY_WEATHER.status).toBe('ALERT');
    expect(c.nodes.BAY_WEATHER.reasons[0]).toMatch(/GDACS/);
  });

  it('detects an anomaly in a series and reports sample size', () => {
    const base = Array.from({ length: 40 }, (_, i) => sig({ ts: NOW - (41 - i) * 60 * MIN, value: 1 + (i % 2 ? 0.05 : -0.05) }));
    const c = runCycle([...base, sig({ ts: NOW - MIN, value: 4 })], NOW);
    const a = c.insights.find((i) => i.kind === 'anomaly');
    expect(a).toBeDefined();
    expect(a!.statement).toMatch(/41 readings/);
    expect(c.nodes.CTG_PORT.status).toBe('ALERT');
  });

  it('is honest about rule learning with too little history', () => {
    const c = runCycle([], NOW, { episodes: [{ flags: ['x'], outcome: true }] });
    expect(c.insights.find((i) => i.kind === 'rule_blocked')?.statement).toMatch(/Not enough history/);
  });
});

describe('sparklines', () => {
  it('keeps only stored readings, newest last, capped at 72', () => {
    const many = Array.from({ length: 100 }, (_, i) => sig({ ts: NOW - (100 - i) * MIN, value: i }));
    const c = runCycle(many, NOW);
    const s = c.sparks.CTG_PORT![0];
    expect(s.points.length).toBe(72);
    expect(s.points[71][1]).toBe(99);
    expect(buildGraph(c).sparks.CTG_PORT![0].metric).toBe('marine.wave_height_m');
  });
  it('has no sparklines when nothing arrived', () => {
    expect(Object.keys(runCycle([], NOW).sparks).length).toBe(0);
  });
});
