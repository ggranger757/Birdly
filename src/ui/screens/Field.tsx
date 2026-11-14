import { useEffect, useMemo, useRef, useState } from 'react';
import { paintSceneThumb, sceneFor } from '../../render/diorama';
import type { Habitat } from '../../data/types';
import { useNav } from '../nav';
import { useGame, setState, speciesOf, claimChallenge, refreshChallenges, exportBackup, getState } from '../../app/store';
import { REGION_BY_CODE } from '../../data/regions';
import { displayName } from '../../data/species';
import { likelyNow } from '../../core/rarity';
import { sunTimes, dayPhase, DayPhase } from '../../core/sun';
import { liveStreak, dayKey } from '../../core/xp';
import { challengeProgress } from '../../core/challenges';
import { fetchWeather, Weather } from '../../app/net';
import { Sprite, RarityTag, Meter, Icon, RefThumb } from '../components';
import { sfx } from '../../app/audio';

const PHASE_LINE: Record<DayPhase, string> = {
  night: 'Night. Owls are the birds awake now.',
  dawn: 'Dawn chorus peaking',
  morning: 'Morning feeding. Birds are busy.',
  day: 'Quiet hour. Try the hedgerow.',
  golden: 'Golden hour. Soft light, long shadows.',
  dusk: 'Dusk. The last feeders before roost.',
};

export function Field() {
  const nav = useNav();
  const st = useGame((s) => s);
  const region = REGION_BY_CODE[st.region];
  const now = new Date();
  const sun = sunTimes(now, region.lat, region.lng);
  const phase = dayPhase(now, sun);
  const [wx, setWx] = useState<Weather | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { fetchWeather(region).then(setWx); }, [st.region]);
  useEffect(() => { refreshChallenges(new Date()); }, []);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const likely = useMemo(() => likelyNow(region, now, st.habitat, wx ?? undefined), [st.region, st.habitat, wx, phase]);
  const tomorrowDawn = useMemo(() => {
    const t = new Date(sun.sunrise.getTime() + 864e5 + 20 * 60e3);
    return likelyNow(region, t, st.habitat).filter((l) => l.score > 0.55).length;
  }, [st.region, st.habitat]);
  const streak = liveStreak(st.streak, dayKey(now));
  const last = st.sightings[0];
  const firstRun = st.sightings.length === 0;
  const showChallenges = st.sightings.length > 0 || st.sessions > 1; // UX-9: challenges open after the first catch
  const backupDue = st.backupPromptAfter && new Date(st.backupPromptAfter) <= now && st.sightings.length > 0;

  const download = async () => {
    const blob = await exportBackup(true);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pixel-birder-journal-${dayKey(new Date())}.json`; a.click();
    setState((s) => ({ ...s, backupPromptAfter: new Date(Date.now() + 30 * 864e5).toISOString() }));
  };

  return (
    <div className="screen with-tabs">
      <SceneBanner habitat={st.habitat} phase={phase}>
      <header className="row between">
        <h1 style={{ fontSize: 16 }}>PIXEL <span style={{ color: 'var(--accent)' }}>BIRDER</span></h1>
        <div className="row" style={{ gap: 6 }}>
          <span className="chip" aria-label={`${streak.days}-day streak${streak.resting ? ', resting' : ''}`}><Icon name="flame" size={12} color={streak.days ? 'var(--oriole)' : 'var(--ash)'} />{streak.days}</span>
          <span className="chip" aria-label={`${st.feathers} feathers`}><Icon name="feather" size={12} color="var(--sky)" />{st.feathers}</span>
        </div>
      </header>
      <div className="mt8 px small" style={{ color: 'var(--stone)' }}>
        {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{wx?.tempC !== undefined ? ` · ${wx.tempC}°C` : ''} · {region.code}
      </div>
      <div className="small" style={{ fontWeight: 600 }}>{wx ? `${wx.label} · ` : ''}{PHASE_LINE[phase]}</div>
      </SceneBanner>
      {!online && <div className="panel flat small" role="status">You're offline. Your journal still works. Catches are saved on this phone.</div>}

      {firstRun ? (
        <div className="panel highlight">
          <h2 className="mb8">One bird is already waiting for you.</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Look out of the window with PIXEL BIRDER. Tap to focus. Tap the shutter.</p>
          <button className="btn primary big block" onClick={() => { sfx.tap(); nav.open({ name: 'window', starter: true }); }}>Look out of the window</button>
          <button className="btn block mt8" onClick={() => nav.open({ name: 'viewfinder' })}>I'm outside — use the camera</button>
        </div>
      ) : (
        <>
          <section className="panel" aria-labelledby="likely-h">
            <div className="row between"><h3 id="likely-h" className="label">Likely right now</h3><span className="small muted">{region.name}</span></div>
            {likely.slice(0, 3).map(({ sp, rarity, score }) => (
              <button key={sp.id} className="srow" onClick={() => nav.open({ name: 'species', id: sp.id })}>
                <Sprite species={sp} scale={2} mode="static" />
                <span className="grow"><span className="name">{displayName(sp, st.region)}</span><br /><span className="small"><RarityTag rarity={rarity} /> <span className="muted">· {Math.round(score * 100)}% likely</span></span></span>
                <RefThumb sp={sp} size={40} />
              </button>
            ))}
          </section>
          <button className="btn primary big block" onClick={() => { sfx.tap(); nav.open({ name: 'viewfinder' }); }}>Catch a bird</button>
          <div className="row mt8" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => nav.open({ name: 'window', sit: true })}>Sit spot 5m</button>
            <button className="btn grow" onClick={() => nav.open({ name: 'window' })}><Icon name="window" size={16} /> Window</button>
          </div>
        </>
      )}

      {backupDue && (
        <div className="panel mt16">
          <h3 className="mb8">Save your journal?</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Everything lives on this phone. A backup file lets you move it to a new phone or restore it if you clear your browser.</p>
          <div className="row"><button className="btn primary grow" onClick={download}>Download backup</button>
            <button className="btn ghost" onClick={() => setState((s) => ({ ...s, backupPromptAfter: new Date(Date.now() + 7 * 864e5).toISOString() }))}>Not now</button></div>
        </div>
      )}

      {showChallenges && (
        <section className="panel mt16" aria-labelledby="ch-h">
          <div className="row between"><h3 id="ch-h" className="label">Today</h3><button className="link" onClick={() => nav.open({ name: 'challenges' })}>All challenges</button></div>
          {st.challenges.daily.map((slot) => {
            const p = challengeProgress(st, slot, now);
            return (
              <div key={slot.id} className="mt8">
                <div className="row between small"><span>{p.label}</span>
                  {p.done && !slot.claimed ? <button className="btn small primary" onClick={() => { const xp = claimChallenge(slot); sfx.sparkle(); nav.toast(`+${xp} XP`); }}>Claim</button>
                    : <span className="num">{slot.claimed ? 'Done' : `${p.progress}/${p.goal}`}</span>}
                </div>
                <Meter value={p.progress} max={p.goal} tone="river" label={p.label} />
              </div>
            );
          })}
        </section>
      )}

      {last && (
        <section className="panel">
          <div className="label mb8">Last catch</div>
          <button className="srow" onClick={() => nav.open({ name: 'species', id: last.speciesId ?? '_unknown', sightingId: last.id })}>
            <Sprite species={speciesOf(last)} parts={last.sprite.parts} scale={2} />
            <span className="grow"><span className="name">{displayName(speciesOf(last), last.region)}</span><br />
              <span className="small muted">{timeAgo(last.capturedAt)} · <RarityTag rarity={last.rarity} />{last.fieldcraft ? ` · ${last.fieldcraft.total} fieldcraft` : ''}</span></span>
          </button>
        </section>
      )}

      {!firstRun && (
        <div className="panel dashed small">
          {streak.resting ? 'Your streak is resting. One catch wakes it up. ' : ''}
          Tomorrow at dawn: {tomorrowDawn} species likely at your patch.
        </div>
      )}
    </div>
  );
}

/** The player's patch right now, painted from the same scene the diorama uses. */
function SceneBanner({ habitat, phase, children }: { habitat: Habitat; phase: DayPhase; children: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = Math.floor((box.current?.clientWidth ?? 360) / 2);
    paintSceneThumb(ref.current!, habitat, phase, w, 110);
  }, [habitat, phase]);
  return (
    <div ref={box} style={{ position: 'relative', margin: '-12px -16px 12px', borderBottom: '2px solid #000' }}>
      <canvas ref={ref} className="pix" style={{ width: '100%', height: 220, objectFit: 'cover', objectPosition: 'bottom', display: 'block' }}
        role="img" aria-label={`Your patch: ${sceneFor(habitat, phase).label}`} />
      <div style={{ position: 'absolute', inset: 0, padding: 'calc(12px + var(--safe-t)) 16px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, rgba(6,8,10,0.78) 0, rgba(6,8,10,0.15) 38%, rgba(6,8,10,0) 55%, rgba(6,8,10,0.85) 100%)' }}>{children}</div>
    </div>
  );
}

export function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export { getState };
