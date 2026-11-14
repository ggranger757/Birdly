// GAM-9 / GAM-10: layered pixel diorama on hand-painted parallax backgrounds.
// Each scene is a stack of PNG layers (back → front) at native resolution; we draw at an integer scale.
import type { Habitat, Species } from '../data/types';
import type { DayPhase } from '../core/sun';
import { HEX, IDX } from '../core/palette';
import { renderFrames } from '../core/pixel/sprite';
import { drawFrame, onTick } from '../ui/components';

const C = (n: keyof typeof IDX) => HEX[IDX[n]];

export interface SceneDef {
  id: string; label: string; layers: number; w: number; h: number;
  ground: number;                 // y where birds stand, in scene pixels
  water?: [number, number, number?, number?]; // y0, y1, x0, x1 of open water
  tint?: string;                  // phase grade laid over the scene
  props: ('branchL' | 'branchR' | 'wire' | 'feeder' | 'post')[];
}

export const SCENES: Record<string, SceneDef> = {
  skyline: { id: 'skyline', label: 'Smog skyline', layers: 8, w: 630, h: 320, ground: 298, props: ['branchL', 'wire', 'feeder'] },
  c2: { id: 'c2', label: 'High street', layers: 6, w: 480, h: 270, ground: 224, props: ['branchL', 'wire', 'feeder'] },
  c4: { id: 'c4', label: 'Old town square', layers: 7, w: 480, h: 270, ground: 222, props: ['branchL', 'wire', 'feeder'] },
  neoncity: { id: 'neoncity', label: 'Neon night', layers: 6, w: 1152, h: 216, ground: 194, props: ['branchL', 'wire', 'feeder'] },
  n1: { id: 'n1', label: 'Lone tree at sunrise', layers: 4, w: 576, h: 324, ground: 262, props: ['branchL', 'branchR'] },
  nfb: { id: 'nfb', label: 'Misty wood', layers: 6, w: 620, h: 300, ground: 262, props: ['branchL', 'branchR'] },
  pine: { id: 'pine', label: 'Pine forest', layers: 14, w: 640, h: 300, ground: 260, props: ['branchL', 'branchR'] },
  b3: { id: 'b3', label: 'Old-growth path', layers: 8, w: 480, h: 270, ground: 215, props: ['branchL', 'branchR'] },
  dusk: { id: 'dusk', label: 'Mountain dusk', layers: 6, w: 320, h: 240, ground: 230, props: ['branchL', 'branchR'] },
  nfa: { id: 'nfa', label: 'Night forest', layers: 6, w: 440, h: 240, ground: 197, props: ['branchL', 'branchR'] },
  n2: { id: 'n2', label: 'Glacier lake', layers: 4, w: 576, h: 324, ground: 290, water: [244, 312], props: ['branchL', 'post'] },
  valley: { id: 'valley', label: 'Valley pond', layers: 6, w: 768, h: 300, ground: 286, water: [246, 264, 350, 620], props: ['branchL', 'post'] },
  n3: { id: 'n3', label: 'Palm shore', layers: 4, w: 576, h: 324, ground: 312, water: [218, 280], props: ['branchL', 'post'] },
  v_tundra: { id: 'v_tundra', label: 'Tundra night', layers: 4, w: 384, h: 216, ground: 202, props: ['branchL', 'post'] },
};

const BY_PHASE: Record<Habitat, Record<DayPhase, [string, string?]>> = {
  urban: { dawn: ['skyline'], morning: ['c2'], day: ['c2'], golden: ['c4'], dusk: ['c4', 'rgba(60,20,70,0.28)'], night: ['neoncity'] },
  woodland: { dawn: ['n1'], morning: ['nfb'], day: ['pine'], golden: ['b3', 'rgba(255,170,60,0.14)'], dusk: ['dusk'], night: ['nfa'] },
  water: { dawn: ['n2', 'rgba(255,140,120,0.18)'], morning: ['valley'], day: ['n3'], golden: ['n3', 'rgba(255,150,40,0.18)'], dusk: ['n2', 'rgba(110,40,100,0.34)'], night: ['v_tundra', 'rgba(6,8,30,0.45)'] },
};

export function sceneFor(biome: Habitat, phase: DayPhase): SceneDef {
  const [id, tint] = BY_PHASE[biome][phase];
  return { ...SCENES[id], tint: tint ?? SCENES[id].tint };
}

// ─── loading ───
const imgCache = new Map<string, Promise<HTMLImageElement[]>>();
export function loadScene(s: SceneDef): Promise<HTMLImageElement[]> {
  if (!imgCache.has(s.id)) {
    imgCache.set(s.id, Promise.all(Array.from({ length: s.layers }, (_, i) => new Promise<HTMLImageElement>((res) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(im);
      im.src = `bg/${s.id}/${i}.png`;
    }))));
  }
  return imgCache.get(s.id)!;
}

/** Draw a scene's layers into a view window. `pan` shifts back layers for parallax. */
function paintLayers(g: CanvasRenderingContext2D, imgs: HTMLImageElement[], s: SceneDef, viewW: number, viewH: number, pan = 0, frontStatic = 2) {
  const top = s.h - viewH;
  const vx = Math.max(0, Math.floor((s.w - viewW) / 2));
  g.imageSmoothingEnabled = false;
  const n = imgs.length;
  imgs.forEach((im, k) => {
    if (!im.naturalWidth) return;
    const back = k < n - frontStatic;
    const off = back ? Math.round(pan * (1 - k / Math.max(1, n - frontStatic))) : 0;
    const y = s.h - im.naturalHeight - top;
    // tile horizontally (some layers are narrow strips)
    let x = -(((vx + off) % im.naturalWidth) + im.naturalWidth) % im.naturalWidth;
    for (; x < viewW; x += im.naturalWidth) g.drawImage(im, x, y);
  });
  if (s.tint) { g.fillStyle = s.tint; g.fillRect(0, 0, viewW, viewH); }
}

/** Static thumbnail of a scene (onboarding cards, Field hero). Draws at native pixels; scale with CSS. */
export async function paintSceneThumb(canvas: HTMLCanvasElement, biome: Habitat, phase: DayPhase, viewW: number, viewH: number) {
  const s = sceneFor(biome, phase);
  const imgs = await loadScene(s);
  canvas.width = viewW; canvas.height = Math.min(viewH, s.h);
  paintLayers(canvas.getContext('2d')!, imgs, s, viewW, canvas.height);
}

// ─── perches & props ───
export type PerchKind = 'perch' | 'ground' | 'water';
export interface Perch { x: number; y: number; kind: PerchKind }

export const DECOR_ITEMS: { key: string; name: string; price: number; hang?: boolean }[] = [
  { key: 'feeder', name: 'Seed feeder', price: 60, hang: true },
  { key: 'lantern', name: 'Paper lantern', price: 80, hang: true },
  { key: 'nestbox', name: 'Nest box', price: 90, hang: true },
  { key: 'bath', name: 'Bird bath', price: 70 },
  { key: 'flowers', name: 'Sunflowers', price: 60 },
  { key: 'bench', name: 'Bench', price: 110 },
  { key: 'stone', name: 'Mossy stone', price: 50 },
  { key: 'reeds', name: 'Reed clump', price: 50 },
];
export const DECOR_SLOTS = ['hang', 'left', 'mid', 'right'] as const;

interface Layout { perches: Perch[]; gy: number; branchL?: number; branchR?: number; wire?: number; feeder?: [number, number]; post?: [number, number]; slots: Record<string, [number, number]> }

function layout(s: SceneDef, W: number, H: number): Layout {
  const top = s.h - H;
  const vx = Math.max(0, Math.floor((s.w - W) / 2));
  const gy = Math.min(H - 2, s.ground - top);
  const P: Perch[] = [];
  const L: Layout = { perches: P, gy, slots: { hang: [Math.round(W * 0.66), Math.round(H * 0.16)], left: [Math.round(W * 0.13), gy], mid: [Math.round(W * 0.5), gy], right: [Math.round(W * 0.87), gy] } };
  if (s.props.includes('wire')) { L.wire = Math.round(H * 0.24); P.push({ x: Math.round(W * 0.52), y: L.wire, kind: 'perch' }, { x: Math.round(W * 0.8), y: L.wire, kind: 'perch' }); }
  if (s.props.includes('branchL')) { L.branchL = Math.round(H * 0.42); P.push({ x: Math.round(W * 0.27), y: L.branchL, kind: 'perch' }); }
  if (s.props.includes('branchR')) { L.branchR = Math.round(H * 0.6); P.push({ x: Math.round(W * 0.76), y: L.branchR, kind: 'perch' }); }
  if (s.props.includes('feeder')) { L.feeder = [Math.round(W * 0.74), Math.round(H * 0.56)]; P.push({ x: L.feeder[0], y: L.feeder[1], kind: 'perch' }); }
  if (s.props.includes('post')) {
    const base = s.water ? Math.min(gy, s.water[1] - top) : gy;
    L.post = [Math.round(W * 0.84), Math.round(base - Math.min(70, H * 0.3))];
    P.push({ x: L.post[0] + 1, y: L.post[1], kind: 'perch' });
  }
  if (s.water) {
    const [y0, y1, x0 = 0, x1 = s.w] = s.water;
    const wy = Math.round((y0 + y1) / 2) - top;
    for (const f of [0.22, 0.5, 0.68]) {
      const x = Math.round(W * f);
      if (x + vx > x0 + 10 && x + vx < x1 - 10 && wy > 30 && wy < H) P.push({ x, y: wy + Math.round((f - 0.5) * 10), kind: 'water' });
    }
  }
  if (gy < H) for (const f of [0.18, 0.46]) P.push({ x: Math.round(W * f), y: gy, kind: 'ground' });
  return L;
}

function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function disc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); g.fillRect(cx - w, cy + y, w * 2, 1); }
}

function paintProps(g: CanvasRenderingContext2D, L: Layout, W: number, H: number, night: boolean) {
  const bark = night ? C('umber') : C('bark'), dark = C('umber'), leaf = night ? C('pine') : C('fern'), leaf2 = night ? C('fern') : C('moss');
  if (L.wire !== undefined) {
    rect(g, Math.round(W * 0.36), L.wire - 30, 3, H, dark); rect(g, Math.round(W * 0.36) - 5, L.wire - 28, 13, 2, dark);
    for (let x = Math.round(W * 0.36); x < W; x++) rect(g, x, L.wire + Math.round(Math.sin((x / W) * Math.PI) * 2), 1, 1, C('ink'));
  }
  if (L.branchL !== undefined) {
    const y = L.branchL, len = Math.round(W * 0.42);
    rect(g, 0, y, len, 3, bark); rect(g, 0, y + 3, len - 4, 1, dark);
    rect(g, len - 10, y - 4, 2, 4, bark); rect(g, Math.round(len * 0.45), y - 6, 2, 6, bark);
    disc(g, 4, y - 6, 10, leaf); disc(g, 14, y - 3, 6, leaf2); disc(g, len - 6, y - 6, 4, leaf); disc(g, Math.round(len * 0.45), y - 9, 4, leaf2);
  }
  if (L.branchR !== undefined) {
    const y = L.branchR, x0 = Math.round(W * 0.6);
    rect(g, x0, y, W - x0, 3, bark); rect(g, x0 + 4, y + 3, W - x0, 1, dark);
    disc(g, W - 4, y - 5, 9, leaf); disc(g, x0 + 4, y - 4, 4, leaf2);
  }
  if (L.feeder) {
    const [x, y] = L.feeder;
    rect(g, x - 1, y, 2, L.gy - y, C('smoke')); rect(g, x - 10, y, 20, 2, C('rust')); rect(g, x - 10, y + 2, 20, 1, C('brick'));
    for (let i = -8; i < 8; i += 3) rect(g, x + i, y - 1, 1, 1, C('warbler'));
  }
  if (L.post) { const [x, y] = L.post; rect(g, x - 3, y, 7, H - y, dark); rect(g, x - 3, y, 7, 2, bark); rect(g, x - 2, y + 6, 1, H - y, bark); }
}

export function paintDecor(g: CanvasRenderingContext2D, key: string, x: number, y: number) {
  switch (key) {
    case 'feeder': rect(g, x, 0, 1, y, C('ink')); rect(g, x - 5, y, 11, 2, C('rust')); rect(g, x - 3, y + 2, 7, 9, C('ice')); rect(g, x - 2, y + 7, 5, 4, C('warbler')); rect(g, x - 6, y + 11, 13, 2, C('rust')); break;
    case 'lantern': rect(g, x, 0, 1, y, C('ink')); rect(g, x - 4, y, 9, 12, C('oriole')); rect(g, x - 3, y + 2, 7, 8, C('sun')); rect(g, x - 4, y + 5, 9, 1, C('rust')); break;
    case 'nestbox': rect(g, x, 0, 1, y, C('ink')); rect(g, x - 6, y, 13, 2, C('umber')); rect(g, x - 5, y + 2, 11, 14, C('bark')); disc(g, x, y + 7, 2, C('ink')); break;
    case 'bath': rect(g, x - 2, y - 10, 5, 10, C('stone')); rect(g, x - 8, y - 13, 17, 3, C('stone')); rect(g, x - 7, y - 13, 15, 1, C('sky')); break;
    case 'flowers': for (const dx of [-5, 0, 5]) { rect(g, x + dx, y - 16 + Math.abs(dx), 1, 16 - Math.abs(dx), C('fern')); disc(g, x + dx, y - 17 + Math.abs(dx), 2, C('sun')); rect(g, x + dx, y - 17 + Math.abs(dx), 1, 1, C('umber')); } break;
    case 'bench': rect(g, x - 12, y - 8, 24, 2, C('bark')); rect(g, x - 12, y - 13, 24, 2, C('bark')); rect(g, x - 10, y - 6, 2, 6, C('umber')); rect(g, x + 8, y - 6, 2, 6, C('umber')); break;
    case 'stone': disc(g, x, y - 3, 6, C('smoke')); rect(g, x - 6, y - 3, 12, 3, C('slate')); rect(g, x - 3, y - 8, 5, 2, C('moss')); break;
    case 'reeds': for (let i = -4; i <= 4; i += 2) rect(g, x + i, y - 14 - (i & 3), 1, 14 + (i & 3), C('olive')); rect(g, x - 2, y - 18, 2, 4, C('umber')); break;
  }
}

function paintWindowFrame(g: CanvasRenderingContext2D, W: number, H: number) {
  const f = '#12161B', d = '#07090B';
  rect(g, 0, 0, W, 4, f); rect(g, 0, 0, 4, H, f); rect(g, W - 4, 0, 4, H, f); rect(g, 0, H - 5, W, 5, f);
  rect(g, 4, 4, W - 8, 1, d); rect(g, 4, 4, 1, H - 9, d); rect(g, W - 5, 4, 1, H - 9, d); rect(g, 4, H - 6, W - 8, 1, '#2A333D');
  rect(g, 9, 9, 1, 7, 'rgba(214,238,242,0.7)'); rect(g, 11, 9, 1, 4, 'rgba(214,238,242,0.7)');
}

function perchFor(sp: Species): PerchKind[] {
  switch (sp.archetype) {
    case 'waterfowl': return ['water', 'ground'];
    case 'wader': return ['ground', 'water'];
    case 'gamebird': return ['ground'];
    case 'seabird': return ['water', 'ground', 'perch'];
    default: return ['perch', 'ground'];
  }
}

// ─── live scene ───
export interface Bird {
  key: string; sp: Species; frames: Uint8Array[]; perch: Perch;
  x: number; y: number; state: 'arriving' | 'perched' | 'leaving' | 'gone';
  t0: number; from: [number, number]; leaveAt: number; flip: boolean; settledAt: number; seed: number;
  blinkAt: number; actionAt: number;
}

export interface DioramaOpts { frame?: boolean; decor?: Record<string, string>; reduced?: boolean; viewW: number; viewH: number }

export class Diorama {
  private ctx: CanvasRenderingContext2D;
  private stop: (() => void) | null = null;
  private imgs: HTMLImageElement[] = [];
  private static_ = document.createElement('canvas'); // front layers + props + decor, cached
  readonly scene: SceneDef;
  readonly W: number; readonly H: number;
  private L: Layout;
  birds: Bird[] = [];
  onChange?: () => void;
  constructor(private canvas: HTMLCanvasElement, biome: Habitat, private phase: DayPhase, private opts: DioramaOpts) {
    this.scene = sceneFor(biome, phase);
    this.W = opts.viewW;
    this.H = Math.min(opts.viewH, this.scene.h);
    canvas.width = this.W; canvas.height = this.H;
    this.ctx = canvas.getContext('2d')!;
    this.L = layout(this.scene, this.W, this.H);
    loadScene(this.scene).then((imgs) => { this.imgs = imgs; this.bakeFront(); });
  }
  private bakeFront() {
    const c = this.static_; c.width = this.W; c.height = this.H;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // front two layers are static; props and decor sit on them
    const n = this.imgs.length;
    paintLayers(g, this.imgs.slice(Math.max(0, n - 2)), { ...this.scene, tint: undefined }, this.W, this.H, 0, 2);
    paintProps(g, this.L, this.W, this.H, this.phase === 'night');
    for (const [slot, key] of Object.entries(this.opts.decor ?? {})) {
      const at = this.L.slots[slot]; if (at) paintDecor(g, key, at[0], at[1]);
    }
  }
  start() {
    let last = 0;
    this.stop = onTick((t) => { if (t - last < 40) return; last = t; this.step(t); this.draw(t); });
  }
  dispose() { this.stop?.(); this.stop = null; }

  freePerches(sp: Species): Perch[] {
    const kinds = perchFor(sp);
    const taken = new Set(this.birds.filter((b) => b.state !== 'gone').map((b) => b.perch));
    for (const k of kinds) {
      const p = this.L.perches.filter((q) => q.kind === k && !taken.has(q));
      if (p.length) return p;
    }
    return this.L.perches.filter((q) => !taken.has(q) && q.kind !== 'water');
  }

  add(key: string, sp: Species, parts: number[], opts: { arrive?: boolean; stay?: number; seed?: number } = {}): Bird | null {
    const free = this.freePerches(sp);
    if (!free.length) return null;
    const seed = opts.seed ?? 0;
    const perch = free[seed % free.length];
    const now = performance.now();
    const fromLeft = (seed >> 3) % 2 === 0;
    const from: [number, number] = [fromLeft ? -40 : this.W + 8, Math.max(10, perch.y - 90)];
    const placed = opts.arrive === false;
    const b: Bird = {
      key, sp, frames: renderFrames(sp, parts), perch, x: placed ? perch.x : from[0], y: placed ? perch.y : from[1],
      state: placed ? 'perched' : 'arriving', t0: now, from, leaveAt: opts.stay ? now + opts.stay : Infinity,
      flip: placed ? seed % 2 === 1 : !fromLeft, settledAt: placed ? now : 0, seed,
      blinkAt: now + 2000 + (seed % 5000), actionAt: now + 4000 + (seed % 7000),
    };
    this.birds.push(b);
    this.onChange?.();
    return b;
  }

  leave(b: Bird) { if (b.state === 'gone' || b.state === 'leaving') return; b.state = 'leaving'; b.t0 = performance.now(); b.flip = b.perch.x < this.W / 2; this.onChange?.(); }

  private step(t: number) {
    let changed = false;
    for (const b of this.birds) {
      if (b.state === 'arriving') {
        const k = Math.min(1, (t - b.t0) / (this.opts.reduced ? 200 : 1800));
        const e = 1 - (1 - k) * (1 - k);
        b.x = b.from[0] + (b.perch.x - b.from[0]) * e;
        b.y = b.from[1] + (b.perch.y - b.from[1]) * e;
        if (k >= 1) { b.state = 'perched'; b.settledAt = t; changed = true; }
      } else if (b.state === 'perched' && t > b.leaveAt) { this.leave(b); changed = true; }
      else if (b.state === 'leaving') {
        const k = (t - b.t0) / 1500;
        b.x = b.perch.x + (b.flip ? -1 : 1) * k * 160;
        b.y = b.perch.y - k * k * 140;
        if (k >= 1) { b.state = 'gone'; changed = true; }
      }
    }
    if (changed) { this.birds = this.birds.filter((b) => b.state !== 'gone'); this.onChange?.(); }
  }

  frameFor(b: Bird, t: number): number {
    if (b.state !== 'perched') return 8 + (Math.floor(t / 83) % 6);
    if (this.opts.reduced) return 0;
    if (t > b.blinkAt) { if (t > b.blinkAt + 170) b.blinkAt = t + 4000 + ((b.seed * 7919 + t) % 3000); else return 4; }
    if (t > b.actionAt) {
      if (t < b.actionAt + 340) return b.seed % 3 === 0 ? 7 : 5 + (Math.floor(b.actionAt) % 2);
      b.actionAt = t + 5000 + ((b.seed * 104729 + t) % 7000);
    }
    return Math.floor((t + b.seed * 37) / 166) % 4;
  }

  spriteBox(b: Bird) { return { x: Math.round(b.x - 16), y: Math.round(b.y - 30) }; }

  /** Draw the background only (no birds) — used as the photo backdrop for palette sampling. */
  drawScene(g: CanvasRenderingContext2D, t: number) {
    const n = this.imgs.length;
    const pan = this.opts.reduced ? 0 : Math.sin((t / 40000) * Math.PI * 2) * 10;
    g.fillStyle = '#07090B'; g.fillRect(0, 0, this.W, this.H);
    if (n) {
      paintLayers(g, this.imgs.slice(0, Math.max(0, n - 2)), { ...this.scene, tint: undefined }, this.W, this.H, pan, 0);
      g.drawImage(this.static_, 0, 0);
    }
  }

  draw(t: number) {
    const g = this.ctx;
    g.imageSmoothingEnabled = false;
    this.drawScene(g, t);
    const sorted = this.birds.slice().sort((a, b) => a.y - b.y);
    for (const b of sorted) {
      const { x, y } = this.spriteBox(b);
      const f = b.frames[this.frameFor(b, t)];
      if (b.state === 'perched' && b.perch.kind === 'water') {
        g.save(); g.beginPath(); g.rect(x, y, 32, 27); g.clip();
        drawFrame(g, f, x, y, 1, b.flip); g.restore();
        g.fillStyle = 'rgba(214,238,242,0.8)'; g.fillRect(x + 6, y + 27, 20, 1); g.fillRect(x + 3, y + 28, 4, 1); g.fillRect(x + 25, y + 28, 4, 1);
      } else drawFrame(g, f, x, y, 1, b.flip);
    }
    if (this.scene.tint) { g.fillStyle = this.scene.tint; g.fillRect(0, 0, this.W, this.H); }
    if (this.opts.frame) paintWindowFrame(g, this.W, this.H);
  }

  hit(lx: number, ly: number): Bird | null {
    let best: Bird | null = null, bd = Infinity;
    for (const b of this.birds) {
      if (b.state === 'gone') continue;
      const d = Math.hypot(lx - b.x, ly - (b.y - 12));
      if (d < 26 && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** CAM-5 for Window Mode: the actual frame around the bird is the "photo". */
  snapshot(b: Bird, size = 64): HTMLCanvasElement {
    this.draw(performance.now());
    const out = document.createElement('canvas'); out.width = 512; out.height = 512;
    const g = out.getContext('2d')!; g.imageSmoothingEnabled = false;
    const sx = Math.max(0, Math.min(this.W - size, Math.round(b.x - size / 2)));
    const sy = Math.max(0, Math.min(this.H - size, Math.round(b.y - 12 - size / 2)));
    g.drawImage(this.canvas, sx, sy, size, size, 0, 0, 512, 512);
    return out;
  }

  /**
   * Clean plate for palette extraction: the bird alone over the scene's average colour,
   * with the scene's light grade. Keeps busy painted backgrounds from bleeding into the sprite.
   */
  palettePlate(b: Bird): HTMLCanvasElement {
    const out = document.createElement('canvas'); out.width = 512; out.height = 512;
    const g = out.getContext('2d')!; g.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas'); tmp.width = 1; tmp.height = 1;
    const tg = tmp.getContext('2d')!; tg.drawImage(this.canvas, 0, 0, this.W, this.H, 0, 0, 1, 1);
    const [r, gg, bb] = tg.getImageData(0, 0, 1, 1).data;
    g.fillStyle = `rgb(${r},${gg},${bb})`; g.fillRect(0, 0, 512, 512);
    const plate = document.createElement('canvas'); plate.width = 64; plate.height = 64;
    const pg = plate.getContext('2d')!;
    pg.fillStyle = `rgb(${r},${gg},${bb})`; pg.fillRect(0, 0, 64, 64);
    drawFrame(pg, b.frames[0], 16, 16, 1, false);
    if (this.scene.tint) { pg.fillStyle = this.scene.tint; pg.fillRect(0, 0, 64, 64); }
    g.drawImage(plate, 0, 0, 512, 512);
    return out;
  }
}
