import type { AlertRule, NodeId, SourceDef } from './types';

export interface PlaceDef { id: NodeId; label: string }

export const PLACES: PlaceDef[] = [
  { id: 'DHAKA_ICD', label: 'Dhaka-area depots' },
  { id: 'DHAKA_CTG_HWY', label: 'Dhaka-Chattogram corridor' },
  { id: 'CTG_CUSTOMS', label: 'Chattogram customs' },
  { id: 'CTG_PORT', label: 'Chattogram Port' },
  { id: 'BAY_WEATHER', label: 'Bay of Bengal weather' },
  { id: 'AIR_CGP', label: 'Chattogram airport (CGP)' },
  { id: 'AIR_DAC', label: 'Dhaka airport (DAC)' },
];

/** Route topology. Keep every pair adjacent in PLACES so the route can be drawn as straight segments. Air has no cargo route yet (later phase). */
export const ROUTE_EDGES: Array<[NodeId, NodeId]> = [
  ['DHAKA_ICD', 'DHAKA_CTG_HWY'],
  ['DHAKA_CTG_HWY', 'CTG_CUSTOMS'],
  ['CTG_CUSTOMS', 'CTG_PORT'],
  ['BAY_WEATHER', 'CTG_PORT'],
  ['BAY_WEATHER', 'AIR_CGP'],
];

const ALL_GROUND: NodeId[] = ['CTG_PORT', 'CTG_CUSTOMS', 'DHAKA_ICD', 'DHAKA_CTG_HWY'];

export const SOURCES: SourceDef[] = [
  { id: 'events_db', name: 'Verified events from news and notices', kind: 'internal', cadenceMinutes: 15,
    nodes: [...ALL_GROUND, 'BAY_WEATHER'], metrics: ['news.active_events', 'news.high_verified_events'],
    url: '', needsKey: false, terms: 'Our own pipeline; depends on the sources below', verified: 'OWN', phase: 'prototype' },
  { id: 'news_rss', name: 'National news feeds (RSS)', kind: 'news', cadenceMinutes: 15,
    nodes: [...ALL_GROUND], metrics: ['news.articles_new'],
    url: '', needsKey: false, terms: 'Confirm each outlet RSS URL and its terms', verified: 'NOT_CHECKED', phase: 'prototype' },
  { id: 'official_notices', name: 'Port, customs and trade-body notices', kind: 'official', cadenceMinutes: 60,
    nodes: [...ALL_GROUND], metrics: ['official.notices_new'],
    url: '', needsKey: false, terms: 'Find each notices page; read its terms', verified: 'NOT_CHECKED', phase: 'prototype' },
  { id: 'nasa_eonet', name: 'NASA EONET natural events', kind: 'hazard', cadenceMinutes: 60,
    nodes: ['BAY_WEATHER'], metrics: ['eonet.events_in_bbox'],
    url: 'https://eonet.gsfc.nasa.gov', needsKey: false, terms: 'Open API; read NASA usage terms', verified: 'EXCERPT', phase: 'prototype' },
  { id: 'gdacs', name: 'GDACS disaster alerts', kind: 'hazard', cadenceMinutes: 30,
    nodes: ['BAY_WEATHER'], metrics: ['gdacs.max_alert_level_bd'],
    url: 'https://www.gdacs.org', needsKey: false, terms: 'Read GDACS terms of use', verified: 'EXCERPT', phase: 'prototype' },
  { id: 'open_meteo_marine', name: 'Open-Meteo marine forecasts', kind: 'weather', cadenceMinutes: 60,
    nodes: ['CTG_PORT', 'BAY_WEATHER'], metrics: ['marine.wave_height_m', 'marine.wave_period_s'],
    url: 'https://open-meteo.com', needsKey: false, terms: 'Free for non-commercial use; confirm limits', verified: 'EXCERPT', phase: 'prototype' },
  { id: 'open_meteo_weather', name: 'Open-Meteo weather forecasts', kind: 'weather', cadenceMinutes: 60,
    nodes: ['CTG_PORT', 'DHAKA_CTG_HWY', 'AIR_DAC', 'AIR_CGP'], metrics: ['wx.wind_speed_kmh', 'wx.precip_mm'],
    url: 'https://open-meteo.com', needsKey: false, terms: 'Free for non-commercial use; confirm limits', verified: 'NOT_CHECKED', phase: 'prototype' },
  { id: 'metar_taf', name: 'Airport weather (METAR and TAF)', kind: 'aviation', cadenceMinutes: 30,
    nodes: ['AIR_DAC', 'AIR_CGP'], metrics: ['metar.wind_kt', 'metar.visibility_km'],
    url: 'https://aviationweather.gov/api/data', needsKey: false, terms: 'Public API, no key; confirm Bangladesh stations report', verified: 'EXCERPT', phase: 'prototype' },
  { id: 'portwatch', name: 'IMF PortWatch port calls', kind: 'port-activity', cadenceMinutes: 1440,
    nodes: ['CTG_PORT'], metrics: ['portwatch.port_calls'],
    url: 'https://portwatch.imf.org', needsKey: false, terms: 'Confirm Chattogram coverage and terms first', verified: 'NOT_CHECKED', phase: 'prototype' },
  { id: 'cpa_stats', name: 'Port authority statistics', kind: 'port-activity', cadenceMinutes: 43200,
    nodes: ['CTG_PORT'], metrics: ['cpa.monthly_teu'],
    url: '', needsKey: false, terms: 'Find the public statistics pages', verified: 'NOT_CHECKED', phase: 'prototype' },
  { id: 'bmd', name: 'BMD storm signals', kind: 'official', cadenceMinutes: 60,
    nodes: ['BAY_WEATHER'], metrics: ['bmd.signal_level'],
    url: '', needsKey: false, terms: 'Page parsing needed; read terms', verified: 'NOT_CHECKED', phase: 'later' },
  { id: 'opensky', name: 'OpenSky aircraft positions (ADS-B)', kind: 'aviation', cadenceMinutes: 10,
    nodes: ['AIR_DAC', 'AIR_CGP'], metrics: ['opensky.aircraft_airborne'],
    url: 'https://opensky-network.org/api', needsKey: false, terms: 'Research and non-commercial use; rate-limited', verified: 'EXCERPT', phase: 'later' },
  { id: 'aisstream', name: 'AISStream vessel positions', kind: 'vessels', cadenceMinutes: 5,
    nodes: ['CTG_PORT'], metrics: ['ais.vessels_slow_in_box'],
    url: 'https://aisstream.io', needsKey: true, terms: 'Free API key; beta; WebSocket needs an always-on worker', verified: 'EXCERPT', phase: 'later' },
  { id: 'gdelt', name: 'GDELT global events', kind: 'news', cadenceMinutes: 15,
    nodes: [...ALL_GROUND], metrics: ['gdelt.event_count'],
    url: 'https://www.gdeltproject.org', needsKey: false, terms: 'Read GDELT terms', verified: 'NOT_CHECKED', phase: 'later' },
  { id: 'air_cargo_news', name: 'Air cargo news feeds', kind: 'news', cadenceMinutes: 60,
    nodes: ['AIR_DAC', 'AIR_CGP'], metrics: ['aircargo.articles_new'],
    url: '', needsKey: false, terms: 'Pick outlets; confirm RSS and terms', verified: 'NOT_CHECKED', phase: 'later' },
];

/** Things asked for that we will not connect, and why. Shown in the app so the gap is visible and honest. */
export const EXCLUDED = [
  { what: 'CCTV or camera feeds near the port and roads',
    why: 'No lawful public feed is known. Tapping private or unauthorized cameras is illegal and a privacy violation. Add one only if its owner publishes an open, licensed feed.' },
  { what: 'Social-media feeds of individual people',
    why: 'Privacy and platform-terms risk, and rumors. Use official organization notices and published news statements instead.' },
  { what: 'Telemetry from other companies\' own electronics',
    why: 'We cannot access it. The public equivalents are vessel (AIS) and aircraft (ADS-B) transponder broadcasts, listed above.' },
] as const;

/** Alert rules are settings, not data. Disclose them on the transparency page. */
export const ALERT_RULES: AlertRule[] = [
  { metric: 'gdacs.max_alert_level_bd', op: '>=', threshold: 2, reason: 'GDACS alert of orange or higher affecting Bangladesh' },
  { metric: 'news.high_verified_events', op: '>=', threshold: 1, reason: 'A HIGH event confirmed by an official source or two outlets' },
];

/** Pairs of metrics checked for a lead-lag relationship once both have enough history. */
export const LEAD_LAG_PAIRS: Array<{ a: string; b: string; node: NodeId; label: string }> = [
  { a: 'marine.wave_height_m', b: 'portwatch.port_calls', node: 'CTG_PORT', label: 'wave height and daily port calls' },
];

/** Approximate coordinates for collectors. Verify on a map before relying on them. */
export const LOCATIONS = {
  CTG_PORT: { lat: 22.3, lon: 91.8 },
  BAY_BBOX: { south: 15, north: 24, west: 85, east: 95 },
  AIR_DAC: { icao: 'VGHS', lat: 23.84, lon: 90.4 },
  AIR_CGP: { icao: 'VGEG', lat: 22.25, lon: 91.81 },
} as const;
