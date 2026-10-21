'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { runCycle } from '../lib/engine';
import { ago, buildGraph } from '../lib/graph';
import type { GraphData, Insight } from '../lib/types';
import { GraphMap } from './GraphMap';
import { DetailPanel, FindingsLog, SetupCheck, type SetupState } from './Panels';
import type { ThemeName } from './theme';

const dhakaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => setT(dhakaTime.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock" aria-label="Current time in Dhaka">Dhaka {t || '--:--:--'}</span>;
}

function Compass() {
  return (
    <svg className="compass" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 2.5" />
      <path d="M24 4 L28 24 L24 44 L20 24 Z" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M24 4 L28 24 L20 24 Z" style={{ fill: 'var(--alert)' }} />
      <path d="M4 24 H44" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

interface Snapshot { graph: GraphData; insights: Insight[]; updatedAt?: string }

export default function LiveView() {
  const [theme, setTheme] = useState<ThemeName>('night');
  const [now, setNow] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [setup, setSetup] = useState<{ state: SetupState; message?: string }>({ state: 'loading' });

  // Empty state: the real state of a system with nothing connected. No readings are invented.
  const emptyGraph = useMemo(() => buildGraph(runCycle([], 0)), []);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  useEffect(() => {
    const dt = document.documentElement.dataset.theme;
    if (dt === 'day' || dt === 'night') setTheme(dt);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!supabase) { setSetup({ state: 'no-env' }); return; }
    let active = true;
    const apply = (row: { graph?: GraphData; insights?: Insight[]; updated_at?: string } | null) => {
      if (!row?.graph) return false;
      const graph = { ...row.graph, sparks: row.graph.sparks ?? {} };
      setSnap({ graph, insights: row.insights ?? [], updatedAt: row.updated_at });
      setSetup({ state: 'ok' });
      return true;
    };
    supabase.from('graph_snapshot').select('graph, insights, updated_at').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setSetup({ state: 'error', message: error.message });
      else if (!apply(data)) setSetup({ state: 'no-snapshot' });
    });
    const channel = supabase
      .channel('graph_snapshot_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'graph_snapshot' }, (payload) => {
        if (active) apply(payload.new as { graph?: GraphData; insights?: Insight[]; updated_at?: string });
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [supabase]);

  const graph = snap?.graph ?? emptyGraph;
  const insights = snap?.insights ?? [];
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const prototypeSources = graph.nodes.filter((n) => n.group === 'source' && n.phase === 'prototype');
  const reporting = prototypeSources.filter((n) => n.status === 'OK').length;
  const alerts = graph.nodes.filter((n) => n.group === 'place' && n.status === 'ALERT').length;

  const toggleTheme = () => {
    const next: ThemeName = theme === 'night' ? 'day' : 'night';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pp-theme', next); } catch { /* ignore */ }
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Compass />
          <div>
            <h1>PortPulse BD</h1>
            <p>Live route graph · Dhaka to Chattogram</p>
          </div>
        </div>
        <dl className="stats">
          <div><dt>Prototype sources reporting</dt><dd>{reporting}<small> of {prototypeSources.length}</small></dd></div>
          <div><dt>Places on alert</dt><dd className={alerts ? 'hot' : ''}>{alerts}</dd></div>
          <div><dt>Last analysis</dt><dd className="small">{snap?.updatedAt && now ? ago(Date.parse(snap.updatedAt), now) : 'not yet'}</dd></div>
        </dl>
        <div className="tools">
          <Clock />
          <button type="button" onClick={toggleTheme} aria-pressed={theme === 'night'}>{theme === 'night' ? 'Night chart' : 'Day chart'}</button>
        </div>
      </header>
      <main className="grid">
        <section className="map" aria-label="Route graph">
          <GraphMap graph={graph} theme={theme} selectedId={selectedId} hoverId={hoverId} onSelect={setSelectedId} onHover={setHoverId} />
        </section>
        <div className="side">
          <SetupCheck state={setup.state} message={setup.message} />
          <DetailPanel graph={graph} selected={selected} theme={theme} now={now || graph.generatedAt} />
          <FindingsLog insights={insights} now={now || graph.generatedAt} />
        </div>
      </main>
    </div>
  );
}
