import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureJob } from '../nav';
import { useNav } from '../nav';
import type { Analysis, FieldcraftScore } from '../../core/pixel/extract';
import { analyze } from '../../app/photo';
import { fileCatch, CatchResult, useGame, getState, logEvent, speciesCount } from '../../app/store';
import { REGION_BY_CODE } from '../../data/regions';
import { SPECIES, SPECIES_BY_ID, displayName } from '../../data/species';
import type { Species } from '../../data/types';
import { likelyNow, regionSpecies, rarityOf, lns, RARITY_META } from '../../core/rarity';
import { renderFrames } from '../../core/pixel/sprite';
import { RGB, CLEAR, IDX, HEX } from '../../core/palette';
import { rgbToLab, snapToPalette } from '../../core/color';
import { Sprite, RarityTag, Meter, Sheet, RefThumb, useReducedMotion, VERIFY_META, Icon } from '../components';
import { sfx, haptic } from '../../app/audio';
import { RANK_LINES } from '../../core/xp';
import type { Verification } from '../../core/model';

function mergeScore(base: FieldcraftScore, o?: Partial<FieldcraftScore>): FieldcraftScore {
  if (!o) return base;
  const s = { ...base, ...o };
  s.total = Math.round(s.sharpness + s.exposure + s.size + s.framing + s.separation);
  const lines: string[] = [];
  if ((o.framing ?? 0) >= 15) lines.push('Patient. You let it settle before you shot.');
  if ((o.exposure ?? 20) < 12) lines.push('Low light. Window birds look best in the morning.');
  if (base.separation < 8) lines.push('Busy background — wait for it on a clear perch.');
  s.coaching = lines.length ? lines.slice(0, 2) : ['Locked focus. Clean frame.'];
  return s;
}

export function CatchFlow({ job }: { job: CaptureJob }) {
  const nav = useNav();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [stage, setStage] = useState<'scoring' | 'dark' | 'confirm' | 'reveal'>('scoring');
  const [result, setResult] = useState<CatchResult | null>(null);
  const [stageLabel, setStageLabel] = useState('Isolating…');
  const filed = useRef(false);

  useEffect(() => {
    logEvent('catch_attempt', job.mode);
    const labels = ['Isolating…', 'Reducing…', 'Inking…'];
    let i = 0;
    const iv = setInterval(() => { i = Math.min(2, i + 1); setStageLabel(labels[i]); }, 260);
    const t0 = performance.now();
    Promise.all([analyze(job.shot.rgba), job.paletteRgba ? analyze(job.paletteRgba, 512, [0.5, 0.5]) : Promise.resolve(null)]).then(([a0, plate]) => {
      const a = plate ? { ...a0, palette: plate.palette } : a0;
      clearInterval(iv);
      const score = job.scoreOverride ? mergeScore(a.score, job.scoreOverride) : a.score;
      const out = { ...a, score, timings: { ...a.timings, wall: performance.now() - t0 } };
      (window as any).__lastPipeline = out.timings;
      setAnalysis(out);
      // freeze frame must be visible ≥120ms (CAM-5)
      setTimeout(() => {
        if (score.tooDark && job.mode !== 'window' && job.mode !== 'sketch') setStage('dark');
        else if (job.knownSpecies) file(job.knownSpecies, 'verified', out);
        else setStage('confirm');
      }, 140);
    });
    return () => clearInterval(iv);
  }, []);

  const file = async (speciesId: string | null, verification: Verification, a = analysis!) => {
    if (filed.current) return;
    filed.current = true;
    const r = await fileCatch({
      speciesId, verification, mode: job.mode, habitat: getState().habitat,
      analysis: { palette: a.palette, score: a.score, hash: a.hash }, photo: job.shot.blob, at: job.shot.takenAt,
    });
    setResult(r);
    setStage('reveal');
  };

  return (
    <div className="overlay modal" style={{ background: 'var(--ink)' }}>
      {stage !== 'reveal' && (
        <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="taped tilt-l mt16" style={{ width: '70%', maxWidth: 300 }}>
            <img src={job.shot.preview} alt="Your capture" style={{ aspectRatio: '1/1', objectFit: 'cover', imageRendering: job.mode === 'window' || job.mode === 'sketch' ? 'pixelated' : 'auto' }} />
          </div>
          {!analysis && <p className="px" aria-live="polite">{stageLabel}</p>}
          {analysis && job.mode !== 'sketch' && <ScoreStamp s={analysis.score} />}
          {stage === 'dark' && (
            <div className="panel" role="alert">
              <h3 className="mb8">Too dark to read</h3>
              <p className="small">We couldn't read that photo — it may be too dark. Try again with the bird against the sky.</p>
              <button className="btn primary block mt8" onClick={nav.back}>Try again</button>
              <button className="link" onClick={() => setStage('confirm')}>File it anyway</button>
            </div>
          )}
        </div>
      )}
      {stage === 'confirm' && analysis && <ConfirmSheet job={job} onPick={(id, v) => file(id, v)} onCancel={nav.back} />}
      {stage === 'reveal' && result && analysis && <Reveal job={job} result={result} analysis={analysis} />}
    </div>
  );
}

function ScoreStamp({ s }: { s: FieldcraftScore }) {
  return (
    <div className="panel" style={{ width: '100%' }} aria-label={`Fieldcraft score ${s.total} of 100`}>
      <div className="row between"><span className="label">Fieldcraft</span><span className="num" style={{ fontSize: 20, color: 'var(--accent)' }}>{s.total}</span></div>
      <Meter value={s.total} tone="sun" label="Fieldcraft" />
      {s.coaching.slice(0, 2).map((c) => <p key={c} className="small" style={{ margin: '6px 0 0' }}>“{c}”</p>)}
    </div>
  );
}

// ─── species confirm (CAM-2, CAM-3, CAM-9, COL-9) ───
function ConfirmSheet({ job, onPick, onCancel }: { job: CaptureJob; onPick: (id: string | null, v: Verification) => void; onCancel: () => void }) {
  const regionCode = useGame((s) => s.region);
  const habitat = useGame((s) => s.habitat);
  const region = REGION_BY_CODE[regionCode];
  const shortlist = useMemo(() => likelyNow(region, job.shot.takenAt, habitat).slice(0, 5), []);
  const [mode, setMode] = useState<'short' | 'search' | 'vagrant'>('short');
  const [q, setQ] = useState('');
  const [vagrant, setVagrant] = useState<Species | null>(null);
  const regional = regionSpecies(regionCode);
  const pool = mode === 'vagrant' ? SPECIES.filter((s) => !s.occ[regionCode]) : regional;
  const results = pool.filter((s) => !q || `${s.common} ${s.sci} ${s.familyName}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.common.localeCompare(b.common));

  if (vagrant) {
    return (
      <Sheet onClose={() => setVagrant(null)} label="Report a vagrant">
        <h3 className="mb8">Report a vagrant?</h3>
        <p className="small">That species isn't recorded in {region.name}. File it as a vagrant?</p>
        <p className="small muted">It will be filed and drawn, flagged for review, and won't count toward {region.name} completion until you confirm it from the journal.</p>
        <div className="row mt16"><Sprite species={vagrant} mode="static" scale={2} /><b>{vagrant.common}</b></div>
        <button className="btn primary block mt16" onClick={() => onPick(vagrant.id, 'vagrant')}>File as vagrant</button>
        <button className="btn ghost block mt8" onClick={() => setVagrant(null)}>Back</button>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onCancel} label="What did you see?">
      <h3 className="mb8">What did you see?</h3>
      {mode === 'short' ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Most likely in {region.name} right now:</p>
          <div role="list">
            {shortlist.map(({ sp, rarity }) => (
              <button key={sp.id} role="listitem" className="srow" onClick={() => { sfx.tap(); onPick(sp.id, 'verified'); }}>
                <Sprite species={sp} mode="static" scale={2} />
                <RefThumb sp={sp} />
                <span className="grow"><span className="name">{displayName(sp, regionCode)}</span><br /><RarityTag rarity={rarity} /></span>
              </button>
            ))}
          </div>
          <button className="btn block mt16" onClick={() => setMode('search')}>Search all {region.name} birds</button>
        </>
      ) : (
        <>
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'vagrant' ? 'Search species from other regions' : `Search ${regional.length} ${region.name} species`}
            aria-label="Search species" style={{ width: '100%', minHeight: 48, padding: '8px 12px', background: 'var(--ink)', border: '2px solid var(--smoke)' }} />
          <div style={{ maxHeight: '42vh', overflowY: 'auto', marginTop: 8 }}>
            {results.map((sp) => (
              <button key={sp.id} className="srow" onClick={() => (mode === 'vagrant' ? setVagrant(sp) : onPick(sp.id, 'self-reported'))}>
                <Sprite species={sp} mode="static" scale={1} />
                <span className="grow"><span className="name">{displayName(sp, regionCode)}</span><br /><span className="sci">{sp.sci}</span></span>
              </button>
            ))}
            {!results.length && <p className="small muted">Nothing matches. Loosen the search?</p>}
          </div>
          {mode === 'search' ? (
            <button className="link" onClick={() => { setMode('vagrant'); setQ(''); }}>Not on this list? Report a vagrant</button>
          ) : (
            <button className="link" onClick={() => { setMode('search'); setQ(''); }}>Back to {region.name} species</button>
          )}
        </>
      )}
      <button className="btn ghost block mt8" onClick={() => onPick(null, 'unverified')}>Not sure — identify later</button>
      <p className="small muted">Unidentified catches still become sprites. They don't count toward completion until you name them.</p>
    </Sheet>
  );
}

// ─── reveal (the product) ───
function seededOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function Reveal({ job, result, analysis }: { job: CaptureJob; result: CatchResult; analysis: Analysis }) {
  const nav = useNav();
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const [xpShown, setXpShown] = useState(0);
  const skip = useRef(false);
  const { sighting: s, species: sp } = result;
  const region = useGame((st) => REGION_BY_CODE[st.region]);
  const total = useGame((st) => speciesCount(st));
  const bgHex = HEX[s.sprite.bg];
  const frames = renderFrames(sp, s.sprite.parts);

  useEffect(() => {
    const c = canvasRef.current!; const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const img = new Image();
    img.src = job.shot.preview;
    let raf = 0; let start = 0;
    // crop square around the subject so the mosaic lines up with where the bird was
    const bb = analysis.bbox;
    const side = Math.min(1, Math.max(bb.w, bb.h) * 1.35);
    const cx = Math.min(1 - side / 2, Math.max(side / 2, bb.x + bb.w / 2)), cy = Math.min(1 - side / 2, Math.max(side / 2, bb.y + bb.h / 2));
    const small = document.createElement('canvas');
    const mosaicAt = (n: number) => {
      small.width = n; small.height = n;
      const sg = small.getContext('2d')!; sg.imageSmoothingEnabled = true;
      sg.drawImage(img, (cx - side / 2) * img.naturalWidth, (cy - side / 2) * img.naturalHeight, side * img.naturalWidth, side * img.naturalHeight, 0, 0, n, n);
      return sg.getImageData(0, 0, n, n);
    };
    const order = seededOrder(1024, parseInt(s.sprite.hash.slice(0, 6), 16));
    let snapped: number[] | null = null;
    const finalFrame = frames[0];
    const paintIdx = (arr: ArrayLike<number>) => {
      const id = g.createImageData(32, 32);
      for (let i = 0; i < 1024; i++) { const c = RGB[arr[i]]; id.data.set([c[0], c[1], c[2], 255], i * 4); }
      g.putImageData(id, 0, 0);
    };
    const end = () => {
      g.clearRect(0, 0, 32, 32); g.fillStyle = bgHex; g.fillRect(0, 0, 32, 32);
      setDone(true); haptic([12, 40, 18]);
      if (s.firstRecord) sfx.stamp(); sfx.sparkle();
      if (result.rankUp) setTimeout(sfx.fanfare, 400);
    };
    let lastTick = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const e = t - start;
      if (skip.current || e > 1800) { end(); return; }
      if (e < 450) {
        const n = e < 150 ? 128 : e < 300 ? 64 : 32;
        const d = mosaicAt(n);
        const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n; tmp.getContext('2d')!.putImageData(d, 0, 0);
        g.drawImage(tmp, 0, 0, 32, 32);
      } else if (e < 1100) {
        if (!snapped) {
          const d = mosaicAt(32);
          snapped = [];
          for (let i = 0; i < 1024; i++) snapped.push(snapToPalette(rgbToLab(d.data[i * 4], d.data[i * 4 + 1], d.data[i * 4 + 2]), [IDX.eye]));
        }
        const k = Math.min(1, (e - 450) / 600);
        const arr = snapped.slice();
        const upto = Math.floor(k * 1024);
        for (let j = 0; j < upto; j++) { const i = order[j]; arr[i] = finalFrame[i] === CLEAR ? s.sprite.bg : finalFrame[i]; }
        paintIdx(arr);
        if (t - lastTick > 50) { sfx.pixel(); lastTick = t; }
      } else {
        // land: 2px drop and settle, stepped
        const k = (e - 1100) / 700;
        const dy = k < 0.2 ? -3 : k < 0.4 ? -1 : k < 0.5 ? 1 : 0;
        const arr = new Array(1024).fill(s.sprite.bg);
        for (let i = 0; i < 1024; i++) {
          const y = (i / 32) | 0, x = i % 32, sy = y - dy;
          if (sy >= 0 && sy < 32 && finalFrame[sy * 32 + x] !== CLEAR) arr[i] = finalFrame[sy * 32 + x];
        }
        paintIdx(arr);
      }
      raf = requestAnimationFrame(step);
    };
    const go = () => {
      if (reduced) { setTimeout(end, 200); return; }
      raf = requestAnimationFrame(step);
    };
    if (img.complete) go(); else img.onload = go;
    img.onerror = () => end();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!done) return;
    let v = 0;
    const iv = setInterval(() => { v = Math.min(s.xp, v + Math.max(1, Math.ceil(s.xp / 8))); setXpShown(v); if (v >= s.xp) clearInterval(iv); }, 60);
    return () => clearInterval(iv);
  }, [done]);

  const fileIt = () => {
    sfx.page();
    if (job.returnTo === 'window') { nav.back(); nav.toast(`Filed: ${displayName(sp, s.region)} · +${s.xp} XP`); return; }
    nav.closeAll(); nav.setTab('journal'); nav.setHighlight(s.id);
  };

  const rm = RARITY_META[s.rarity];
  const fcLine = s.coaching[0];
  return (
    <div className="screen" style={{ textAlign: 'center' }}>
      <div className="panel" style={{ padding: 8, position: 'relative' }} onClick={() => (skip.current = true)}>
        <div className="label" style={{ textAlign: 'left' }}>Photo → Sprite</div>
        <div style={{ position: 'relative', width: 256, height: 256, margin: '8px auto' }}>
          {!done ? (
            <canvas ref={canvasRef} width={32} height={32} className="pix" style={{ width: 256, height: 256, transition: reduced ? 'opacity 200ms' : undefined }} aria-label="Your photo turning into a sprite. Tap to skip." />
          ) : (
            <div style={{ background: bgHex, width: 256, height: 256 }}>
              <Sprite species={sp} parts={s.sprite.parts} scale={8} mode={s.sprite.pose === 'flight' ? 'fly' : 'idle'} label={`${sp.common} sprite`} />
            </div>
          )}
          {done && s.firstRecord && <span className="stampmark sun" style={{ position: 'absolute', top: 8, right: -4, background: 'var(--ink)', animation: 'stampin 300ms steps(3)' }}>★ First record</span>}
          {done && !s.firstRecord && s.timesSeen % 10 === 0 && <span className="stampmark ash" style={{ position: 'absolute', top: 8, right: 0, background: 'var(--ink)' }}>{s.timesSeen}×</span>}
          {done && s.sprite.variant !== 'normal' && <span className="stampmark rust" style={{ position: 'absolute', bottom: 8, left: 0, background: 'var(--ink)' }}>{s.sprite.variant}</span>}
        </div>
        <div className="small muted" style={{ textAlign: 'right' }}>{done ? '32 × 32' : 'tap to skip'}</div>
      </div>

      {done && (
        <div style={{ animation: 'fadein 180ms steps(3)' }}>
          <h2 style={{ fontSize: 18 }}>{displayName(sp, s.region)}</h2>
          {sp.sci && <div className="sci">{sp.sci}</div>}
          <div className="row mt8" style={{ justifyContent: 'center', gap: 12 }}>
            <RarityTag rarity={s.rarity} />
            <span className={`stampmark ${VERIFY_META[s.verification].cls}`}>{VERIFY_META[s.verification].label}</span>
            {s.mode !== 'field' && <span className="stampmark ash">{s.mode === 'import' ? 'Archived' : s.mode === 'sketch' ? 'Sketch' : 'Window'}</span>}
          </div>
          {s.rarity === 'common' && <p className="small muted" style={{ marginBottom: 0 }}>The bird that taught you the shape of a wing.</p>}
          {s.rarity === 'legendary' && <p className="small" style={{ color: 'var(--accent)' }}>Most birders wait decades. You were standing in the right place.</p>}
          <p className="small" style={{ fontStyle: 'italic' }}>“{sp.fact}”</p>
          {s.fieldcraft && (
            <div className="mt8">
              <Meter value={s.fieldcraft.total} tone="seg" label="Fieldcraft" />
              <p className="small muted" style={{ margin: '6px 0 0' }}>Fieldcraft {s.fieldcraft.total} · “{fcLine}”</p>
            </div>
          )}
          <div className="panel mt16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: 0 }}>
            <div style={{ padding: 10 }}><div className="num" style={{ color: 'var(--accent)', fontSize: 18 }}>+{xpShown}</div><div className="label" style={{ fontSize: 11 }}>XP</div></div>
            <div style={{ padding: 10, borderLeft: '2px solid var(--slate)', borderRight: '2px solid var(--slate)' }}><div className="num" style={{ fontSize: 18 }}>{total}</div><div className="label" style={{ fontSize: 11 }}>Species</div></div>
            <div style={{ padding: 10 }}><div className="num" style={{ fontSize: 18 }}>+{s.feathers}</div><div className="label" style={{ fontSize: 11 }}>Feathers</div></div>
          </div>
          {s.newPlumage && <p className="small" style={{ color: 'var(--lichen)' }}>New plumage record. Your {sp.common.toLowerCase()} looks different this time.</p>}
          {!s.firstRecord && !s.newPlumage && s.speciesId && <p className="small muted">Seen {s.timesSeen} times. +{s.feathers} Feathers.</p>}
          {result.badges.map((b) => (
            <div key={b.id} className="panel flat row between" style={{ padding: '8px 12px' }}>
              <span className="small">{b.name} · {b.tier}</span><span className="px small" style={{ color: 'var(--accent)' }}>Earned</span>
            </div>
          ))}
          {result.rankUp && <p className="px small" style={{ color: 'var(--accent)' }}>{RANK_LINES[result.rankUp] ?? result.rankUp}</p>}
          {sp.sensitive && <p className="small muted">Sensitive species — location hidden. PIXEL BIRDER never stores where you saw it.</p>}
          <button className="btn cream big block mt16" onClick={fileIt}>File in journal</button>
          {job.returnTo !== 'window' && <button className="link" onClick={() => { nav.closeAll(); nav.open({ name: 'species', id: s.speciesId ?? '_unknown', sightingId: s.id }); }}>Open species card</button>}
        </div>
      )}
    </div>
  );
}

export { Icon, SPECIES_BY_ID };
