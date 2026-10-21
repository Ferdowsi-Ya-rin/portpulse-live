-- Run in the Supabase SQL editor. Writes happen only with the service-role key (server side).

create table if not exists signals (
  id bigint generated always as identity primary key,
  source_id text not null,
  node text not null,
  metric text not null,
  ts timestamptz not null,
  value double precision not null,
  unit text not null,
  url text not null default '',
  unique (source_id, node, metric, ts)
);
create index if not exists signals_node_metric_ts on signals (node, metric, ts desc);

-- one row (id = 1): the latest graph and findings, rewritten by each analysis cycle
create table if not exists graph_snapshot (
  id int primary key,
  graph jsonb not null,
  insights jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table signals enable row level security;
alter table graph_snapshot enable row level security;
create policy "public can read the snapshot" on graph_snapshot for select using (true);
-- no policy on signals: only the service-role key can read or write raw signals

alter publication supabase_realtime add table graph_snapshot;
