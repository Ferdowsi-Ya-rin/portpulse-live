import { describe, expect, it } from 'vitest';
import { alignHourly, crossCorrelation, cusum, ewmaZ, induceRules, wilson, type Episode } from '../src/lib/analysis';

// TEST FIXTURES ONLY: made-up numbers that exist to check the maths. They are never shown in the app.
const flat = (n: number, v = 10) => Array.from({ length: n }, (_, i) => v + (i % 2 ? 0.1 : -0.1));

describe('ewmaZ', () => {
  it('refuses to judge with too little history', () => {
    expect(ewmaZ([1, 2, 3]).state).toBe('INSUFFICIENT');
  });
  it('flags a large jump', () => {
    const r = ewmaZ([...flat(40), 25]);
    expect(r.state).toBe('OK');
    if (r.state === 'OK') expect(r.z).toBeGreaterThan(3);
  });
  it('does not flag ordinary noise', () => {
    const r = ewmaZ(flat(41));
    if (r.state === 'OK') expect(Math.abs(r.z)).toBeLessThan(3);
  });
});

describe('cusum', () => {
  it('detects a sustained upward shift', () => {
    const r = cusum([...flat(30), ...flat(30, 14)]);
    expect(r.state).toBe('OK');
    if (r.state === 'OK') { expect(r.shift).toBe('up'); expect(r.ongoing).toBe(true); }
  });
  it('reports none for a stable series', () => {
    const r = cusum(flat(60));
    if (r.state === 'OK') expect(r.shift).toBe('none');
  });
});

describe('crossCorrelation', () => {
  it('finds the lag between a series and a delayed copy', () => {
    const a = Array.from({ length: 120 }, (_, i) => Math.sin(i / 5) + (i % 7) * 0.01);
    const b = a.map((_, i) => (i >= 3 ? a[i - 3] : 0));
    const r = crossCorrelation(a, b, 10, 30);
    expect(r.state).toBe('OK');
    if (r.state === 'OK') { expect(r.lag).toBe(3); expect(r.significant).toBe(true); }
  });
  it('needs enough points', () => {
    expect(crossCorrelation([1, 2, 3], [1, 2, 3]).state).toBe('INSUFFICIENT');
  });
});

describe('alignHourly', () => {
  it('keeps only hours present in both series', () => {
    const H = 3_600_000;
    const out = alignHourly([{ ts: 0, value: 1 }, { ts: H, value: 2 }], [{ ts: H, value: 5 }, { ts: 2 * H, value: 6 }]);
    expect(out.hours).toEqual([1]);
    expect(out.a).toEqual([2]);
    expect(out.b).toEqual([5]);
  });
});

describe('wilson', () => {
  it('gives a wide interval for small samples', () => {
    const w = wilson(3, 3);
    expect(w.lower).toBeLessThan(0.5);
    expect(w.upper).toBeCloseTo(1, 5);
  });
});

describe('induceRules', () => {
  it('says insufficient with few episodes', () => {
    expect(induceRules([{ flags: ['a'], outcome: true }]).state).toBe('INSUFFICIENT');
  });
  it('reports a strong pattern and refuses a weak one', () => {
    const eps: Episode[] = [];
    for (let i = 0; i < 8; i++) eps.push({ flags: ['storm'], outcome: true });
    for (let i = 0; i < 12; i++) eps.push({ flags: ['calm'], outcome: false });
    eps.push({ flags: ['rare'], outcome: true });
    const r = induceRules(eps);
    expect(r.state).toBe('OK');
    if (r.state === 'OK') {
      expect(r.rules.some((x) => x.antecedent.join() === 'storm')).toBe(true);
      expect(r.rules.some((x) => x.antecedent.join() === 'rare')).toBe(false);
      expect(r.blocked).toBeGreaterThan(0);
    }
  });
});
