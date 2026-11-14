// DAT-4 Likely Now Score, DAT-5 rarity tiers, spawn weights. Pure functions.
import type { Species, Habitat, Region } from '../data/types';
import { SPECIES } from '../data/species';
import { sunTimes, dayPhase, DayPhase } from './sun';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mega' | 'legendary';

export const RARITY_META: Record<Rarity, { label: string; glyph: string; color: string; mult: number }> = {
  common: { label: 'Common', glyph: '●', color: 'var(--ash)', mult: 1 },
  uncommon: { label: 'Uncommon', glyph: '◆', color: 'var(--moss)', mult: 1.5 },
  rare: { label: 'Rare', glyph: '★', color: 'var(--river)', mult: 2.5 },
  mega: { label: 'Mega', glyph: '✦', color: 'var(--violet-text)', mult: 5 },
  legendary: { label: 'Legendary', glyph: '♛', color: 'var(--sun)', mult: 10 },
};

export interface Conditions { weather?: 'clear' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm'; tempC?: number }

export function regionSpecies(region: string): Species[] {
  return SPECIES.filter((s) => s.occ[region]);
}

function month(d: Date, south: boolean) {
  const m = d.getMonth(); // 0–11
  return south ? (m + 6) % 12 : m;
}

/** Seasonal presence 0–1 for a season code in the (hemisphere-adjusted) month. */
export function seasonalIndex(season: string, d: Date, south: boolean): number {
  const m = month(d, south);
  switch (season) {
    case 'R': return 1;
    case 'S': return [0.1, 0.1, 0.35, 0.8, 1, 1, 1, 1, 0.85, 0.5, 0.15, 0.1][m];
    case 'W': return [1, 1, 0.8, 0.35, 0.05, 0.02, 0.02, 0.05, 0.2, 0.6, 0.9, 1][m];
    case 'M': return [0.05, 0.05, 0.3, 0.9, 1, 0.3, 0.1, 0.3, 0.9, 0.8, 0.3, 0.05][m];
  }
  return 0.5;
}

export function timeOfDayFit(activity: Species['activity'], phase: DayPhase): number {
  const table: Record<Species['activity'], Record<DayPhase, number>> = {
    diurnal: { night: 0.02, dawn: 0.9, morning: 1, day: 0.7, golden: 0.85, dusk: 0.4 },
    crepuscular: { night: 0.3, dawn: 1, morning: 0.8, day: 0.5, golden: 0.9, dusk: 1 },
    nocturnal: { night: 1, dawn: 0.6, morning: 0.05, day: 0.02, golden: 0.2, dusk: 0.9 },
  };
  return table[activity][phase];
}

export function weatherFit(sp: Species, c?: Conditions): number {
  if (!c?.weather) return 0.7;
  if (c.weather === 'storm') return 0.3;
  if (c.weather === 'rain') return sp.habitats.includes('water') ? 0.8 : 0.5;
  if (c.weather === 'snow') return sp.occ && sp.archetype !== 'hummingbird' ? 0.6 : 0.2;
  return 0.9;
}

export function lns(sp: Species, region: Region, d: Date, habitat: Habitat, c?: Conditions): number {
  const o = sp.occ[region.code];
  if (!o) return 0;
  const [freq, season] = o;
  const si = seasonalIndex(season, d, region.south);
  const phase = dayPhase(d, sunTimes(d, region.lat, region.lng));
  const v = 0.4 * freq * si + 0.25 * si + 0.15 * timeOfDayFit(sp.activity, phase)
    + 0.1 * (sp.habitats.includes(habitat) ? 1 : 0.3) + 0.1 * weatherFit(sp, c);
  return Math.max(0, Math.min(1, v));
}

export function rarityOf(score: number): Rarity {
  const r = 1 - score;
  if (r < 0.25) return 'common';
  if (r < 0.5) return 'uncommon';
  if (r < 0.75) return 'rare';
  if (r < 0.95) return 'mega';
  return 'legendary';
}

export function spawnWeight(score: number, irruption = false): number {
  const w = Math.pow(Math.max(0.02, Math.min(1, score)), 1.5) * 100;
  return irruption ? w * 3 : w;
}

export interface Likely { sp: Species; score: number; rarity: Rarity }

export function likelyNow(region: Region, d: Date, habitat: Habitat, c?: Conditions): Likely[] {
  return regionSpecies(region.code)
    .map((sp) => { const score = lns(sp, region, d, habitat, c); return { sp, score, rarity: rarityOf(score) }; })
    .sort((a, b) => b.score - a.score || a.sp.id.localeCompare(b.sp.id));
}

/** DAT-6: highest-LNS species, active now, readable at 32px. */
export function starterBird(region: Region, d: Date, habitat: Habitat): Species {
  const list = likelyNow(region, d, habitat).filter(({ sp }) =>
    sp.occ[region.code]?.[2] && sp.archetype !== 'hummingbird' && sp.activity !== 'nocturnal' && !sp.sensitive);
  return (list[0] ?? likelyNow(region, d, habitat)[0]).sp;
}

/** Deterministic weighted pick with a supplied 0–1 roll. */
export function weightedPick<T>(items: T[], weight: (t: T) => number, roll: number): T {
  const total = items.reduce((a, t) => a + weight(t), 0);
  let r = roll * total;
  for (const t of items) { r -= weight(t); if (r <= 0) return t; }
  return items[items.length - 1];
}
