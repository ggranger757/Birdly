import { useEffect, useRef, useState } from 'react';
import { REGIONS, REGION_BY_CODE, nearestRegion, regionStamp } from '../../data/regions';
import { SPECIES_BY_ID } from '../../data/species';
import { defaultParts, renderFrames } from '../../core/pixel/sprite';
import { setState, getState, logEvent } from '../../app/store';
import type { Habitat } from '../../data/types';
import { paintSceneThumb } from '../../render/diorama';
import { Sprite, frameImage, useReducedMotion } from '../components';
import { sfx } from '../../app/audio';

function BootBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { paintSceneThumb(ref.current!, 'urban', 'night', 200, 216); }, []);
  return <canvas ref={ref} className="pix" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, zIndex: -1 }} />;
}

export function Boot({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 300 : 1200);
    const c = ref.current!; const g = c.getContext('2d')!;
    const robin = renderFrames(SPECIES_BY_ID.amerob, defaultParts(SPECIES_BY_ID.amerob));
    const start = performance.now();
    let raf = 0;
    const tmp = document.createElement('canvas'); tmp.width = 32; tmp.height = 32;
    const draw = () => {
      const k = Math.min(1, (performance.now() - start) / 1100);
      g.fillStyle = '#14121F'; g.fillRect(0, 0, 96, 64);
      // cartridge slot
      g.fillStyle = '#2B2440'; g.fillRect(20, 44, 56, 8); g.fillStyle = '#000'; g.fillRect(24, 46, 48, 3);
      const cy = Math.round(-30 + Math.min(1, k * 2) * 52);
      g.fillStyle = '#5B5A7A'; g.fillRect(30, cy, 36, 26); g.fillStyle = '#F2C14E'; g.fillRect(34, cy + 4, 28, 12);
      g.fillStyle = '#14121F'; g.fillRect(36, cy + 6, 2, 2);
      // hopping bird
      const bx = Math.round(-30 + Math.max(0, k - 0.35) * 1.6 * 70);
      const hop = Math.abs(Math.sin(k * 14)) * 4;
      tmp.getContext('2d')!.putImageData(frameImage(robin[k > 0.85 ? 0 : 7]), 0, 0);
      g.drawImage(tmp, Math.min(bx, 60), Math.round(14 - hop));
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="screen" onClick={onDone} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, position: 'relative', isolation: 'isolate' }} aria-label="Starting. Tap to skip.">
      <BootBackdrop />
      <canvas ref={ref} width={96} height={64} className="pix" style={{ width: 288, height: 192 }} aria-hidden />
      <h1 style={{ fontSize: 32, lineHeight: '40px' }}><span>PIXEL </span><span style={{ color: 'var(--accent)' }}>BIRDER</span></h1>
      <p className="label">Tap to skip</p>
    </div>
  );
}

function PromiseDemo() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const sp = SPECIES_BY_ID.norcar;
    const f = renderFrames(sp, defaultParts(sp))[0];
    const c = ref.current!; const g = c.getContext('2d')!;
    const tmp = document.createElement('canvas'); tmp.width = 32; tmp.height = 32;
    tmp.getContext('2d')!.putImageData(frameImage(f), 0, 0);
    let i = reduced ? 2 : 0;
    const paint = () => {
      g.imageSmoothingEnabled = i === 0;
      g.fillStyle = '#9FD3E0'; g.fillRect(0, 0, 192, 192);
      if (i === 0) { g.filter = 'blur(6px) saturate(1.2)'; g.drawImage(tmp, 0, 0, 192, 192); g.filter = 'none'; }
      else if (i === 1) { const m = document.createElement('canvas'); m.width = 8; m.height = 8; const mg = m.getContext('2d')!; mg.fillStyle = '#9FD3E0'; mg.fillRect(0, 0, 8, 8); mg.drawImage(tmp, 0, 0, 8, 8); g.drawImage(m, 0, 0, 192, 192); }
      else g.drawImage(tmp, 0, 0, 192, 192);
    };
    paint();
    if (reduced) return;
    const t = setInterval(() => { i = (i + 1) % 3; paint(); }, 680);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="taped tilt-l" style={{ width: 216 }}>
      <canvas ref={ref} width={192} height={192} style={{ width: 204, height: 204, imageRendering: 'pixelated' }} role="img" aria-label="A photo of a cardinal turning into a 32 by 32 pixel sprite" />
    </div>
  );
}

const PATCHES: { key: string; label: string; habitat: Habitat; scene: Habitat; phase?: 'day' | 'golden' | 'morning' }[] = [
  { key: 'window', label: 'Window / Balcony', habitat: 'urban', scene: 'urban' },
  { key: 'yard', label: 'Yard / Garden', habitat: 'urban', scene: 'urban', phase: 'golden' },
  { key: 'park', label: 'Park / Woods', habitat: 'woodland', scene: 'woodland', phase: 'morning' },
  { key: 'shore', label: 'Shore / Wetland', habitat: 'water', scene: 'water' },
];

function Scene({ biome, phase = 'day' }: { biome: Habitat; phase?: 'day' | 'golden' | 'morning' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { paintSceneThumb(ref.current!, biome, phase, 150, 170); }, [biome, phase]);
  return <canvas ref={ref} width={150} height={170} className="pix" style={{ width: '100%', aspectRatio: '150/170', height: 'auto', display: 'block' }} aria-hidden />;
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState<'promise' | 'place' | 'patch'>('promise');
  const [region, setRegion] = useState(getState().region);
  const [query, setQuery] = useState('');
  const [geoMsg, setGeoMsg] = useState('');
  useEffect(() => { logEvent('onboarding_step', step); }, [step]);

  const finish = (habitat: Habitat) => {
    setState((s) => ({ ...s, region, habitat, onboarded: true, diorama: { ...s.diorama, biome: habitat } }));
    sfx.sparkle();
    onFinish();
  };
  const skip = () => { finish('urban'); };

  if (step === 'promise') {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, textAlign: 'center' }}>
        <PromiseDemo />
        <h1 style={{ fontSize: 20, lineHeight: '30px', maxWidth: 300 }}>Every bird you see becomes a sprite.</h1>
        <button className="btn primary big block" onClick={() => setStep('place')}>Continue</button>
      </div>
    );
  }

  if (step === 'place') {
    const q = query.trim().toLowerCase();
    const list = REGIONS.filter((r) => !q || `${r.countryName} ${r.name} ${r.code}`.toLowerCase().includes(q));
    const useLocation = () => {
      if (!navigator.geolocation) { setGeoMsg('Location is not available on this device. Pick from the list.'); return; }
      setGeoMsg('Finding your region…');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const r = nearestRegion(p.coords.latitude, p.coords.longitude); // coordinates are dropped right here
          setRegion(r.code); setGeoMsg(`Nearest seed region: ${r.name}. Coordinates were not stored.`);
        },
        () => setGeoMsg('No location permission. Pick your region from the list instead.'),
        { maximumAge: 600000, timeout: 8000, enableHighAccuracy: false },
      );
    };
    return (
      <div className="screen">
        <div className="row between mb16"><h2>Where do you live?</h2><button className="link" onClick={skip}>Skip setup</button></div>
        <input type="search" placeholder="Search country or region" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Search regions" style={{ width: '100%', minHeight: 48, padding: '8px 12px', background: 'var(--ink)', border: '2px solid var(--smoke)', borderRadius: 0 }} />
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
          {list.map((r) => (
            <li key={r.code}>
              <button className="srow" onClick={() => setRegion(r.code)} aria-pressed={region === r.code} style={{ color: region === r.code ? 'var(--accent)' : undefined }}>
                <span className="grow"><span className="name">{r.name}</span><br /><span className="small muted">{r.countryName}</span></span>
                <span className="px small">{region === r.code ? '● ' : ''}{r.code}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="muted small">No seed region matches. PIXEL BIRDER covers nine regions in v1. Pick the nearest one.</li>}
        </ul>
        <button className="btn ghost block" onClick={useLocation}>Use my location</button>
        {geoMsg && <p className="small muted" role="status">{geoMsg}</p>}
        <div className="panel flat mt16" style={{ textAlign: 'center' }}>
          <span className="stampmark sun" aria-label={`Selected region ${regionStamp(region)}`}>{regionStamp(region)}</span>
        </div>
        <button className="btn primary big block" onClick={() => setStep('patch')}>This is my region</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="row between mb8"><h2>Where do you bird most?</h2><button className="link" onClick={skip}>Skip</button></div>
      <p className="muted small mb16">You can change this anytime.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {PATCHES.map((p) => (
          <button key={p.key} className="panel" style={{ padding: 6, margin: 0, textAlign: 'left' }} onClick={() => finish(p.habitat)}>
            <Scene biome={p.scene} phase={p.phase} />
            <span className="px" style={{ display: 'block', fontSize: 12, marginTop: 6 }}>{p.label}</span>
          </button>
        ))}
      </div>
      <p className="small muted mt16">Region: {REGION_BY_CODE[region]?.name}</p>
    </div>
  );
}

export { Sprite };
