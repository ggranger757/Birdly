import type { SpriteRecord, PhotoPalette } from './pixel/sprite';
import type { FieldcraftScore } from './pixel/extract';
import type { Rarity } from './rarity';
import type { CatchMode, StreakState } from './xp';
import type { Habitat, Species } from '../data/types';

export type Verification = 'verified' | 'self-reported' | 'unverified' | 'vagrant';

export interface Sighting {
  id: string;
  speciesId: string | null;      // null while unverified
  region: string;
  habitat: Habitat;
  capturedAt: string;            // ISO
  day: string;                   // local YYYY-MM-DD
  hour: number;
  phase: string;                 // day phase at capture
  mode: CatchMode;
  verification: Verification;
  fieldcraft: Omit<FieldcraftScore, 'coaching' | 'tooDark'> | null;
  coaching: string[];
  rarity: Rarity;
  xp: number;
  feathers: number;
  sprite: SpriteRecord;
  palette: PhotoPalette | null;  // kept so the sprite can be re-inked if the bird is identified later
  photoId: string | null;        // key into the photo store; null once deleted
  firstRecord: boolean;
  newPlumage: boolean;
  timesSeen: number;
  note: string;
  analysisMs?: number;
}

export interface Settings {
  sound: boolean; haptics: boolean; grid: boolean;
  motion: 'system' | 'reduced' | 'full';
  dyslexiaFont: boolean; refPhotos: boolean;
}

export interface ChallengeSlot { id: string; param?: string | number; claimed: boolean }

export interface GameState {
  version: number;
  createdAt: string;
  onboarded: boolean;
  region: string;
  habitat: Habitat;
  xp: number;
  feathers: number;
  streak: StreakState;
  sightings: Sighting[];
  badges: Record<string, string>;       // id → earned ISO
  challenges: { day: string; daily: ChallengeSlot[]; week: string; weekly: ChallengeSlot | null; seasonal: ChallengeSlot | null; history: Record<string, string[]> };
  events: { sitSpots: string[]; shares: string[] };
  diorama: { biome: Habitat; birds: string[]; decor: Record<string, string> }; // decor: slot → item
  ownedDecor: string[];
  settings: Settings;
  sessions: number;
  lastSession: string | null;
  backupPromptAfter: string | null;
  firstCatchSeconds: number | null;
  installStartedAt: string;
  log: { t: string; e: string; d?: unknown }[]; // local analytics ring buffer (TEC-8), never leaves the device
}

export const UNKNOWN: Species = {
  id: '_unknown', common: 'Unidentified bird', sci: '', family: '', familyName: 'Unidentified', order: '',
  archetype: 'passerine', pattern: 'solid', habitats: ['urban', 'woodland', 'water'], sizeCm: 0,
  fact: 'Not every bird gives up its name on the first look. Identify it later from the journal.',
  activity: 'diurnal', occ: {},
  look: { head: 'ash', back: 'smoke', wing: 'smoke', belly: 'stone', beak: 'slate', legs: 'umber' },
};
