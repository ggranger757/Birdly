import { useEffect, useMemo, useRef, useState } from 'react';
import { Diorama, Bird } from '../../render/diorama';
import { useGame, getState, recordSitSpot, logEvent } from '../../app/store';
import { REGION_BY_CODE } from '../../data/regions';
import { likelyNow, starterBird, spawnWeight, weightedPick } from '../../core/rarity';
import { sunTimes, dayPhase } from '../../core/sun';
import { defaultParts } from '../../core/pixel/sprite';
import { useNav } from '../nav';
import { TopBar, useReducedMotion, Icon, RarityTag } from '../components';
import { sfx, haptic } from '../../app/audio';
import { normalize } from '../../app/photo';
import { displayName } from '../../data/species';
import { rarityOf, lns } from '../../core/rarity';

const SIT_MS = 5 * 60e3;

export function WindowMode({ sit, starter }: { sit?: boolean; starter?: boolean }) {
  const nav = useNav();
  const regionCode = useGame((s) => s.region);
  const habitat = useGame((s) => s.habitat);
  const decor = useGame((s) => s.diorama.decor);
  const region = REGION_BY_CODE[regionCode];
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dio = useRef<Diorama | null>(null);
  const [view, setView] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [, force] = useState(0);
  const [target, setTarget] = useState<Bird | null>(null);
  const [focus, setFocus] = useState(0); // 0..1
  const [flash, setFlash] = useState(false);
  const [sitLeft, setSitLeft] = useState(sit ? SIT_MS : 0);
  const [sitDone, setSitDone] = useState(false);
  const [coach, setCoach] = useState(starter ? 'One bird is already waiting for you.' : '');
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);
  const phase = dayPhase(now, sunTimes(now, region.lat, region.lng));

  // fit an integer scale
  useEffect(() => {
    const box = boxRef.current; if (!box) return;
    const scale = box.clientWidth >= 600 ? 3 : 2;
    setView({ w: Math.floor(box.clientWidth / scale), h: Math.floor(box.clientHeight / scale), scale });
  }, []);

  useEffect(() => {
    if (!view) return;
    const d = new Diorama(canvasRef.current!, habitat, phase, { frame: true, decor, reduced, viewW: view.w, viewH: view.h });
    dio.current = d;
    d.onChange = () => force((x) => x + 1);
    d.start();
    const list = likelyNow(region, new Date(), habitat);
    let seed = (Date.now() / 1000) | 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let encounters = 0;
    const spawn = (forced?: string) => {
      const sp = forced ? list.find((l) => l.sp.id === forced)!.sp : weightedPick(list, (l) => spawnWeight(l.score), rnd()).sp;
      const stay = forced ? Infinity : (sit ? 26000 : 18000) + rnd() * 14000;
      const b = d.add(`${sp.id}-${Date.now()}`, sp, defaultParts(sp), { stay, seed: Math.floor(rnd() * 1e6) });
      if (b) { encounters++; logEvent('encounter', sp.id); }
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    let nextAt = 0;
    const schedule = (ms: number) => {
      nextAt = Date.now() + ms;
      timers.push(setTimeout(() => { if (d.birds.length < 3) spawn(); schedule(poisson()); }, ms));
    };
    // GAM-10: Poisson arrivals, mean 45–90s in Window Mode, 30–50s on a Sit Spot
    const mean = sit ? 30000 + rnd() * 20000 : 45000 + rnd() * 45000;
    const poisson = () => Math.max(6000, -Math.log(1 - rnd()) * mean);
    if (starter) timers.push(setTimeout(() => spawn(starterBird(region, new Date(), habitat).id), 2200));
    else timers.push(setTimeout(() => spawn(), 3000 + rnd() * 9000)); // first bird well within 20s
    schedule(starter ? 30000 : 20000 + poisson());
    // Sit Spot guarantee: 3 encounters in 5 minutes
    if (sit) {
      timers.push(setTimeout(() => { if (encounters < 2) spawn(); }, 110000));
      timers.push(setTimeout(() => { if (encounters < 3) spawn(); }, 220000));
    }
    const iv = setInterval(() => setNextIn(Math.max(0, Math.round((nextAt - Date.now()) / 1000))), 1000);
    return () => { timers.forEach(clearTimeout); clearInterval(iv); d.dispose(); };
  }, [habitat, regionCode, view]);

  // sit spot countdown
  useEffect(() => {
    if (!sit) return;
    const start = Date.now();
    const iv = setInterval(() => {
      const left = Math.max(0, SIT_MS - (Date.now() - start));
      setSitLeft(left);
      if (left === 0 && !sitDone) { setSitDone(true); recordSitSpot(); sfx.sparkle(); clearInterval(iv); }
    }, 500);
    return () => clearInterval(iv);
  }, [sit]);

  // focus fills over 1.2s while the target sits still
  useEffect(() => {
    if (!target) return;
    let raf = 0; const t0 = performance.now();
    const step = () => {
      const alive = dio.current?.birds.includes(target) && target.state === 'perched';
      if (!alive) { setTarget(null); setFocus(0); if (target.state === 'leaving') setCoach('It flew. Another will come. The best birders are just people who kept looking.'); return; }
      const k = Math.min(1, (performance.now() - t0) / 1200);
      setFocus(k);
      if (k < 1) raf = requestAnimationFrame(step);
      else { sfx.focus(); haptic(8); if (starter) setCoach('Tap the shutter.'); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const birds = dio.current?.birds ?? [];
  useEffect(() => {
    if (starter && birds.some((b) => b.state === 'perched') && !target) setCoach('Tap the bird to focus.');
  }, [birds.length, birds.map((b) => b.state).join()]);

  const onTap = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const d = dio.current; if (!d) return;
    const lx = ((e.clientX - r.left) / r.width) * d.W, ly = ((e.clientY - r.top) / r.height) * d.H;
    const b = dio.current?.hit(lx, ly);
    if (b && b.state === 'perched') { setTarget(b); setFocus(0); sfx.tap(); setCoach(starter ? 'Hold steady…' : ''); }
    else if (b) setCoach('Wait for it to land.');
  };

  const shoot = async () => {
    if (!target || focus < 1 || busy) return;
    setBusy(true);
    sfx.shutter(); haptic(14);
    setFlash(true);
    const b = target;
    const snap = dio.current!.snapshot(b);
    const plate = dio.current!.palettePlate(b);
    const plateRgba = plate.getContext('2d')!.getImageData(0, 0, 512, 512).data;
    b.leaveAt = performance.now() + 900; // the bird notices the click
    const shot = await normalize(snap, 512, 512);
    const settled = performance.now() - b.settledAt;
    setTimeout(() => setFlash(false), 160);
    setTarget(null); setFocus(0);
    const exposure = phase === 'night' ? 8 : phase === 'dawn' || phase === 'dusk' ? 16 : 20;
    const patience = settled > 4000 ? 15 : 11;
    nav.open({
      name: 'catch',
      job: {
        mode: 'window', shot, paletteRgba: plateRgba, knownSpecies: b.sp.id, returnTo: 'window', sit,
        scoreOverride: { sharpness: 30, exposure, size: 18, framing: patience },
      },
    });
    setBusy(false);
    setCoach('');
  };

  const scale = view?.scale ?? 2;
  const box = target && dio.current ? dio.current.spriteBox(target) : null;
  const min = Math.floor(sitLeft / 60000), sec = Math.floor((sitLeft % 60000) / 1000);
  const perched = birds.filter((b) => b.state === 'perched');

  return (
    <div className="overlay">
      <TopBar title={sit ? 'Sit Spot' : 'Window Mode'} onBack={nav.back} backIcon="close"
        right={<span className="chip" aria-live="polite">{sit ? (sitDone ? 'Done' : `${min}:${String(sec).padStart(2, '0')}`) : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>} />
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'var(--ink)' }}>
        <div style={{ position: 'relative', width: (dio.current?.W ?? view?.w ?? 0) * scale, height: (dio.current?.H ?? view?.h ?? 0) * scale }}>
          <canvas ref={canvasRef} className="pix" style={{ width: (dio.current?.W ?? view?.w ?? 0) * scale, height: (dio.current?.H ?? view?.h ?? 0) * scale, touchAction: 'none' }} onPointerDown={onTap}
            role="img" aria-label={`Window scene: ${dio.current?.scene.label ?? ''}, ${phase}. ${perched.length ? perched.map((b) => b.sp.common).join(', ') + ' visible.' : 'No birds right now.'}`} />
          {box && (
            <div className={`reticle ${focus >= 1 ? 'locked' : ''}`} style={{
              left: (box.x - 4) * scale, top: (box.y - 2) * scale, width: 40 * scale, height: 36 * scale,
              transform: `scale(${1.25 - focus * 0.25})`, transition: 'transform 120ms steps(3)',
            }}><i /><i /><i /><i /></div>
          )}
          {flash && <div className="flash" />}
        </div>
        {/* parallel DOM list for screen readers (ACC-5) */}
        <ul className="sr-only" aria-live="polite">
          {perched.map((b) => <li key={b.key}><button onClick={() => { setTarget(b); setFocus(0); }}>Focus on the {b.sp.common}</button></li>)}
        </ul>
      </div>
      <div style={{ padding: '12px 16px calc(16px + var(--safe-b))', borderTop: '2px solid var(--plum)' }}>
        <div className="row between small" style={{ minHeight: 24 }}>
          <span>Birds visiting: <b className="num">{perched.length}</b></span>
          <span className="muted">{nextIn !== null && nextIn > 0 ? `Next likely: ~${nextIn}s` : 'Watching…'}</span>
        </div>
        <p className="small" style={{ minHeight: 40, margin: '6px 0' }} aria-live="polite">
          {target && focus >= 1 ? <><b>{displayName(target.sp, regionCode)}</b> <RarityTag rarity={rarityOf(lns(target.sp, region, new Date(), habitat))} /> · in focus</> : coach}
        </p>
        {sitDone && <p className="small" style={{ color: 'var(--lichen)' }}>Five minutes of patience. The Sit Spot challenge counts it.</p>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => perched[0] && (setTarget(perched[0]), setFocus(0))} disabled={!perched.length} aria-label="Focus on the nearest bird">Focus</button>
          <button className={`shutter ${focus >= 1 ? 'ready' : ''}`} onClick={shoot} disabled={focus < 1 || busy} aria-label="Shutter">
            <Icon name="photo" size={28} color="var(--ink)" />
          </button>
          <span style={{ width: 88 }} />
        </div>
      </div>
    </div>
  );
}

export function useWindowStarter() { return getState().sightings.length === 0; }
