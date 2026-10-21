import { describe, expect, it } from 'vitest';
import { AisAggregator, parseEonet, parseGdacs, parseMetar, parseOpenMeteo, parseOpenSky, signalsFromEvents } from '../src/lib/collectors';

const NOW = Date.parse('2026-10-17T12:00:00Z');
// TEST FIXTURES ONLY: tiny made-up payloads shaped like the documented formats.

describe('parsers', () => {
  it('Open-Meteo: keeps past hours, drops forecast hours', () => {
    const json = { hourly: { time: ['2026-10-17T10:00', '2026-10-17T11:00', '2026-10-17T13:00'], wave_height: [1.1, 1.2, 1.9] } };
    const out = parseOpenMeteo(json, 'open_meteo_marine', 'CTG_PORT', 'u', NOW, [{ key: 'wave_height', metric: 'marine.wave_height_m', unit: 'm' }]);
    expect(out.map((s) => s.value)).toEqual([1.1, 1.2]);
  });
  it('EONET: counts only events inside the Bay of Bengal box', () => {
    const json = { events: [
      { id: 'a', title: 'in', geometry: [{ date: 'x', coordinates: [90, 20] }] },
      { id: 'b', title: 'out', geometry: [{ date: 'x', coordinates: [10, 50] }] },
    ] };
    expect(parseEonet(json, 'u', NOW)[0].value).toBe(1);
  });
  it('GDACS: takes the highest alert that mentions Bangladesh, 0 when none', () => {
    const xml = '<rss><item><title>Orange alert for tropical cyclone X.</title><description>affects Bangladesh, India</description></item><item><title>Red alert for flood Y.</title><description>Peru</description></item></rss>';
    expect(parseGdacs(xml, 'u', NOW)[0].value).toBe(2);
    expect(parseGdacs('<rss></rss>', 'u', NOW)[0].value).toBe(0);
  });
  it('METAR: maps stations to airport nodes and converts visibility', () => {
    const out = parseMetar([{ icaoId: 'VGHS', obsTime: 1_800_000_000, wspd: 12, visib: '6' }, { icaoId: 'XXXX', obsTime: 1, wspd: 1 }], 'u');
    expect(out.find((s) => s.metric === 'metar.wind_kt')?.node).toBe('AIR_DAC');
    expect(out.find((s) => s.metric === 'metar.visibility_km')?.value).toBeCloseTo(9.654, 2);
    expect(out.length).toBe(2);
  });
  it('OpenSky: counts airborne aircraft only', () => {
    const states = [[0, 0, 0, 0, 0, 0, 0, 0, false], [0, 0, 0, 0, 0, 0, 0, 0, true]];
    expect(parseOpenSky({ states }, 'AIR_DAC', 'u', NOW)[0].value).toBe(1);
  });
  it('AIS aggregator: counts slow, recently heard vessels', () => {
    const a = new AisAggregator();
    a.update(1, 0.1, NOW - 60_000); a.update(2, 9, NOW - 60_000); a.update(3, 0.2, NOW - 3_600_000);
    expect(a.snapshot(NOW).value).toBe(1);
  });
  it('events: HIGH and ACTIVE counts as high-verified', () => {
    const out = signalsFromEvents([{ node: 'CTG_PORT', status: 'ACTIVE', severity: 'HIGH' }, { node: 'CTG_PORT', status: 'ENDED', severity: 'HIGH' }], ['CTG_PORT'], NOW);
    expect(out.find((s) => s.metric === 'news.high_verified_events')?.value).toBe(1);
    expect(out.find((s) => s.metric === 'news.active_events')?.value).toBe(1);
  });
});
