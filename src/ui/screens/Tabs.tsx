import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '../nav';
import { useGame, counts, speciesOf, speciesCount, setBiome, buyDecor, placeDecor, toggleHabitatBird, setState, claimChallenge } from '../../app/store';
import { REGIONS, REGION_BY_CODE } from '../../data/regions';
import { regionSpecies } from '../../core/rarity';
import { displayName } from '../../data/species';
import { Diorama, DECOR_ITEMS, DECOR_SLOTS } from '../../render/diorama';
import { sunTimes, dayPhase } from '../../core/sun';
import { rankFor, RANKS, liveStreak, dayKey } from '../../core/xp';
import { BADGES, TIER_FEATHERS } from '../../core/badges';
import { challengeProgress } from '../../core/challenges';
import type { Habitat } from '../../data/types';
import { Sprite, Meter, Icon, useReducedMotion, Sheet, RarityTag } from '../components';
import { sfx } from '../../app/audio';

// ─── MAP: a region atlas. Coarse by design — region codes only, never pins (PRV-1, ETH-2) ───
export function MapTab() {
  const st = useGame((s) => s);
  const counted = st.sightings.filter(counts);
  return (
    <div className="screen with-tabs">
      <h1 style={{ fontSize: 18 }}>Map</h1>
      <p className="small muted">Your birding, region by region. PIXEL BIRDER stores region codes, never coordinates, so there are no pins — only places.</p>
      <PixelGlobe visited={new Set(st.sightings.map((s) => s.region))} home={st.region} />
      {REGIONS.map((r) => {
        const list = regionSpecies(r.code);
        const have = new Set(counted.filter((s) => s.region === r.code).map((s) => s.speciesId)).size;
        const catches = st.sightings.filter((s) => s.region === r.code).length;
        return (
          <div key={r.code} className={`panel ${r.code === st.region ? 'highlight' : ''}`} style={{ padding: 10 }}>
            <div className="row between"><span><b>{r.name}</b> <span className="small muted">· {r.countryName}</span></span><span className="px small">{r.code}</span></div>
            <div className="row between small mt8"><span>{have} of {list.length} species</span><span className="muted">{catches} catches</span></div>
            <Meter value={have} max={list.length} tone={r.code === st.region ? 'sun' : 'river'} label={`${r.name} completion`} />
            {list.length < 20 && <p className="small muted" style={{ margin: '6px 0 0' }}>Limited data for this region.</p>}
          </div>
        );
      })}
      <div className="panel dashed small">Habitats you've birded: {[...new Set(st.sightings.map((s) => s.habitat))].join(', ') || 'none yet'}.</div>
    </div>
  );
}

function PixelGlobe({ visited, home }: { visited: Set<string>; home: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    const w = 120, h = 60;
    g.fillStyle = '#1F3F6E'; g.fillRect(0, 0, w, h);
    // very coarse continents (equirectangular blobs)
    const land: [number, number, number, number][] = [
      [10, 8, 30, 18], [22, 26, 10, 8], [30, 32, 14, 20], [52, 8, 26, 14], [55, 22, 18, 22], [74, 8, 34, 22], [86, 30, 12, 8], [96, 38, 16, 12],
    ];
    g.fillStyle = '#3F7A3F';
    for (const [x, y, ww, hh] of land) for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) {
      const dx = (xx - x - ww / 2) / (ww / 2), dy = (yy - y - hh / 2) / (hh / 2);
      if (dx * dx + dy * dy < 1.05) g.fillRect(xx, yy, 1, 1);
    }
    for (const r of REGIONS) {
      const x = Math.round(((r.lng + 180) / 360) * w), y = Math.round(((90 - r.lat) / 180) * h);
      g.fillStyle = r.code === home ? '#F2C14E' : visited.has(r.code) ? '#F7F4E9' : '#8A8BA3';
      g.fillRect(x - 1, y - 1, 3, 3);
    }
  }, [visited, home]);
  return (
    <div className="panel" style={{ padding: 6 }}>
      <canvas ref={ref} width={120} height={60} className="pix" style={{ width: '100%', aspectRatio: '2/1', height: 'auto' }} role="img" aria-label="World map of seed regions. Gold is your home region." />
      <div className="small muted mt8">■ gold: home · ■ cream: birded · ■ grey: seed region</div>
    </div>
  );
}

// ─── HABITAT (GAM-9): cozy diorama of caught birds; decor bought with Feathers ───
export function HabitatTab() {
  const nav = useNav();
  const st = useGame((s) => s);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [sheet, setSheet] = useState<'birds' | 'decor' | null>(null);
  const [sceneLabel, setSceneLabel] = useState('');
  const species = speciesCount(st);
  const region = REGION_BY_CODE[st.region];
  const now = new Date();
  const phase = dayPhase(now, sunTimes(now, region.lat, region.lng));
  const placed = st.diorama.birds.map((id) => st.sightings.find((s) => s.id === id)).filter(Boolean) as typeof st.sightings;
  const biomes: { b: Habitat; label: string; need: number }[] = [
    { b: st.habitat, label: 'Home patch', need: 0 },
    ...(['urban', 'woodland', 'water'] as Habitat[]).filter((b) => b !== st.habitat).map((b) => ({ b, label: b === 'urban' ? 'Urban' : b === 'woodland' ? 'Woodland' : 'Wetland', need: 10 })),
  ];

  useEffect(() => { const w = boxRef.current?.clientWidth ?? 358; setDims({ w: Math.floor(w / 2), h: Math.floor(Math.min(window.innerHeight * 0.52, 520) / 2) }); }, [st.sessions > 1 || st.sightings.length >= 2]);
  useEffect(() => {
    if ((st.sessions < 2 && st.sightings.length < 2) || !dims) return;
    const d = new Diorama(ref.current!, st.diorama.biome, phase, { decor: st.diorama.decor, reduced, viewW: dims.w, viewH: dims.h });
    setSceneLabel(d.scene.label);
    placed.forEach((s, i) => d.add(s.id, speciesOf(s), s.sprite.parts, { arrive: false, seed: i * 7 + 3 }));
    d.start();
    return () => d.dispose();
  }, [st.diorama.biome, JSON.stringify(st.diorama.decor), placed.map((p) => p.id).join(), reduced, dims]);

  // UX-9: Habitat opens after the second session or second catch
  if (st.sessions < 2 && st.sightings.length < 2) {
    return (
      <div className="screen with-tabs" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <Icon name="habitat" size={48} color="var(--fern)" />
        <h2>Your habitat opens after your next outing.</h2>
        <p className="muted small">Catch a second bird and they'll have somewhere to live.</p>
      </div>
    );
  }

  return (
    <div className="screen with-tabs">
      <div className="row between"><h1 style={{ fontSize: 18 }}>Habitat</h1><span className="chip"><Icon name="feather" size={12} color="var(--sky)" />{st.feathers}</span></div>
      <div ref={boxRef} className="mt8" style={{ display: 'flex', justifyContent: 'center' }}>
        <canvas ref={ref} className="pix" style={{ width: (dims?.w ?? 0) * 2, maxWidth: '100%', border: '2px solid var(--ink)', boxShadow: '4px 4px 0 #000' }} role="img"
          aria-label={`Habitat with ${placed.length} birds: ${placed.map((p) => speciesOf(p).common).join(', ') || 'none yet'}`} />
      </div>
      <ul className="sr-only">{placed.map((p) => <li key={p.id}>{speciesOf(p).common}</li>)}</ul>
      <div className="row between mt16 small"><span>Birds {placed.length}/12</span><span className="muted">{sceneLabel}</span><span>Decor {Object.keys(st.diorama.decor).length}/{DECOR_SLOTS.length}</span></div>
      <div className="row mt8">
        <button className="btn grow" onClick={() => setSheet('birds')}>Edit birds</button>
        <button className="btn grow" onClick={() => setSheet('decor')} disabled={species < 25}>Decorate</button>
      </div>
      {species < 25 && <p className="small muted">Decor opens at 25 species ({species} so far). Feathers keep until then.</p>}
      <div className="label mt16 mb8">Scene</div>
      <div className="hscroll">
        {biomes.map(({ b, label, need }) => (
          <button key={b} className="filter" aria-pressed={st.diorama.biome === b} disabled={species < need} onClick={() => setBiome(b)}>
            {label}{species < need ? ` · ${need} sp.` : ''}
          </button>
        ))}
      </div>
      {sheet === 'birds' && (
        <Sheet onClose={() => setSheet(null)} label="Choose birds for your habitat">
          <h3 className="mb8">Birds in your habitat · {placed.length}/12</h3>
          {st.sightings.filter(counts).length === 0 && <p className="small muted">Identified catches can live here.</p>}
          {dedupe(st.sightings.filter(counts)).map((s) => (
            <button key={s.id} className="srow" onClick={() => { if (!toggleHabitatBird(s.id)) nav.toast('Twelve is the limit. Move one out first.'); }} aria-pressed={st.diorama.birds.includes(s.id)}>
              <Sprite species={speciesOf(s)} parts={s.sprite.parts} scale={1} mode="static" />
              <span className="grow name">{displayName(speciesOf(s), s.region)}</span>
              <span className="px small" style={{ color: st.diorama.birds.includes(s.id) ? 'var(--accent)' : 'var(--smoke)' }}>{st.diorama.birds.includes(s.id) ? 'Here' : 'Add'}</span>
            </button>
          ))}
        </Sheet>
      )}
      {sheet === 'decor' && (
        <Sheet onClose={() => setSheet(null)} label="Decorate">
          <h3 className="mb8">Decor · {st.feathers} Feathers</h3>
          {DECOR_ITEMS.map((d) => {
            const owned = st.ownedDecor.includes(d.key);
            const slot = Object.entries(st.diorama.decor).find(([, k]) => k === d.key)?.[0];
            const slots = d.hang ? ['hang'] : ['left', 'mid', 'right'];
            return (
              <div key={d.key} className="srow">
                <span className="grow"><span className="name">{d.name}</span><br /><span className="small muted">{owned ? (slot ? `Placed · ${slot}` : 'Owned') : `${d.price} Feathers`}</span></span>
                {!owned ? <button className="btn small" disabled={st.feathers < d.price} onClick={() => { if (buyDecor(d.key, d.price)) { sfx.stamp(); placeDecor(slots.find((x) => !st.diorama.decor[x]) ?? slots[0], d.key); } }}>Buy</button>
                  : slot ? <button className="btn small ghost" onClick={() => placeDecor(slot, null)}>Store</button>
                    : <button className="btn small" onClick={() => placeDecor(slots.find((x) => !st.diorama.decor[x]) ?? slots[0], d.key)}>Place</button>}
              </div>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}

function dedupe<T extends { speciesId: string | null; id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => { const k = String(s.speciesId); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ─── YOU: rank, life list, badges, challenges, settings ───
export function YouTab() {
  const nav = useNav();
  const st = useGame((s) => s);
  const rank = rankFor(st.xp);
  const streak = liveStreak(st.streak, dayKey(new Date()));
  const earned = Object.keys(st.badges).length;
  return (
    <div className="screen with-tabs">
      <div className="row between"><h1 style={{ fontSize: 18 }}>You</h1><button className="icon-btn" aria-label="Settings" onClick={() => nav.open({ name: 'settings' })}><Icon name="gear" size={22} /></button></div>
      <div className="panel mt8">
        <div className="label">Rank {rank.index + 1} of {RANKS.length}</div>
        <h2 style={{ color: 'var(--accent)' }}>{rank.name}</h2>
        <Meter value={rank.progress * 100} tone="sun" label="Progress to next rank" />
        <div className="row between small mt8"><span className="num">{st.xp} XP</span><span className="muted">{rank.next ? `${rank.next.name} at ${rank.next.xp}` : 'Top rank'}</span></div>
      </div>
      <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center', padding: 8 }}>
        <div><div className="num" style={{ fontSize: 20 }}>{speciesCount(st)}</div><div className="label" style={{ fontSize: 11 }}>Life list</div></div>
        <div><div className="num" style={{ fontSize: 20 }}>{streak.days}</div><div className="label" style={{ fontSize: 11 }}>Streak{st.streak.freezes ? ` · ${st.streak.freezes}❄` : ''}</div></div>
        <div><div className="num" style={{ fontSize: 20 }}>{st.sightings.length}</div><div className="label" style={{ fontSize: 11 }}>Catches</div></div>
      </div>
      <button className="btn block" onClick={() => nav.open({ name: 'badges' })}>Badges · {earned}/{BADGES.length}</button>
      <button className="btn block mt8" onClick={() => nav.open({ name: 'challenges' })}>Challenges</button>
      <button className="btn block mt8" onClick={() => nav.open({ name: 'year' })}>Your year in birds</button>
      <div className="label mt24 mb8">Life list</div>
      {st.sightings.filter(counts).length === 0 && <p className="small muted">Your life list starts with your first identified catch.</p>}
      {dedupe(st.sightings.filter(counts)).map((s) => (
        <button key={s.id} className="srow" onClick={() => nav.open({ name: 'species', id: s.speciesId! })}>
          <Sprite species={speciesOf(s)} parts={s.sprite.parts} scale={1} mode="static" />
          <span className="grow"><span className="name">{displayName(speciesOf(s), s.region)}</span><br /><span className="small muted">{new Date(s.capturedAt).toLocaleDateString()} · {s.region}</span></span>
          <RarityTag rarity={s.rarity} showLabel={false} />
        </button>
      ))}
    </div>
  );
}

export function BadgesScreen() {
  const st = useGame((s) => s);
  const nav = useNav();
  const cats = ['Firsts', 'Taxonomy', 'Place', 'Craft', 'Time', 'Dedication'] as const;
  const [cat, setCat] = useState<(typeof cats)[number]>('Firsts');
  const tierColor = { bronze: 'var(--rust)', silver: 'var(--stone)', gold: 'var(--sun)', platinum: 'var(--ice)' };
  return (
    <div className="overlay">
      <div className="topbar"><button className="icon-btn" onClick={nav.back} aria-label="Back"><Icon name="back" size={20} /></button><h2>Badges</h2><span className="px small">{Object.keys(st.badges).length} / {BADGES.length}</span></div>
      <div className="screen">
        <div className="hscroll mb16">{cats.map((c) => <button key={c} className="filter" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {BADGES.filter((b) => b.category === cat).map((b) => {
            const got = st.badges[b.id];
            const p = Math.min(b.goal, b.progress(st));
            return (
              <div key={b.id} className="panel" style={{ margin: 0, opacity: got ? 1 : 0.85, borderColor: got ? tierColor[b.tier] : undefined }}>
                <div style={{ fontSize: 28, color: got ? tierColor[b.tier] : 'var(--smoke)' }} aria-hidden>{got ? '★' : '?'}</div>
                <div className="px" style={{ fontSize: 12 }}>{b.name}</div>
                <div className="small muted">{b.desc}</div>
                <div className="px mt8" style={{ fontSize: 11, color: tierColor[b.tier] }}>{b.tier}</div>
                {got ? <div className="small">Earned {new Date(got).toLocaleDateString()} · +{TIER_FEATHERS[b.tier]}</div>
                  : <><Meter value={p} max={b.goal} tone="river" label={b.name} /><div className="small num mt8">{p}/{b.goal}</div></>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChallengesScreen() {
  const st = useGame((s) => s);
  const nav = useNav();
  const now = new Date();
  const species = speciesCount(st);
  const slots = [
    ...st.challenges.daily.map((d) => ({ slot: d, kind: 'Daily' })),
    ...(st.challenges.weekly ? [{ slot: st.challenges.weekly, kind: 'Weekly' }] : []),
    ...(st.challenges.seasonal ? [{ slot: st.challenges.seasonal, kind: 'Seasonal' }] : []),
  ];
  return (
    <div className="overlay">
      <div className="topbar"><button className="icon-btn" onClick={nav.back} aria-label="Back"><Icon name="back" size={20} /></button><h2>Challenges</h2></div>
      <div className="screen">
        {slots.map(({ slot, kind }) => {
          const p = challengeProgress(st, slot, now);
          return (
            <div key={`${kind}-${slot.id}`} className="panel">
              <div className="row between"><span className="label">{kind}</span><span className="px small" style={{ color: 'var(--accent)' }}>{p.def.xp} XP</span></div>
              <div className="mt8">{p.label}</div>
              <Meter value={p.progress} max={p.goal} tone="river" label={p.label} />
              <div className="row between mt8 small">
                <span className="num">{p.progress}/{p.goal}</span>
                {slot.claimed ? <span className="px" style={{ color: 'var(--lichen)' }}>Claimed</span>
                  : <button className="btn small primary" disabled={!p.done} onClick={() => { const xp = claimChallenge(slot); sfx.sparkle(); nav.toast(`+${xp} XP`); }}>Claim</button>}
              </div>
            </div>
          );
        })}
        {!st.challenges.seasonal && <p className="small muted">No seasonal challenge in high summer. The next one starts with autumn passage.</p>}
        {species < 50 && <p className="small muted">The Big Day challenge type opens at 50 species.</p>}
        <p className="small muted">No leaderboards, no timers on your birds. Daily challenges reset at midnight; one is always quick.</p>
      </div>
    </div>
  );
}

export function YearScreen() {
  const st = useGame((s) => s);
  const nav = useNav();
  const year = new Date().getFullYear();
  const mine = st.sightings.filter((s) => new Date(s.capturedAt).getFullYear() === year);
  const uniq = dedupe(mine.filter(counts));
  const rarest = mine.slice().sort((a, b) => ['common', 'uncommon', 'rare', 'mega', 'legendary'].indexOf(b.rarity) - ['common', 'uncommon', 'rare', 'mega', 'legendary'].indexOf(a.rarity))[0];
  const best = mine.filter((s) => s.fieldcraft).sort((a, b) => b.fieldcraft!.total - a.fieldcraft!.total)[0];
  const patch = Object.entries(mine.reduce<Record<string, number>>((m, s) => ((m[s.habitat] = (m[s.habitat] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="overlay">
      <div className="topbar"><button className="icon-btn" onClick={nav.back} aria-label="Back"><Icon name="back" size={20} /></button><h2>{year} in birds</h2></div>
      <div className="screen">
        {new Date().getMonth() !== 11 && <p className="small muted">The full recap arrives in December. Here is your year so far.</p>}
        <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, padding: 8 }}>
          {uniq.map((s) => <Sprite key={s.id} species={speciesOf(s)} parts={s.sprite.parts} scale={1} mode="static" />)}
          {!uniq.length && <p className="small muted" style={{ gridColumn: '1 / -1' }}>No birds yet this year. The poster fills as you go.</p>}
        </div>
        <div className="panel small">
          <div>Species: <b className="num">{uniq.length}</b></div>
          <div>Catches: <b className="num">{mine.length}</b></div>
          {rarest && <div>Rarest: {displayName(speciesOf(rarest), rarest.region)} (<RarityTag rarity={rarest.rarity} />)</div>}
          {best && <div>Best photo: {displayName(speciesOf(best), best.region)} · {best.fieldcraft!.total}</div>}
          {patch && <div>Most-birded patch: {patch[0]}</div>}
        </div>
        <p className="small muted">Generated on this phone. Nothing is sent anywhere.</p>
      </div>
    </div>
  );
}

export { setState, useMemo };
