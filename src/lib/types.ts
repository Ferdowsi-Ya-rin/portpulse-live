export type NodeId =
  | 'CTG_PORT' | 'CTG_CUSTOMS' | 'DHAKA_ICD' | 'DHAKA_CTG_HWY'
  | 'BAY_WEATHER' | 'AIR_DAC' | 'AIR_CGP';

/** NO_DATA: nothing ever received. STALE: last reading too old. OK: fresh, nothing unusual. ALERT: a rule fired. */
export type Status = 'NO_DATA' | 'STALE' | 'OK' | 'ALERT';

/** One real reading from one real source. Never invented; every row carries its source URL. */
export interface Signal {
  sourceId: string;
  node: NodeId;
  metric: string;
  ts: number;        // epoch milliseconds, time of the reading
  value: number;
  unit: string;
  url: string;       // where this reading came from
}

export type SourceKind =
  | 'news' | 'official' | 'weather' | 'hazard' | 'aviation'
  | 'vessels' | 'port-activity' | 'internal';

export interface SourceDef {
  id: string;
  name: string;
  kind: SourceKind;
  cadenceMinutes: number;
  nodes: NodeId[];
  metrics: string[];
  url: string;
  needsKey: boolean;
  terms: string;
  /** EXCERPT = seen in a search excerpt; NOT_CHECKED = not looked at; OWN = produced by our own pipeline. */
  verified: 'EXCERPT' | 'NOT_CHECKED' | 'OWN';
  phase: 'prototype' | 'later';
}

export interface AlertRule { metric: string; op: '>=' | '>'; threshold: number; reason: string }

export interface Insight {
  id: string;
  kind: 'anomaly' | 'changepoint' | 'lead_lag' | 'rule' | 'rule_blocked';
  node: NodeId | null;
  statement: string;           // generated from computed numbers by a template, never by an LLM
  stats: Record<string, number | string>;
  sourceIds: string[];
  computedAt: number;
}

export interface GraphNode {
  id: string;
  label: string;
  group: 'source' | 'place';
  status: Status;
  lastSeen: number | null;
  detail: string;
  phase?: 'prototype' | 'later';
  /** source nodes: what it measures, where it is, its terms, how far it has been checked */
  metrics?: string[];
  url?: string;
  terms?: string;
  verified?: 'EXCERPT' | 'NOT_CHECKED' | 'OWN';
  needsKey?: boolean;
  links?: string[];     // ids of the nodes it connects to
  reasons?: string[];   // place nodes: why an alert is raised
  x: number;
  y: number;
}

/** The last readings of one metric at one place: real stored values only. */
export interface Spark { metric: string; unit: string; sourceId: string; points: Array<[number, number]> }

export interface GraphEdge { from: string; to: string; kind: 'feeds' | 'route'; live: boolean }

export interface GraphData {
  generatedAt: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  sparks: Partial<Record<NodeId, Spark[]>>;
  width: number;
  height: number;
}
