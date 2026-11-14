// GAM-4: 24 v1 badges across six categories. Pure progress functions over state.
import type { GameState, Sighting } from './model';
import { speciesById } from '../data/provider';
import { getRegion } from '../data/geo';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
export const TIER_FEATHERS: Record<Tier, number> = { bronze: 25, silver: 50, gold: 100, platinum: 200 };

export interface Badge {
  id: string; name: string; category: 'Firsts' | 'Taxonomy' | 'Place' | 'Craft' | 'Time' | 'Dedication';
  tier: Tier; desc: string; goal: number; progress: (s: GameState) => number; icon?: string;
}

const verified = (s: GameState) => s.sightings.filter((x) => x.speciesId && x.verification !== 'unverified' && x.verification !== 'vagrant');
const speciesSet = (list: Sighting[]) => new Set(list.map((x) => x.speciesId!));
const countWhere = (s: GameState, pred: (sp: NonNullable<ReturnType<typeof speciesById>>) => boolean) =>
  [...speciesSet(verified(s))].filter((id) => { const sp = speciesById(id); return !!sp && pred(sp); }).length;
const photos = (s: GameState) => s.sightings.filter((x) => x.mode === 'field' && x.fieldcraft);
const RAPTOR_FAMILIES = ['Accipitridae', 'Falconidae', 'Pandionidae', 'Cathartidae'];
const WARBLER_FAMILIES = ['Parulidae', 'Phylloscopidae', 'Sylviidae', 'Acrocephalidae', 'Cettiidae'];

function seasonOf(iso: string, south: boolean) {
  const m = new Date(iso).getMonth();
  const n = Math.floor(((m + 1) % 12) / 3); // 0 winter (DJF) … 3 autumn
  return south ? (n + 2) % 4 : n;
}

const ICONS: Record<string, string> = {"first-light": "druidtoken", "ten": "clover", "fifty": "crown", "century": "dragonheart", "corvid-crew": "seer", "raptor-club": "phoenix", "shorebird-society": "nestpearl", "warbler-wave": "sparkwand", "local-patch": "backpack", "county-line": "fleetboots", "state-bird": "aegis", "far-afield": "windboots", "steady-hands": "focus", "sharp-eye": "precision", "perfect-frame": "mirror", "portfolio": "book", "dawn-chorus": "emberheart", "golden-hour": "sunorb", "night-shift": "lantern", "four-seasons": "stormorb", "week-one": "horseshoe", "month-strong": "tempered", "seasoned": "tower", "year-of-birds": "worldbreaker"};

export const BADGES: Badge[] = [
  { id: 'first-light', name: 'First Light', category: 'Firsts', tier: 'bronze', desc: 'File your first catch', goal: 1, progress: (s) => s.sightings.length },
  { id: 'ten', name: 'Ten', category: 'Firsts', tier: 'silver', desc: '10 species', goal: 10, progress: (s) => speciesSet(verified(s)).size },
  { id: 'fifty', name: 'Fifty', category: 'Firsts', tier: 'gold', desc: '50 species', goal: 50, progress: (s) => speciesSet(verified(s)).size },
  { id: 'century', name: 'Century', category: 'Firsts', tier: 'platinum', desc: '100 species', goal: 100, progress: (s) => speciesSet(verified(s)).size },

  { id: 'corvid-crew', name: 'Corvid Crew', category: 'Taxonomy', tier: 'bronze', desc: '5 crows, jays or magpies', goal: 5, progress: (s) => countWhere(s, (sp) => sp.family === 'Corvidae') },
  { id: 'raptor-club', name: 'Raptor Club', category: 'Taxonomy', tier: 'silver', desc: '6 hawks, eagles, kites or falcons', goal: 6, progress: (s) => countWhere(s, (sp) => RAPTOR_FAMILIES.includes(sp.family)) },
  { id: 'shorebird-society', name: 'Shorebird Society', category: 'Taxonomy', tier: 'silver', desc: '8 shorebirds, gulls or terns', goal: 8, progress: (s) => countWhere(s, (sp) => sp.order === 'Charadriiformes') },
  { id: 'warbler-wave', name: 'Warbler Wave', category: 'Taxonomy', tier: 'gold', desc: '10 warblers', goal: 10, progress: (s) => countWhere(s, (sp) => WARBLER_FAMILIES.includes(sp.family)) },

  { id: 'local-patch', name: 'Local Patch', category: 'Place', tier: 'bronze', desc: '20 catches at your home patch', goal: 20, progress: (s) => s.sightings.filter((x) => x.region === s.region && x.habitat === s.habitat).length },
  { id: 'county-line', name: 'County Line', category: 'Place', tier: 'silver', desc: 'Catch in all 3 habitat types', goal: 3, progress: (s) => new Set(s.sightings.map((x) => x.habitat)).size },
  { id: 'state-bird', name: 'State Bird', category: 'Place', tier: 'gold', desc: 'Your state, provincial or national bird (curated regions)', goal: 1,
    progress: (s) => { const e = getRegion(s.region)?.emblem; return e && verified(s).some((x) => x.speciesId === e) ? 1 : 0; } },
  { id: 'far-afield', name: 'Far Afield', category: 'Place', tier: 'silver', desc: 'Catch in a second region', goal: 2, progress: (s) => new Set(s.sightings.map((x) => x.region)).size },

  { id: 'steady-hands', name: 'Steady Hands', category: 'Craft', tier: 'bronze', desc: 'A photo scoring 80+', goal: 1, progress: (s) => (photos(s).some((x) => x.fieldcraft!.total >= 80) ? 1 : 0) },
  { id: 'sharp-eye', name: 'Sharp Eye', category: 'Craft', tier: 'silver', desc: 'A photo scoring 90+', goal: 1, progress: (s) => (photos(s).some((x) => x.fieldcraft!.total >= 90) ? 1 : 0) },
  { id: 'perfect-frame', name: 'Perfect Frame', category: 'Craft', tier: 'gold', desc: 'A photo scoring 95+', goal: 1, progress: (s) => (photos(s).some((x) => x.fieldcraft!.total >= 95) ? 1 : 0) },
  { id: 'portfolio', name: 'Portfolio', category: 'Craft', tier: 'gold', desc: 'Ten photos at 80+', goal: 10, progress: (s) => photos(s).filter((x) => x.fieldcraft!.total >= 80).length },

  { id: 'dawn-chorus', name: 'Dawn Chorus', category: 'Time', tier: 'silver', desc: '5 catches before 07:00', goal: 5, progress: (s) => s.sightings.filter((x) => x.hour < 7).length },
  { id: 'golden-hour', name: 'Golden Hour', category: 'Time', tier: 'bronze', desc: 'A catch in the hour before sunset', goal: 1, progress: (s) => (s.sightings.some((x) => x.phase === 'golden') ? 1 : 0) },
  { id: 'night-shift', name: 'Night Shift', category: 'Time', tier: 'gold', desc: 'An owl after dark', goal: 1,
    progress: (s) => (s.sightings.some((x) => x.speciesId && speciesById(x.speciesId)?.archetype === 'owl' && (x.phase === 'night' || x.phase === 'dusk')) ? 1 : 0) },
  { id: 'four-seasons', name: 'Four Seasons', category: 'Time', tier: 'platinum', desc: 'Catches in all four seasons', goal: 4,
    progress: (s) => new Set(s.sightings.map((x) => seasonOf(x.capturedAt, !!getRegion(x.region)?.south))).size },

  { id: 'week-one', name: 'Week One', category: 'Dedication', tier: 'bronze', desc: '7-day streak', goal: 7, progress: (s) => s.streak.best },
  { id: 'month-strong', name: 'Month Strong', category: 'Dedication', tier: 'silver', desc: '30-day streak', goal: 30, progress: (s) => s.streak.best },
  { id: 'seasoned', name: 'Seasoned', category: 'Dedication', tier: 'gold', desc: '100-day streak', goal: 100, progress: (s) => s.streak.best },
  { id: 'year-of-birds', name: 'Year of Birds', category: 'Dedication', tier: 'platinum', desc: '365-day streak', goal: 365, progress: (s) => s.streak.best },
];

for (const b of BADGES) b.icon = ICONS[b.id];

export function newlyEarned(s: GameState): Badge[] {
  return BADGES.filter((b) => !s.badges[b.id] && b.progress(s) >= b.goal);
}
