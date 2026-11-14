import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureJob } from '../nav';
import { useNav } from '../nav';
import type { Analysis, FieldcraftScore } from '../../core/pixel/extract';
import { analyze } from '../../app/photo';
import { fileCatch, CatchResult, useGame, getState, logEvent } from '../../app/store';
import { getRegion } from '../../data/geo';
import { regionEntries, allKnownSpecies } from '../../data/provider';
import type { Species } from '../../data/types';
import { likelyNow } from '../../core/rarity';
import { renderFrames } from '../../core/pixel/sprite';
import { RGB, CLEAR, IDX, HEX } from '../../core/palette';
import { rgbToLab, snapToPalette } from '../../core/color';
import { Sprite, useReducedMotion } from '../components';
import { Dialog, Menu, Types, BirdThumb, Capsule, Wipe, dexNo, BadgeIcon, FxHit } from '../game';
import { sfx, haptic, gameMusic, playClip } from '../../app/audio';
import { RANK_LINES } from '../../core/xp';
import type { Verification } from '../../core/model';
import { paintSceneThumb } from '../../render/diorama';
import { sunTimes, dayPhase } from '../../core/sun';

type Stage = 'wipe' | 'spotted' | 'dark' | 'identify' | 'search' | 'appear' | 'throw' | 'caught';

export function CatchFlow({ job }: { job: CaptureJob }) {
  const nav = useNav();
  const regionCode = useGame((s) => s.region);
  const habitat = useGame((s) => s.habitat);
  const region = getRegion(regionCode);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [stage, setStage] = useState<Stage>('wipe');
  const [result, setResult] = useState<CatchResult | null>(null);
  const [wipeDone, setWipeDone] = useState(false);
  const filed = useRef(false);
  const prevTheme = useRef('explore');

  useEffect(() => {
    logEvent('catch_attempt', job.mode);
    sfx.encounter(); gameMusic('encounter');
    const t0 = performance.now();
    analyze(job.shot.rgba).then((a) => {
      const out = { ...a, timings: { ...a.timings, wall: performance.now() - t0 } };
      (window as any).__lastPipeline = out.timings;
      setAnalysis(out);
    });
    return () => { gameMusic(prevTheme.current as 'explore'); };
  }, []);
  useEffect(() => {
    if (!wipeDone || !analysis) return;
    setStage(analysis.score.tooDark && job.mode === 'field' ? 'dark' : 'spotted');
  }, [wipeDone, analysis]);

  const file = async (speciesId: string | null, verification: Verification) => {
    if (filed.current || !analysis) return;
    filed.current = true;
    const r = await fileCatch({
      speciesId, verification, mode: job.mode, habitat: getState().habitat,
      analysis: { palette: analysis.palette, score: analysis.score, hash: analysis.hash }, photo: job.shot.blob, at: job.shot.takenAt,
    });
    setResult(r); setStage('appear');
  };

  const sc = analysis?.score;
  const snapPower = sc?.total ?? 0;
  return (
    <div className="overlay modal" style={{ background: '#000' }}>
      <BattleField job={job} habitat={habitat} region={region} stage={stage} result={result} analysis={analysis} snapPower={snapPower}
        onThrown={() => setStage('caught')} />
      <div style={{ padding: '14px 12px calc(14px + var(--safe-b))', background: '#0A0C0F', borderTop: '3px solid #000', maxHeight: '58%', overflowY: 'auto' }}>
        {stage === 'wipe' && <Dialog lines={['…']} />}
        {stage === 'dark' && (
          <Dialog lines={['Hmm… the photo is too dark to see the bird.', 'Try again with the bird against the sky, or use it anyway.']}>
            <div className="row mt8"><button className="btn primary grow" onClick={nav.back}>Try again</button><button className="btn grow" onClick={() => setStage('spotted')}>Use it</button></div>
          </Dialog>
        )}
        {stage === 'spotted' && sc && (
          <Dialog lines={[
            job.mode === 'sketch' ? 'You sketched a wild bird!' : 'You spotted a wild bird!',
            ...(job.mode === 'field' ? [`Snap Power ${snapPower}! ${sc.coaching[0] ?? ''}`] : job.mode === 'import' ? ['An archived photo — it counts, at half XP.'] : []),
            'What bird is it?',
          ]} onDone={() => setStage('identify')} />
        )}
        {(stage === 'identify' || stage === 'search') && (
          <Identify job={job} search={stage === 'search'} onSearch={() => setStage('search')} onBack={() => setStage('identify')} onPick={file} />
        )}
        {stage === 'appear' && result && (
          <>
            <Dialog lines={[`A wild ${result.species.common.toUpperCase()} appeared!`]} />
            <button className="btn primary big block mt8" onClick={() => { playClip('throw'); haptic(15); setStage('throw'); }}>
              <Capsule size={24} /> Record with Snap Lens
            </button>
          </>
        )}
        {stage === 'throw' && <Dialog lines={['…']} />}
        {stage === 'caught' && result && <CaughtText result={result} onContinue={() => {
          sfx.page();
          nav.closeAll(); nav.setTab('dex'); nav.setHighlight(result.sighting.id);
          setTimeout(() => nav.open({ name: 'species', id: result.sighting.speciesId ?? '_unknown', sightingId: result.sighting.id }), 50);
        }} />}
      </div>
      {!wipeDone && <Wipe onDone={() => setWipeDone(true)} />}
    </div>
  );
}

function Identify({ job, search, onSearch, onBack, onPick }: { job: CaptureJob; search: boolean; onSearch: () => void; onBack: () => void; onPick: (id: string | null, v: Verification) => void }) {
  const regionCode = useGame((s) => s.region);
  const habitat = useGame((s) => s.habitat);
  const region = getRegion(regionCode);
  const shortlist = useMemo(() => likelyNow(region, job.shot.takenAt, habitat).slice(0, 5), []);
  const [q, setQ] = useState('');
  const [vagrant, setVagrant] = useState(false);
  type Opt = { kind: 'sp'; sp: Species; dex?: number } | { kind: 'search' } | { kind: 'later' };
  if (!search) {
    const opts: Opt[] = [...shortlist.map((l) => ({ kind: 'sp' as const, sp: l.sp, dex: l.dex })), { kind: 'search' }, { kind: 'later' }];
    return (
      <Menu label="What bird is it?" items={opts} onPick={(o) => (o.kind === 'sp' ? onPick(o.sp.id, 'verified') : o.kind === 'search' ? onSearch() : onPick(null, 'unverified'))}
        render={(o) => o.kind === 'sp' ? (
          <span className="row grow" style={{ gap: 10 }}><BirdThumb sp={o.sp} size={44} /><span className="grow">{o.sp.common}<br /><span className="sub"><Types sp={o.sp} /></span></span><span className="sub">{dexNo(o.dex)}</span></span>
        ) : o.kind === 'search' ? <span>Search all {region.name} birds…</span> : <span>Not sure — identify later</span>} />
    );
  }
  const entries = regionEntries(regionCode);
  const inRegion = new Set(entries.map((e) => e.sp.id));
  const pool = vagrant ? allKnownSpecies().filter((s) => !inRegion.has(s.id)) : entries.map((e) => e.sp);
  const res = pool.filter((s) => !q || `${s.common} ${s.sci}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <div className="menu" style={{ padding: 10 }}>
      <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={vagrant ? 'Birds from other regions…' : `Search ${entries.length} ${region.name} birds…`}
        aria-label="Search species" style={{ width: '100%', minHeight: 44, padding: '6px 10px', background: '#fff', color: '#000', border: '2px solid #000', fontSize: 16 }} />
      <div style={{ maxHeight: '30vh', overflowY: 'auto' }}>
        {res.map((s) => (
          <button key={s.id} className="menu-item" onClick={() => { sfx.select(); onPick(s.id, vagrant ? 'vagrant' : 'self-reported'); }}>
            <BirdThumb sp={s} size={36} /><span className="grow">{s.common}<br /><span className="sub"><i>{s.sci}</i></span></span>
          </button>
        ))}
        {!res.length && <p className="sub">No match. {vagrant ? '' : 'Not on this list? Try “report a vagrant”.'}</p>}
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <button className="menu-item" style={{ width: 'auto', minHeight: 40 }} onClick={() => { sfx.back(); onBack(); }}>◀ Back</button>
        <button className="menu-item" style={{ width: 'auto', minHeight: 40 }} onClick={() => { setVagrant(!vagrant); setQ(''); }}>{vagrant ? 'Local birds' : 'Report a vagrant'}</button>
      </div>
      {vagrant && <p className="sub" style={{ margin: '4px 0 0' }}>Vagrants are birds far outside their usual range. They are drawn and saved, but count once you confirm them.</p>}
    </div>
  );
}

function CaughtText({ result, onContinue }: { result: CatchResult; onContinue: () => void }) {
  const s = result.sighting, sp = result.species;
  const lines = [
    s.speciesId ? `Discovered! ${sp.common.toUpperCase()} was recorded in the BirdDex${s.dex ? ` as ${dexNo(s.dex)}` : ''}.` : 'Discovered! An unidentified bird was recorded in your BirdDex. Name it later.',
    ...(s.firstRecord ? ['★ NEW ENTRY! You have never found this bird before.'] : s.newPlumage ? ['A new plumage! This one looks different from your others.'] : [`You have found this species ${s.timesSeen} times.`]),
    `${sp.common} is Lv ${s.level ?? 5}. You gained ${s.xp} XP and ${s.feathers} Feathers — spend them on food for your feeder.`,
    ...(getState().diorama.birds.includes(s.id) ? [getState().sightings.length === 1 ? 'Your new bird lives in the Aviary now. Keep the feeder filled and it will stay healthy!' : `${sp.common} moved into your Aviary.`] : [`Your Aviary is full, so ${sp.common} is resting in the Bird Box.`]),
    ...(s.sprite.variant !== 'normal' ? [`Incredible — a rare ${s.sprite.variant} bird!`] : []),
    ...(result.badges.length === 1 ? [`You earned the ${result.badges[0].name.toUpperCase()} badge!`]
      : result.badges.length > 1 ? [`You earned ${result.badges.length} badges: ${result.badges.map((b) => b.name).join(', ')}!`] : []),
    ...(result.rankUp ? [`Trainer level up! ${RANK_LINES[result.rankUp] ?? result.rankUp}`] : []),
  ];
  const played = useRef(false);
  return (
    <>
      {result.badges.length > 0 && (
        <div className="row" style={{ gap: 10, justifyContent: 'center', marginBottom: 10 }}>
          {result.badges.map((b) => <span key={b.id} style={{ animation: 'stampin 400ms steps(4)' }}><BadgeIcon icon={b.icon} earned size={56} label={`${b.name} badge`} /></span>)}
        </div>
      )}
      <Dialog lines={lines} onLine={(i) => {
      if (played.current) return;
      if (/badge|level up/i.test(lines[i] ?? '')) { played.current = true; playClip('levelUp', { duck: true }); }
    }}>
        <button className="btn primary block mt8" onClick={(e) => { e.stopPropagation(); onContinue(); }}>Continue</button>
      </Dialog>
    </>
  );
}

// ─── the field: scene, photo, sprite reveal, capsule ───
function seededOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function BattleField({ job, habitat, region, stage, result, analysis, snapPower, onThrown }: {
  job: CaptureJob; habitat: any; region: ReturnType<typeof getRegion>; stage: Stage; result: CatchResult | null; analysis: Analysis | null; snapPower: number; onThrown: () => void;
}) {
  const reduced = useReducedMotion();
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const revealRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [throwPhase, setThrowPhase] = useState<'none' | 'fly' | 'open' | 'drop' | 'wobble' | 'done'>('none');
  const [wob, setWob] = useState(0);
  useEffect(() => {
    const now = new Date();
    paintSceneThumb(sceneRef.current!, habitat, dayPhase(now, sunTimes(now, region.lat, region.lng)), 200, 260);
  }, []);

  // photo → sprite reveal (the "appeared" moment)
  useEffect(() => {
    if (stage !== 'appear' || !result || !analysis) return;
    const s = result.sighting;
    const frames = renderFrames(result.species, s.sprite.parts);
    const c = revealRef.current; if (!c) return;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    const img = new Image(); img.src = job.shot.preview;
    const bb = analysis.bbox, side = Math.min(1, Math.max(bb.w, bb.h) * 1.35);
    const cx = Math.min(1 - side / 2, Math.max(side / 2, bb.x + bb.w / 2)), cy = Math.min(1 - side / 2, Math.max(side / 2, bb.y + bb.h / 2));
    const small = document.createElement('canvas');
    const mosaic = (n: number) => { small.width = n; small.height = n; const sg = small.getContext('2d')!; sg.drawImage(img, (cx - side / 2) * img.naturalWidth, (cy - side / 2) * img.naturalHeight, side * img.naturalWidth, side * img.naturalHeight, 0, 0, n, n); return sg.getImageData(0, 0, n, n); };
    const order = seededOrder(1024, parseInt(s.sprite.hash.slice(0, 6), 16));
    let snapped: number[] | null = null; let raf = 0; let start = 0; let tick = 0;
    const paintIdx = (arr: ArrayLike<number>) => {
      const id = g.createImageData(32, 32);
      for (let i = 0; i < 1024; i++) { if (arr[i] === CLEAR) continue; const col = RGB[arr[i]]; id.data.set([col[0], col[1], col[2], 255], i * 4); }
      g.clearRect(0, 0, 32, 32); g.putImageData(id, 0, 0);
    };
    const step = (t: number) => {
      if (!start) start = t;
      const e = t - start;
      if (e > 1500) { setRevealed(true); haptic([12, 40, 18]); sfx.sparkle(); return; }
      if (e < 420) { const n = e < 140 ? 128 : e < 280 ? 64 : 32; const d = mosaic(n); const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n; tmp.getContext('2d')!.putImageData(d, 0, 0); g.clearRect(0, 0, 32, 32); g.drawImage(tmp, 0, 0, 32, 32); }
      else {
        if (!snapped) { const d = mosaic(32); snapped = []; for (let i = 0; i < 1024; i++) snapped.push(snapToPalette(rgbToLab(d.data[i * 4], d.data[i * 4 + 1], d.data[i * 4 + 2]), [IDX.eye])); }
        const k = Math.min(1, (e - 420) / 900); const arr = snapped.slice(); const upto = Math.floor(k * 1024);
        for (let j = 0; j < upto; j++) { const i = order[j]; arr[i] = frames[0][i]; }
        paintIdx(arr);
        if (t - tick > 55) { sfx.pixel(); tick = t; }
      }
      raf = requestAnimationFrame(step);
    };
    const go = () => { if (reduced) { setRevealed(true); return; } raf = requestAnimationFrame(step); };
    if (img.complete) go(); else { img.onload = go; img.onerror = () => setRevealed(true); }
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // capsule throw → open → suck in → drop → wobble ×N → click
  useEffect(() => {
    if (stage !== 'throw' || !result) return;
    const n = result.sighting.firstRecord ? 3 : Math.max(1, Math.min(3, Math.round(snapPower / 35)));
    const [tFly, tOpen, tDrop, tWob] = reduced ? [1, 1, 1, 1] : [560, 420, 380, 700]; // impact lands on the throw sound's hit
    const timers: ReturnType<typeof setTimeout>[] = [];
    setThrowPhase('fly');
    timers.push(setTimeout(() => { setThrowPhase('open'); haptic(20); }, tFly));
    timers.push(setTimeout(() => { setThrowPhase('drop'); sfx.stamp(); }, tFly + tOpen));
    const w0 = tFly + tOpen + tDrop;
    timers.push(setTimeout(() => setThrowPhase('wobble'), w0));
    for (let i = 0; i < n; i++) timers.push(setTimeout(() => { setWob(i + 1); sfx.wobble(); haptic(8); }, w0 + i * tWob));
    timers.push(setTimeout(() => { setThrowPhase('done'); sfx.click(); haptic([20, 30, 40]); setTimeout(() => (result.sighting.firstRecord ? playClip('newBird', { duck: true }) : sfx.caught()), 250); onThrown(); }, w0 + n * tWob));
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  const s = result?.sighting; const sp = result?.species;
  const birdVisible = (stage === 'appear' || (stage === 'throw' && (throwPhase === 'fly'))) && !!s;
  const capsuleOnField = stage === 'throw' && (throwPhase === 'drop' || throwPhase === 'wobble' || throwPhase === 'done') || stage === 'caught';
  const showPhoto = stage === 'wipe' || stage === 'spotted' || stage === 'dark' || stage === 'identify' || stage === 'search';

  return (
    <div className="field">
      <canvas ref={sceneRef} className="scene" aria-hidden />
      {/* enemy-side info box */}
      <div className="hpbox" style={{ left: 12, top: 'calc(12px + var(--safe-t))' }}>
        <div className="row between"><span className="nm">{sp && stage !== 'identify' ? sp.common : 'Wild bird'}</span><span className="nm">{s ? `Lv${s.level ?? 5}` : 'Lv?'}</span></div>
        {sp && stage !== 'identify' && stage !== 'search' && <div style={{ marginTop: 2 }}><Types sp={sp} /></div>}
        <div className="row between" style={{ fontSize: 10, fontFamily: 'var(--px)', marginTop: 4 }}><span>SNAP</span><span>{job.mode === 'field' ? snapPower : '—'}</span></div>
        <div className="hpbar"><i style={{ width: `${job.mode === 'field' ? snapPower : 50}%`, background: snapPower > 70 ? '#6FA84B' : snapPower > 40 ? '#E8A33D' : '#A8452F' }} /></div>
      </div>
      {/* the bird's platform */}
      <div className="platform" style={{ right: '8%', top: '58%' }} />
      {showPhoto && (
        <>
          {/* the wild bird, seen through the game: your photo reduced to 32×32 in the game palette */}
          <div style={{ position: 'absolute', right: 'calc(8% + 31px)', top: 'calc(58% - 112px)' }}><PixelPhoto src={job.shot.preview} bbox={analysis?.bbox} /></div>
          <div className="taped" style={{ position: 'absolute', left: 14, top: 'calc(96px + var(--safe-t))', width: 84, transform: 'rotate(-3deg)', padding: '4px 4px 10px' }}>
            <img src={job.shot.preview} alt="Your photo" style={{ aspectRatio: '1/1', objectFit: 'cover' }} />
          </div>
        </>
      )}
      {stage === 'appear' && !revealed && <canvas ref={revealRef} width={32} height={32} className="pix" style={{ position: 'absolute', right: 'calc(8% + 31px)', top: 'calc(58% - 112px)', width: 128, height: 128 }} aria-label="Your photo turning into a sprite" />}
      {birdVisible && revealed && sp && s && (
        <div className={stage === 'throw' && throwPhase === 'fly' ? '' : ''} style={{ position: 'absolute', right: 'calc(8% + 31px)', top: 'calc(58% - 112px)' }}>
          <Sprite species={sp} parts={s.sprite.parts} scale={4} mode="idle" flip label={`${sp.common} sprite`} />
        </div>
      )}
      {stage === 'throw' && throwPhase === 'open' && sp && s && (
        <div className="suck" style={{ position: 'absolute', right: 'calc(8% + 31px)', top: 'calc(58% - 112px)' }}><Sprite species={sp} parts={s.sprite.parts} scale={4} mode="static" flip /></div>
      )}
      {stage === 'throw' && throwPhase === 'fly' && (
        <div className="throw" style={{ ['--tx' as any]: 'calc(92% - 95px)', ['--ty' as any]: 'calc(58% - 80px)' }}><Capsule size={44} /></div>
      )}
      {stage === 'throw' && throwPhase === 'open' && <div className="flash-white" />}
      {capsuleOnField && (
        <div className="capsule-sit" style={{ right: 'calc(8% + 78px)', top: 'calc(58% - 34px)' }}>
          <div key={wob} className={throwPhase === 'wobble' && wob > 0 ? 'wobble' : ''} style={{ transformOrigin: '50% 100%' }}><Capsule size={44} glow={throwPhase === 'done' || stage === 'caught'} /></div>
        </div>
      )}
      {throwPhase === 'done' && <div style={{ position: 'absolute', right: 'calc(8% + 62px)', top: 'calc(58% - 110px)', zIndex: 7 }}><FxHit size={120} /></div>}
      {(throwPhase === 'done' || stage === 'caught') && (
        <div className="burst" style={{ right: 'calc(8% + 95px)', top: 'calc(58% - 20px)', left: 'auto' }}>
          {[[-50, -40], [50, -40], [-60, 10], [60, 10], [0, -60], [-30, 40], [30, 40], [0, 50]].map(([x, y], i) => <i key={i} style={{ ['--bx' as any]: `${x}px`, ['--by' as any]: `${y}px` }} />)}
        </div>
      )}
      {/* trainer side: partner peeks in from bottom-left */}
      <PartnerCorner />
      {stage === 'caught' && s?.firstRecord && <span className="stampmark sun" style={{ position: 'absolute', left: 16, top: '44%', background: '#000' }}>★ New BirdDex entry</span>}
      {s && stage === 'caught' && <div style={{ position: 'absolute', right: 12, bottom: 10, background: HEX[s.sprite.bg], border: '2px solid #000' }}><Sprite species={sp!} parts={s.sprite.parts} scale={2} /></div>}
    </div>
  );
}

/** Your photo cropped to the bird and quantised to FIELD 32 at 32×32, so the encounter already looks pixel. */
function PixelPhoto({ src, bbox }: { src: string; bbox?: Analysis['bbox'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image(); img.src = src;
    img.onload = () => {
      const c = ref.current; if (!c) return;
      const bb = bbox ?? { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
      const side = Math.min(1, Math.max(bb.w, bb.h) * 1.35);
      const cx = Math.min(1 - side / 2, Math.max(side / 2, bb.x + bb.w / 2)), cy = Math.min(1 - side / 2, Math.max(side / 2, bb.y + bb.h / 2));
      const t = document.createElement('canvas'); t.width = 32; t.height = 32;
      const tg = t.getContext('2d', { willReadFrequently: true })!;
      tg.drawImage(img, (cx - side / 2) * img.naturalWidth, (cy - side / 2) * img.naturalHeight, side * img.naturalWidth, side * img.naturalHeight, 0, 0, 32, 32);
      const d = tg.getImageData(0, 0, 32, 32);
      for (let i = 0; i < 1024; i++) {
        const k = snapToPalette(rgbToLab(d.data[i * 4], d.data[i * 4 + 1], d.data[i * 4 + 2]), [IDX.eye]);
        const [r, g, b] = RGB[k]; d.data[i * 4] = r; d.data[i * 4 + 1] = g; d.data[i * 4 + 2] = b; d.data[i * 4 + 3] = 255;
      }
      c.getContext('2d')!.putImageData(d, 0, 0);
    };
  }, [src, bbox?.x]);
  return <canvas ref={ref} width={32} height={32} className="pix" style={{ width: 128, height: 128, border: '3px solid #000', boxShadow: '4px 4px 0 #000' }} aria-label="The wild bird, pixelated from your photo" />;
}

function PartnerCorner() {
  const partner = useGame((s) => s.partner);
  const sp = partner ? allKnownSpecies().find((x) => x.id === partner.speciesId) : null;
  if (!partner || !sp) return null;
  return (
    <div style={{ position: 'absolute', left: 14, bottom: 8 }}>
      <div className="platform" style={{ position: 'absolute', left: -30, bottom: -8, width: 160 }} />
      <Sprite species={sp} parts={partner.parts} scale={3} label={`Your partner, ${sp.common}`} />
    </div>
  );
}
