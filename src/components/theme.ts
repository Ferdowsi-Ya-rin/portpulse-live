import type { Status } from '../lib/types';

export type ThemeName = 'day' | 'night';

export interface Palette {
  bg: string; panel: string; ink: string; mute: string; line: string; channel: string;
  ok: string; stale: string; alert: string; none: string; gridOpacity: number;
}

/** Nautical charts have a day and a night palette. So does this. */
export const PALETTES: Record<ThemeName, Palette> = {
  day: {
    bg: '#EEF3F2', panel: '#FFFFFF', ink: '#10263A', mute: '#4B6272', line: '#10263A', channel: '#CFE3E0',
    ok: '#1B756F', stale: '#8F5A00', alert: '#B0206E', none: '#566878', gridOpacity: 0.07,
  },
  night: {
    bg: '#0A1822', panel: '#0F2230', ink: '#E3EEF2', mute: '#9AB1BF', line: '#8FB3C6', channel: '#123242',
    ok: '#3FD9B8', stale: '#F5B94A', alert: '#FF5CA8', none: '#7E97A8', gridOpacity: 0.09,
  },
};

export const statusColor = (p: Palette, s: Status): string =>
  ({ NO_DATA: p.none, STALE: p.stale, OK: p.ok, ALERT: p.alert }[s]);
