// Game state: one local store, persisted to IndexedDB on every change.
import { useSyncExternalStore } from 'react';
import type { GameState, Sighting, Verification, ChallengeSlot } from '../core/model';
import { UNKNOWN } from '../core/model';
import type { Habitat, Species } from '../data/types';
import { SPECIES_BY_ID } from '../data/species';
import { REGION_BY_CODE, defaultRegionFromLocale } from '../data/regions';
import { assembleSprite, PhotoPalette, PIPELINE_VERSION } from '../core/pixel/sprite';
import type { Analysis } from '../core/pixel/extract';
import { lns, rarityOf, Rarity } from '../core/rarity';
import { catchXp, applyStreak, dayKey, rankFor, CatchMode } from '../core/xp';
import { BADGES, newlyEarned, TIER_FEATHERS, Badge } from '../core/badges';
import { pickDaily, pickWeekly, pickSeasonal, weekKey, challengeProgress, CHALLENGE_BY_ID } from '../core/challenges';
import { sunTimes, dayPhase } from '../core/sun';
import { deltaE2000 } from '../core/color';
import { PAL_LAB } from '../core/color';
import { P } from '../core/pixel/archetypes';
import { loadState, saveState, putPhoto, getPhoto, photoKeys, deletePhoto as dbDeletePhoto, forgetPhotoURL } from './db';

const VERSION = 1;

export function freshState(): GameState {
  const now = new Date().toISOString();
  return {
    version: VERSION, createdAt: now, onboarded: false, region: defaultRegionFromLocale(), habitat: 'urban',
    xp: 0, feathers: 0, streak: { days: 0, last: null, freezes: 0, best: 0 }, sightings: [], badges: {},
    challenges: { day: '', daily: [], week: '', weekly: null, seasonal: null, history: {} },
    events: { sitSpots: [], shares: [] },
    diorama: { biome: 'urban', birds: [], decor: {} }, ownedDecor: [],
    settings: { sound: true, haptics: true, grid: true, motion: 'system', dyslexiaFont: false, refPhotos: true },
    sessions: 0, lastSession: null, backupPromptAfter: null, firstCatchSeconds: null, installStartedAt: now, log: [],
  };
}

let state: GameState = freshState();
let ready = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() { listeners.forEach((l) => l()); }
// Saving waits until the saved journal has been read, so a slow or stuck IndexedDB
// can never overwrite a real journal with a fresh one.
let loadSettled = false;
function persist() {
  if (!loadSettled) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveState(state).catch(() => {}); }, 120);
}

export function getState() { return state; }
export function setState(fn: (s: GameState) => GameState) { state = fn(state); emit(); persist(); }
export function useGame<T>(sel: (s: GameState) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state));
}
export const isReady = () => ready;

export function logEvent(e: string, d?: unknown) {
  state = { ...state, log: [...state.log.slice(-199), { t: new Date().toISOString(), e, d }] };
  persist();
}

function adopt(saved: GameState | undefined) {
  if (saved && saved.version) state = { ...freshState(), ...saved, settings: { ...freshState().settings, ...saved.settings } };
}

export async function initStore() {
  // Some browsers (older iOS Safari, in-app webviews, private modes) never answer IndexedDB.
  // Never block the first paint on it: start after 1.5s with an in-memory journal if needed.
  const load = loadState<GameState>().then((v) => ({ ok: true as const, v }), () => ({ ok: false as const, v: undefined }));
  const first = await Promise.race([load, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
  if (first) { adopt(first.v); loadSettled = true; }
  else {
    load.then((res) => {
      // Late answer: adopt the saved journal unless the player already caught something this session.
      if (res.v && res.v.version && state.sightings.length === 0) { adopt(res.v); emit(); }
      loadSettled = true; persist();
    });
  }
  const today = dayKey(new Date());
  if (state.lastSession !== today || state.sessions === 0) state = { ...state, sessions: state.sessions + 1, lastSession: today };
  refreshChallenges(new Date(), false);
  ready = true;
  emit(); persist();
  try { if (state.sightings.length && navigator.storage?.persist) navigator.storage.persist(); } catch { /* ignore */ }
}

export function refreshChallenges(now: Date, notify = true) {
  const today = dayKey(now), week = weekKey(now);
  let c = state.challenges;
  if (c.day !== today) {
    const daily = pickDaily(state, today);
    const history = Object.fromEntries(Object.entries(c.history).filter(([d]) => d >= dayKey(new Date(now.getTime() - 14 * 864e5))));
    history[today] = daily.map((d) => d.id);
    c = { ...c, day: today, daily, history };
  }
  if (c.week !== week) c = { ...c, week, weekly: pickWeekly(state, week) };
  const seasonal = pickSeasonal(state.region, now);
  if (seasonal?.id !== c.seasonal?.id) c = { ...c, seasonal };
  if (c !== state.challenges) { state = { ...state, challenges: c }; if (notify) { emit(); persist(); } }
}

// ─── catches ───

export interface CatchInput {
  speciesId: string | null;
  verification: Verification;
  mode: CatchMode;
  habitat: Habitat;
  analysis: Pick<Analysis, 'palette' | 'score' | 'hash'> | null;
  photo: Blob | null;
  at?: Date;
}

export interface CatchResult {
  sighting: Sighting;
  species: Species;
  badges: Badge[];
  rankUp: string | null;
  previousXp: number;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

const PHOTO_PARTS = [P.BODY, P.BELLY, P.WING, P.HEAD, P.CROWN, P.TAIL];
function meanDeltaE(a: number[], b: number[]): number {
  return PHOTO_PARTS.reduce((s, p) => s + deltaE2000(PAL_LAB[a[p]], PAL_LAB[b[p]]), 0) / PHOTO_PARTS.length;
}

export function speciesOf(s: Sighting): Species {
  return (s.speciesId && SPECIES_BY_ID[s.speciesId]) || UNKNOWN;
}

/** Counts toward completion: verified or self-reported, not vagrant-pending or unverified. */
export const counts = (x: Sighting) => !!x.speciesId && (x.verification === 'verified' || x.verification === 'self-reported');

export function plumagesOf(st: GameState, speciesId: string): Sighting[] {
  return st.sightings.filter((x) => x.speciesId === speciesId && (x.firstRecord || x.newPlumage));
}

export async function fileCatch(input: CatchInput): Promise<CatchResult> {
  const at = input.at ?? new Date();
  const region = REGION_BY_CODE[state.region];
  const sp = (input.speciesId && SPECIES_BY_ID[input.speciesId]) || UNKNOWN;
  const hash = input.analysis?.hash ?? fakeHash(`${sp.id}|${at.toISOString()}`);
  const palette: PhotoPalette | null = input.analysis?.palette ?? null;
  const sprite = assembleSprite(sp, palette, hash);

  const prior = input.speciesId ? state.sightings.filter((x) => x.speciesId === input.speciesId) : [];
  const firstRecord = !!input.speciesId && prior.length === 0;
  const regionFirst = !!input.speciesId && !prior.some((x) => x.region === state.region);
  const plumages = input.speciesId ? plumagesOf(state, input.speciesId) : [];
  const newPlumage = !firstRecord && plumages.length > 0 && plumages.length < 4 &&
    plumages.every((p) => meanDeltaE(p.sprite.parts, sprite.parts) > 10);

  const score = input.speciesId ? lns(sp, region, at, input.habitat) : 0.9;
  const rarity: Rarity = rarityOf(score);
  const fc = input.analysis?.score ?? null;
  const streakBefore = state.streak;
  const streak = applyStreak(streakBefore, dayKey(at));
  const xp = catchXp({
    newSpecies: firstRecord && input.verification !== 'vagrant', regionFirst, fieldcraft: fc?.total ?? 0,
    rarity, streakDays: streak.days, mode: input.mode,
  });
  const feathers = firstRecord ? 5 : 12 + (newPlumage ? 20 : 0);

  const id = uuid();
  let photoId: string | null = null;
  if (input.photo) { try { await putPhoto(id, input.photo); photoId = id; } catch { photoId = null; } }

  const phase = dayPhase(at, sunTimes(at, region.lat, region.lng));
  const sighting: Sighting = {
    id, speciesId: input.speciesId, region: state.region, habitat: input.habitat,
    capturedAt: at.toISOString(), day: dayKey(at), hour: at.getHours(), phase, mode: input.mode,
    verification: input.verification,
    fieldcraft: fc ? { total: fc.total, sharpness: fc.sharpness, exposure: fc.exposure, size: fc.size, framing: fc.framing, separation: fc.separation } : null,
    coaching: fc?.coaching ?? [], rarity, xp, feathers, sprite, palette, photoId, firstRecord, newPlumage,
    timesSeen: prior.length + 1, note: '',
  };

  const previousXp = state.xp;
  const rankBefore = rankFor(previousXp).name;
  let next: GameState = {
    ...state, sightings: [sighting, ...state.sightings], xp: state.xp + xp, feathers: state.feathers + feathers, streak,
  };
  if (state.firstCatchSeconds === null) {
    next.firstCatchSeconds = Math.round((at.getTime() - new Date(state.installStartedAt).getTime()) / 1000);
    next.backupPromptAfter = new Date().toISOString();
  }
  // auto-place the first few birds in the diorama so the habitat is never empty
  if (input.speciesId && next.diorama.birds.length < 3 && firstRecord) next.diorama = { ...next.diorama, birds: [...next.diorama.birds, id] };
  const earned = newlyEarned(next);
  if (earned.length) {
    const badges = { ...next.badges };
    let bonus = 0;
    for (const b of earned) { badges[b.id] = at.toISOString(); bonus += TIER_FEATHERS[b.tier]; }
    next = { ...next, badges, feathers: next.feathers + bonus };
  }
  state = next;
  logEvent('catch_success', { mode: input.mode, species: input.speciesId, verification: input.verification, fc: fc?.total });
  if (sighting.firstRecord && state.sightings.length === 1) logEvent('first_catch_seconds', state.firstCatchSeconds);
  emit(); persist();
  const rankAfter = rankFor(state.xp).name;
  return { sighting, species: sp, badges: earned, rankUp: rankAfter !== rankBefore ? rankAfter : null, previousXp };
}

function fakeHash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + 'ffff0000';
}

/** Identify an unverified catch later (or confirm a vagrant): re-inks the sprite with the new anatomy. */
export function identifySighting(id: string, speciesId: string, verification: Verification) {
  setState((s) => ({
    ...s,
    sightings: s.sightings.map((x) => {
      if (x.id !== id) return x;
      const sp = SPECIES_BY_ID[speciesId];
      const first = !s.sightings.some((y) => y.id !== id && y.speciesId === speciesId);
      return { ...x, speciesId, verification, firstRecord: first, sprite: assembleSprite(sp, x.palette, x.sprite.hash) };
    }),
  }));
}

export function updateNote(id: string, note: string) {
  setState((s) => ({ ...s, sightings: s.sightings.map((x) => (x.id === id ? { ...x, note: note.slice(0, 280) } : x)) }));
}

export async function deletePhotoKeepSprite(id: string) {
  await dbDeletePhoto(id).catch(() => {});
  forgetPhotoURL(id);
  setState((s) => ({ ...s, sightings: s.sightings.map((x) => (x.id === id ? { ...x, photoId: null } : x)) }));
}

export function deleteSighting(id: string) {
  dbDeletePhoto(id).catch(() => {});
  forgetPhotoURL(id);
  setState((s) => ({
    ...s, sightings: s.sightings.filter((x) => x.id !== id),
    diorama: { ...s.diorama, birds: s.diorama.birds.filter((b) => b !== id) },
  }));
}

// ─── challenges, habitat, settings ───

export function claimChallenge(slot: ChallengeSlot) {
  const now = new Date();
  const { done, def } = challengeProgress(state, slot, now);
  if (!done || slot.claimed) return 0;
  const mark = (x: ChallengeSlot | null) => (x && x.id === slot.id && x.param === slot.param ? { ...x, claimed: true } : x);
  setState((s) => ({
    ...s, xp: s.xp + def.xp, feathers: s.feathers + Math.round(def.xp / 10),
    challenges: { ...s.challenges, daily: s.challenges.daily.map((d) => mark(d)!), weekly: mark(s.challenges.weekly), seasonal: mark(s.challenges.seasonal) },
  }));
  logEvent('challenge_claim', slot.id);
  return def.xp;
}

export function recordSitSpot() { setState((s) => ({ ...s, events: { ...s.events, sitSpots: [...s.events.sitSpots.slice(-30), dayKey(new Date())] } })); }
export function recordShare() { setState((s) => ({ ...s, events: { ...s.events, shares: [...s.events.shares.slice(-30), dayKey(new Date())] } })); logEvent('share_created'); }

export function toggleHabitatBird(id: string): boolean {
  const has = state.diorama.birds.includes(id);
  if (!has && state.diorama.birds.length >= 12) return false;
  setState((s) => ({ ...s, diorama: { ...s.diorama, birds: has ? s.diorama.birds.filter((b) => b !== id) : [...s.diorama.birds, id] } }));
  return true;
}

export function buyDecor(key: string, price: number): boolean {
  if (state.feathers < price || state.ownedDecor.includes(key)) return false;
  setState((s) => ({ ...s, feathers: s.feathers - price, ownedDecor: [...s.ownedDecor, key] }));
  return true;
}

export function placeDecor(slot: string, key: string | null) {
  setState((s) => {
    const decor = { ...s.diorama.decor };
    for (const k of Object.keys(decor)) if (decor[k] === key) delete decor[k];
    if (key) decor[slot] = key; else delete decor[slot];
    return { ...s, diorama: { ...s.diorama, decor } };
  });
}

export function setBiome(b: Habitat) { setState((s) => ({ ...s, diorama: { ...s.diorama, biome: b } })); }

export function speciesCount(s: GameState) { return new Set(s.sightings.filter(counts).map((x) => x.speciesId)).size; }

export function badgeById(id: string) { return BADGES.find((b) => b.id === id); }
export { CHALLENGE_BY_ID, PIPELINE_VERSION };

export async function exportBackup(includePhotos: boolean): Promise<Blob> {
  const photos: Record<string, string> = {};
  if (includePhotos) {
    for (const s of state.sightings) {
      if (!s.photoId) continue;
      const b = await getPhoto(s.photoId);
      if (b) photos[s.photoId] = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });
    }
  }
  return new Blob([JSON.stringify({ app: 'pixel-birder', version: VERSION, state, photos })], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data.app !== 'pixel-birder' || !data.state) throw new Error('That file is not a PIXEL BIRDER backup.');
  for (const [id, url] of Object.entries<string>(data.photos ?? {})) {
    const blob = await (await fetch(url)).blob();
    await putPhoto(id, blob);
  }
  state = { ...freshState(), ...data.state };
  emit(); persist();
  return state.sightings.length;
}

export async function resetAll() {
  for (const k of await photoKeys()) await dbDeletePhoto(String(k));
  state = freshState();
  emit(); await saveState(state);
}
