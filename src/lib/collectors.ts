/**
 * Collectors turn one real public source into Signal rows.
 * Parsers are pure and unit-tested on tiny fixtures. The fetch wrappers have NOT been run against the live endpoints
 * from this environment: run each one once, compare with the source's own website, and fix any field name that differs.
 */
import { LOCATIONS } from './registry';
import type { NodeId, Signal } from './types';

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'PortPulseBD-student-project (contact: team)' } });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
const fetchJson = async (url: string) => JSON.parse(await fetchText(url));

// ---------- Open-Meteo (marine and weather): model values, not observations ----------

interface OpenMeteoHourly { hourly?: { time?: string[]; [k: string]: unknown } }

export function parseOpenMeteo(
  json: OpenMeteoHourly, sourceId: string, node: NodeId, url: string, now: number,
  fields: Array<{ key: string; metric: string; unit: string }>,
): Signal[] {
  const h = json.hourly;
  if (!h?.time) return [];
  const out: Signal[] = [];
  h.time.forEach((t, i) => {
    const ts = Date.parse(t.endsWith('Z') ? t : `${t}Z`); // request timezone=UTC
    if (Number.isNaN(ts) || ts > now) return; // never store forecast hours as if they had happened
    for (const f of fields) {
      const arr = h[f.key] as Array<number | null> | undefined;
      const v = arr?.[i];
      if (typeof v === 'number') out.push({ sourceId, node, metric: f.metric, ts, value: v, unit: f.unit, url });
    }
  });
  return out;
}

export async function collectOpenMeteoMarine(now: number): Promise<Signal[]> {
  const { lat, lon } = LOCATIONS.CTG_PORT;
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_period&past_days=2&forecast_days=1&timezone=UTC`;
  const json = await fetchJson(url);
  return parseOpenMeteo(json, 'open_meteo_marine', 'CTG_PORT', url, now, [
    { key: 'wave_height', metric: 'marine.wave_height_m', unit: 'm' },
    { key: 'wave_period', metric: 'marine.wave_period_s', unit: 's' },
  ]);
}

export async function collectOpenMeteoWeather(now: number): Promise<Signal[]> {
  const places: Array<[NodeId, number, number]> = [
    ['CTG_PORT', LOCATIONS.CTG_PORT.lat, LOCATIONS.CTG_PORT.lon],
    ['AIR_DAC', LOCATIONS.AIR_DAC.lat, LOCATIONS.AIR_DAC.lon],
    ['AIR_CGP', LOCATIONS.AIR_CGP.lat, LOCATIONS.AIR_CGP.lon],
  ];
  const all: Signal[] = [];
  for (const [node, lat, lon] of places) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,precipitation&past_days=2&forecast_days=1&timezone=UTC`;
    const json = await fetchJson(url);
    all.push(...parseOpenMeteo(json, 'open_meteo_weather', node, url, now, [
      { key: 'wind_speed_10m', metric: 'wx.wind_speed_kmh', unit: 'km/h' },
      { key: 'precipitation', metric: 'wx.precip_mm', unit: 'mm' },
    ]));
  }
  return all;
}

// ---------- NASA EONET ----------

interface EonetEvent { id: string; title: string; geometry?: Array<{ date: string; coordinates: [number, number] | unknown }> }

export function parseEonet(json: { events?: EonetEvent[] }, url: string, now: number): Signal[] {
  const b = LOCATIONS.BAY_BBOX;
  const inBox = (c: unknown) =>
    Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' &&
    c[0] >= b.west && c[0] <= b.east && c[1] >= b.south && c[1] <= b.north;
  const count = (json.events ?? []).filter((e) => (e.geometry ?? []).some((g) => inBox(g.coordinates))).length;
  return [{ sourceId: 'nasa_eonet', node: 'BAY_WEATHER', metric: 'eonet.events_in_bbox', ts: now, value: count, unit: 'events', url }];
}

export async function collectEonet(now: number): Promise<Signal[]> {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7';
  return parseEonet(await fetchJson(url), url, now);
}

// ---------- GDACS ----------

const LEVEL: Record<string, number> = { green: 1, orange: 2, red: 3 };

export function parseGdacs(xml: string, url: string, now: number): Signal[] {
  const items = xml.split(/<item>/i).slice(1);
  let max = 0;
  for (const item of items) {
    if (!/bangladesh/i.test(item)) continue;
    const m = item.match(/<title>\s*(Red|Orange|Green)\s+alert/i) ?? item.match(/<gdacs:alertlevel>\s*(Red|Orange|Green)\s*</i);
    if (m) max = Math.max(max, LEVEL[m[1].toLowerCase()] ?? 0);
  }
  return [{ sourceId: 'gdacs', node: 'BAY_WEATHER', metric: 'gdacs.max_alert_level_bd', ts: now, value: max, unit: 'level 0-3', url }];
}

export async function collectGdacs(now: number): Promise<Signal[]> {
  const url = 'https://www.gdacs.org/xml/rss.xml';
  return parseGdacs(await fetchText(url), url, now);
}

// ---------- Aviation weather (METAR) ----------

interface Metar { icaoId?: string; obsTime?: number; wspd?: number | string; visib?: number | string }

const num = (v: unknown): number | null => {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).replace('+', ''));
  return Number.isNaN(n) ? null : n;
};

/** visib is reported in statute miles by this service; converted to km. Check against the raw report once. */
export function parseMetar(rows: Metar[], url: string): Signal[] {
  const nodeOf: Record<string, NodeId> = { [LOCATIONS.AIR_DAC.icao]: 'AIR_DAC', [LOCATIONS.AIR_CGP.icao]: 'AIR_CGP' };
  const out: Signal[] = [];
  for (const r of rows) {
    const node = r.icaoId ? nodeOf[r.icaoId] : undefined;
    if (!node || typeof r.obsTime !== 'number') continue;
    const ts = r.obsTime * 1000;
    const w = num(r.wspd);
    const v = num(r.visib);
    if (w !== null) out.push({ sourceId: 'metar_taf', node, metric: 'metar.wind_kt', ts, value: w, unit: 'kt', url });
    if (v !== null) out.push({ sourceId: 'metar_taf', node, metric: 'metar.visibility_km', ts, value: v * 1.609, unit: 'km', url });
  }
  return out;
}

export async function collectMetar(): Promise<Signal[]> {
  const url = `https://aviationweather.gov/api/data/metar?ids=${LOCATIONS.AIR_DAC.icao},${LOCATIONS.AIR_CGP.icao}&format=json&hours=3`;
  return parseMetar(await fetchJson(url), url);
}

// ---------- OpenSky (later phase) ----------

export function parseOpenSky(json: { states?: Array<Array<unknown>> | null }, node: NodeId, url: string, now: number): Signal[] {
  const airborne = (json.states ?? []).filter((s) => s[8] === false).length;
  return [{ sourceId: 'opensky', node, metric: 'opensky.aircraft_airborne', ts: now, value: airborne, unit: 'aircraft', url }];
}

export async function collectOpenSky(now: number): Promise<Signal[]> {
  const out: Signal[] = [];
  for (const node of ['AIR_DAC', 'AIR_CGP'] as const) {
    const { lat, lon } = LOCATIONS[node];
    const url = `https://opensky-network.org/api/states/all?lamin=${lat - 0.5}&lomin=${lon - 0.5}&lamax=${lat + 0.5}&lomax=${lon + 0.5}`;
    out.push(...parseOpenSky(await fetchJson(url), node, url, now));
  }
  return out;
}

// ---------- AIS (later phase, needs an always-on worker) ----------

export class AisAggregator {
  private seen = new Map<number, { sog: number; ts: number }>();
  update(mmsi: number, sog: number, ts: number) { this.seen.set(mmsi, { sog, ts }); }
  /** Vessels moving slower than 0.5 knots and heard within the last 15 minutes. */
  snapshot(now: number): Signal {
    let n = 0;
    for (const v of this.seen.values()) if (now - v.ts <= 15 * 60_000 && v.sog < 0.5) n++;
    return { sourceId: 'aisstream', node: 'CTG_PORT', metric: 'ais.vessels_slow_in_box', ts: now, value: n, unit: 'vessels', url: 'https://aisstream.io' };
  }
}

// ---------- Our own verified events ----------

export interface EventRow { node: NodeId; status: 'ACTIVE' | 'ENDED' | 'UNCONFIRMED'; severity: 'LOW' | 'MEDIUM' | 'HIGH' }

/** Counts from the events table (rule V1 already guarantees HIGH means verified). */
export function signalsFromEvents(events: EventRow[], nodes: NodeId[], now: number): Signal[] {
  const out: Signal[] = [];
  for (const node of nodes) {
    const mine = events.filter((e) => e.node === node && e.status !== 'ENDED');
    out.push({ sourceId: 'events_db', node, metric: 'news.active_events', ts: now, value: mine.length, unit: 'events', url: '' });
    out.push({ sourceId: 'events_db', node, metric: 'news.high_verified_events', ts: now, value: mine.filter((e) => e.severity === 'HIGH' && e.status === 'ACTIVE').length, unit: 'events', url: '' });
  }
  return out;
}

export interface CollectResult { signals: Signal[]; errors: Array<{ source: string; error: string }> }

/** Runs each prototype-phase collector on its own, so one failing source never blocks the rest. */
export async function collectPrototype(now: number): Promise<CollectResult> {
  const jobs: Array<[string, () => Promise<Signal[]>]> = [
    ['open_meteo_marine', () => collectOpenMeteoMarine(now)],
    ['open_meteo_weather', () => collectOpenMeteoWeather(now)],
    ['nasa_eonet', () => collectEonet(now)],
    ['gdacs', () => collectGdacs(now)],
    ['metar_taf', () => collectMetar()],
  ];
  const signals: Signal[] = [];
  const errors: CollectResult['errors'] = [];
  for (const [id, job] of jobs) {
    try { signals.push(...(await job())); }
    catch (e) { errors.push({ source: id, error: e instanceof Error ? e.message : String(e) }); }
  }
  return { signals, errors };
}
