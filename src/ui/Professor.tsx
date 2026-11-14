// The professor. Loads a sprite sheet from public/prof/druid.png when present and plays its first
// row as an idle loop. Frames are found automatically: rows and frames are separated by empty space,
// and a solid background colour (taken from the top-left pixel) is keyed out. Falls back to an owl.
import { useEffect, useRef, useState } from 'react';
import { SPECIES_BY_ID } from '../data/species';
import { Sprite, useReducedMotion, onTick } from './components';

interface Sheet { img: HTMLCanvasElement; frames: { x: number; y: number; w: number; h: number }[] }
let sheetPromise: Promise<Sheet | null> | null = null;

function loadSheet(): Promise<Sheet | null> {
  sheetPromise ??= new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        const px = d.data;
        // key out a flat background if the sheet has no transparency
        const [br, bg, bb, ba] = [px[0], px[1], px[2], px[3]];
        if (ba === 255) for (let i = 0; i < px.length; i += 4) {
          if (Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb) < 24) px[i + 3] = 0;
        }
        g.putImageData(d, 0, 0);
        const W = c.width, H = c.height;
        const opaque = (x: number, y: number) => px[(y * W + x) * 4 + 3] > 40;
        // first band of rows containing pixels
        let y0 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
          let any = false; for (let x = 0; x < W; x++) if (opaque(x, y)) { any = true; break; }
          if (any && y0 < 0) y0 = y;
          if (!any && y0 >= 0) { y1 = y; break; }
        }
        if (y0 < 0) { resolve(null); return; }
        if (y1 < 0) y1 = H;
        const frames: Sheet['frames'] = [];
        let fx = -1;
        for (let x = 0; x <= W; x++) {
          let any = false; if (x < W) for (let y = y0; y < y1; y++) if (opaque(x, y)) { any = true; break; }
          if (any && fx < 0) fx = x;
          if (!any && fx >= 0) { frames.push({ x: fx, y: y0, w: x - fx, h: y1 - y0 }); fx = -1; }
        }
        resolve(frames.length ? { img: c, frames } : null);
      } catch { resolve(null); }
    };
    im.onerror = () => resolve(null);
    im.src = 'prof/druid.png';
  });
  return sheetPromise;
}

export function Professor({ height = 128 }: { height?: number }) {
  const [sheet, setSheet] = useState<Sheet | null | undefined>(undefined);
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => { loadSheet().then(setSheet); }, []);
  useEffect(() => {
    if (!sheet || !ref.current) return;
    const fw = Math.max(...sheet.frames.map((f) => f.w)), fh = sheet.frames[0].h;
    const c = ref.current; c.width = fw; c.height = fh;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    const paint = (i: number) => { const f = sheet.frames[i % sheet.frames.length]; g.clearRect(0, 0, fw, fh); g.drawImage(sheet.img, f.x, f.y, f.w, f.h, Math.floor((fw - f.w) / 2), 0, f.w, f.h); };
    paint(0);
    if (reduced) return;
    let last = -1;
    return onTick((t) => { const i = Math.floor(t / 180) % sheet.frames.length; if (i !== last) { last = i; paint(i); } });
  }, [sheet, reduced]);
  if (sheet === undefined) return <div style={{ height }} />;
  if (!sheet) return <Sprite species={SPECIES_BY_ID.grhowl} scale={Math.max(2, Math.floor(height / 32))} label="Professor" />;
  const fh = sheet.frames[0].h;
  const scale = Math.max(1, Math.floor(height / fh));
  const fw = Math.max(...sheet.frames.map((f) => f.w));
  return <canvas ref={ref} className="pix" style={{ width: fw * scale, height: fh * scale }} role="img" aria-label="The Professor" />;
}
