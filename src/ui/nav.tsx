import { createContext, useContext } from 'react';
import type { Shot } from '../app/photo';
import type { CatchMode } from '../core/xp';
import type { FieldcraftScore } from '../core/pixel/extract';

export type Tab = 'field' | 'journal' | 'map' | 'habitat' | 'you';

export interface CaptureJob {
  mode: CatchMode;
  shot: Shot;
  paletteRgba?: Uint8ClampedArray; // Window Mode: clean plate for palette extraction
  knownSpecies?: string;          // Window Mode: the game spawned this bird, so it knows what it is
  scoreOverride?: Partial<FieldcraftScore>;
  returnTo?: 'window' | 'viewfinder' | 'journal';
  sit?: boolean;
}

export type Route =
  | { name: 'species'; id: string; sightingId?: string }
  | { name: 'spread'; sightingId: string }
  | { name: 'viewfinder' }
  | { name: 'window'; sit?: boolean; starter?: boolean }
  | { name: 'catch'; job: CaptureJob }
  | { name: 'sketch' }
  | { name: 'badges' }
  | { name: 'challenges' }
  | { name: 'settings' }
  | { name: 'year' }
  | { name: 'lab' }
  | { name: 'debug' };

export interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  open: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
  closeAll: () => void;
  toast: (t: string) => void;
  highlight: string | null;
  setHighlight: (id: string | null) => void;
  stack: Route[];
}

export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);
