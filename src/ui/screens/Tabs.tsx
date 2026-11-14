import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '../nav';
import { useGame, counts, speciesOf, speciesCount, setBiome, buyDecor, placeDecor, toggleHabitatBird, setState, claimChallenge, refreshChallenges, buyFood, collectAviary, fillFeeder, tickFeeder } from '../../app/store';
import { FOODS, Food, hpNow, mood, MOOD_LINE, FEEDER_CAP, AVIARY_MAX, Meal } from '../../core/pets';
import { getRegion, regionLabel } from '../../data/geo';
import { allKnownSpecies } from '../../data/provider';
import { music } from '../../app/audio';
import { Types, BirdThumb, dexNo, BadgeIcon, HpBar } from '../game';
import { PageHeader, Segmented, Alert, FeatherChip } from '../kit';
import { Diorama, DECOR_ITEMS, DECOR_SLOTS } from '../../render/diorama';
import { sunTimes, dayPhase } from '../../core/sun';
import { rankFor, RANKS, liveStreak, dayKey } from '../../core/xp';
import { BADGES, TIER_FEATHERS } from '../../core/badges';
import { challengeProgress } from '../../core/challenges';
import type { Habitat } from '../../data/types';
import { Sprite, Meter, Icon, useReducedMotion, Sheet, RarityTag } from '../components';
import { sfx, haptic, playClip } from '../../app/audio';

// ─── HABITAT (GAM-9): cozy diorama of caught birds; decor bought with Feathers ───
export function HabitatTab() {
  useEffect(() => { music('aviary'); }, []);
  const nav = useNav();
  const st = useGame((s) => s);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dio = useRef<Diorama | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [sheet, setSheet] = useState<'box' | 'decor' | 'fill' | 'shop' | null>(null);
  const [section, setSection] = useState<'birds' | 'feeder' | 'decor'>('birds');
  const [sceneLabel, setSceneLabel] = useState('');
  const [gift, setGift] = useState(0);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [, tick] = useState(0);
  const species = speciesCount(st);
  const region = getRegion(st.region);
  const now = new Date();
  const phase = dayPhase(now, sunTimes(now, region.lat, region.lng));
  const aviary = st.diorama.birds.map((id) => st.sightings.find((s) => s.id === id)).filter(Boolean) as typeof st.sightings;
  const box = st.sightings.filter((s) => !st.diorama.birds.includes(s.id));
  const fill = st.feeder.level / FEEDER_CAP;
  const biomes: { b: Habitat; label: string; need: number }[] = [
    { b: st.habitat, label: 'Home patch', need: 0 },
    ...(['urban', 'woodland', 'water'] as Habitat[]).filter((b) => b !== st.habitat).map((b) => ({ b, label: b === 'urban' ? 'Urban' : b === 'woodland' ? 'Woodland' : 'Wetland', need: 10 })),
  ];

  // birds visit the feeder: on open, every 20s, and right after you fill it
  const runFeeder = () => {
    const m = tickFeeder();
    if (!m.length) return;
    setMeals(m);
    m.forEach((meal, i) => setTimeout(() => dio.current?.visit(meal.id), i * 700));
    sfx.sparkle();
  };
  useEffect(() => {
    setGift(collectAviary());
    const first = setTimeout(runFeeder, 1200);
    const t = setInterval(() => { runFeeder(); tick((x) => x + 1); }, 20000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  useEffect(() => { const w = boxRef.current?.clientWidth ?? 358; setDims({ w: Math.floor(w / 2), h: Math.floor(Math.min(window.innerHeight * 0.46, 480) / 2) }); }, []);
  useEffect(() => {
    if (!dims) return;
    const d = new Diorama(ref.current!, st.diorama.biome, phase, { decor: st.diorama.decor, reduced, viewW: dims.w, viewH: dims.h, feeder: fill });
    dio.current = d;
    setSceneLabel(d.scene.label);
    const partner = st.partner ? allKnownSpecies().find((x) => x.id === st.partner!.speciesId) : null;
    if (partner && st.partner) d.add('partner', partner, st.partner.parts, { arrive: false, seed: 1 });
    aviary.forEach((s, i) => d.add(s.id, speciesOf(s), s.sprite.parts, { arrive: false, seed: i * 7 + 3 }));
    d.start();
    return () => { d.dispose(); dio.current = null; };
  }, [st.diorama.biome, JSON.stringify(st.diorama.decor), aviary.map((p) => p.id).join(), reduced, dims]);
  useEffect(() => { dio.current?.setFeeder(fill); }, [fill]);

  const hungry = aviary.filter((x) => hpNow(x) < 30).length;
  const bags = (Object.keys(FOODS) as Food[]).reduce((n, f) => n + st.items[f], 0);
  const fillOrShop = () => setSheet(bags > 0 ? 'fill' : 'shop');
  return (
    <div className="screen with-tabs">
      <PageHeader title="Aviary" sub={`${aviary.length}/${AVIARY_MAX} birds · feeder ${Math.round(fill * 100)}% full`} right={<FeatherChip />} />
      {hungry > 0 && st.feeder.level < 20 && (
        <Alert action={<button className="btn small primary" onClick={fillOrShop}>{bags > 0 ? 'Fill' : 'Buy food'}</button>}>
          <b>{hungry} bird{hungry > 1 ? 's are' : ' is'} hungry.</b><br />The feeder is {st.feeder.level ? 'almost' : ''} empty.
        </Alert>
      )}
      {gift > 0 && <Alert tone="good">Your healthy birds brought you <b>{gift}</b> Feathers today.</Alert>}
      <div ref={boxRef} style={{ display: 'flex', justifyContent: 'center' }}>
        <canvas ref={ref} className="pix" style={{ width: (dims?.w ?? 0) * 2, maxWidth: '100%', border: '2px solid #000', boxShadow: '4px 4px 0 #000' }} role="img"
          aria-label={`Aviary with ${aviary.length} birds and a feeder ${Math.round(fill * 100)}% full`} />
      </div>
      {meals.length > 0 && <div className="small mt8" role="status" style={{ color: 'var(--lichen)' }}>{meals.map((m) => `${speciesOf(st.sightings.find((x) => x.id === m.id)!).common} ate (+${m.ate} HP)`).join(' · ')}</div>}

      <Segmented label="Aviary sections" value={section} onChange={setSection} options={[
        { id: 'birds', label: 'Birds', badge: hungry || undefined },
        { id: 'feeder', label: 'Feeder', badge: st.feeder.level < 20 },
        { id: 'decor', label: 'Decor' },
      ]} />

      {section === 'birds' && (
        <section aria-label="Birds in your aviary">
          {aviary.length === 0 && <p className="small muted">Photograph a real bird to bring your first pet home. Your partner is waiting here.</p>}
          {aviary.slice().sort((a, b) => hpNow(a) - hpNow(b)).map((x) => {
            const hp = hpNow(x);
            return (
              <button key={x.id} className="panel" style={{ width: '100%', padding: 8, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', borderColor: hp < 30 ? 'var(--brick)' : undefined }}
                onClick={() => nav.open({ name: 'species', id: x.speciesId ?? '_unknown', sightingId: x.id })}>
                <span style={{ background: 'var(--slate)', border: '2px solid #000' }}><Sprite species={speciesOf(x)} parts={x.sprite.parts} scale={2} mode={hp < 30 ? 'static' : 'idle'} /></span>
                <span className="grow">
                  <span className="row between"><span className="name small">{speciesOf(x).common}</span><span className="px" style={{ fontSize: 10 }}>Lv{x.level ?? 5}</span></span>
                  <HpBar hp={hp} />
                  <span className="small" style={{ color: hp < 30 ? 'var(--oriole)' : 'var(--stone)' }}>{MOOD_LINE[mood(hp)]}</span>
                </span>
              </button>
            );
          })}
          <button className="btn block" onClick={() => setSheet('box')}>Bird Box · {box.length} resting</button>
          <p className="small muted">Aviary birds eat from the feeder and earn you Feathers. Birds in the Bird Box rest and don't get hungry.</p>
        </section>
      )}

      {section === 'feeder' && (
        <section aria-label="Bird feeder">
          <div className="panel">
            <div className="row between"><span className="label">Feeder level</span><span className="num small">{st.feeder.level}/{FEEDER_CAP}</span></div>
            <div style={{ height: 16, background: '#000', border: '2px solid #000', position: 'relative', marginTop: 6 }} role="meter" aria-label="Feeder level" aria-valuemin={0} aria-valuemax={FEEDER_CAP} aria-valuenow={st.feeder.level}>
              <i style={{ position: 'absolute', inset: '0 auto 0 0', width: `${fill * 100}%`, background: fill > 0.25 ? 'var(--warbler)' : 'var(--oriole)', transition: 'width 500ms steps(10)' }} />
            </div>
            <p className="small" style={{ margin: '8px 0 0' }}>
              {st.feeder.level === 0 ? 'Empty. Your birds will go hungry until you fill it.'
                : `About ${Math.max(1, Math.round(st.feeder.level / Math.max(1, aviary.length * 17)))} day(s) of food for ${aviary.length || 1} bird${aviary.length === 1 ? '' : 's'}. Hungry birds fly in and eat by themselves.`}
            </p>
          </div>
          <div className="section-title"><span>Pantry</span><span>{bags} bag{bags === 1 ? '' : 's'}</span></div>
          <div className="row" style={{ gap: 8 }}>
            {(Object.keys(FOODS) as Food[]).map((f) => (
              <div key={f} className="grow" style={{ textAlign: 'center', background: '#000', border: '2px solid var(--slate)', padding: 6 }}>
                <div style={{ fontSize: 22 }} aria-hidden>{FOODS[f].icon}</div>
                <div className="small">{FOODS[f].name}</div><div className="num" style={{ color: 'var(--accent)' }}>×{st.items[f]}</div>
              </div>
            ))}
          </div>
          <div className="row mt16">
            <button className="btn primary grow" onClick={() => setSheet('fill')} disabled={st.feeder.level >= FEEDER_CAP || bags === 0}>Fill feeder</button>
            <button className="btn grow" onClick={() => setSheet('shop')}>Food shop</button>
          </div>
          <p className="small muted">Buy food with Feathers. Earn Feathers by photographing real birds: +20 for a new species, +12 for a repeat.</p>
        </section>
      )}

      {section === 'decor' && (
        <section aria-label="Decor and scene">
          <div className="section-title" style={{ marginTop: 0 }}><span>Scene</span><span className="small muted" style={{ textTransform: 'none', fontFamily: 'var(--body)' }}>{sceneLabel}</span></div>
          <div className="hscroll">
            {biomes.map(({ b, label, need }) => (
              <button key={b} className="filter" aria-pressed={st.diorama.biome === b} disabled={species < need} onClick={() => setBiome(b)}>{label}{species < need ? ` · ${need} sp.` : ''}</button>
            ))}
          </div>
          <div className="section-title"><span>Decor</span><span>{Object.keys(st.diorama.decor).length}/{DECOR_SLOTS.length - 1}</span></div>
          <button className="btn block" onClick={() => setSheet('decor')} disabled={species < 25}>Decorate</button>
          {species < 25 && <p className="small muted">Decor opens at 25 species ({species} so far). Other scenes open at 10.</p>}
        </section>
      )}

      {sheet === 'fill' && (
        <Sheet onClose={() => setSheet(null)} label="Fill the feeder">
          <div className="row between mb8"><h3>Fill the feeder</h3><span className="num small">{st.feeder.level}/{FEEDER_CAP}</span></div>
          {(Object.keys(FOODS) as Food[]).map((f) => (
            <button key={f} className="srow" disabled={st.items[f] <= 0 || st.feeder.level >= FEEDER_CAP} style={{ opacity: st.items[f] <= 0 ? 0.45 : 1 }}
              onClick={() => { const n = fillFeeder(f); if (n) { sfx.page(); haptic(12); nav.toast(`Poured ${FOODS[f].name} into the feeder (+${n})`); setTimeout(runFeeder, 600); } }}>
              <span style={{ fontSize: 26 }} aria-hidden>{FOODS[f].icon}</span>
              <span className="grow"><span className="name">{FOODS[f].name}</span><br /><span className="small muted">{FOODS[f].desc}</span></span>
              <span className="num">×{st.items[f]}</span>
            </button>
          ))}
          {(Object.keys(FOODS) as Food[]).every((f) => st.items[f] <= 0) && (
            <>
              <p className="small">Your pantry is empty. Buy food with the Feathers you earn by discovering birds.</p>
              <button className="btn primary block" onClick={() => setSheet('shop')}>Go to the food shop</button>
            </>
          )}
        </Sheet>
      )}
      {sheet === 'shop' && (
        <Sheet onClose={() => setSheet(null)} label="Food shop">
          <div className="row between mb8"><h3>Food shop</h3><span className="chip"><Icon name="feather" size={12} color="var(--sky)" />{st.feathers}</span></div>
          {(Object.keys(FOODS) as Food[]).map((f) => (
            <div key={f} className="srow">
              <span style={{ fontSize: 26 }} aria-hidden>{FOODS[f].icon}</span>
              <span className="grow"><span className="name">{FOODS[f].name}</span> <span className="small muted">· have {st.items[f]}</span><br /><span className="small muted">{FOODS[f].desc}</span></span>
              <button className="btn small primary" disabled={st.feathers < FOODS[f].price} onClick={() => { if (buyFood(f)) { playClip('buy'); nav.toast(`Bought ${FOODS[f].name}`); } else sfx.error(); }}>
                {FOODS[f].price} <Icon name="feather" size={10} color="var(--accent-ink)" />
              </button>
            </div>
          ))}
          <p className="small muted">Earn Feathers by discovering real birds (+12, or +20 for a new species), finishing quests, earning badges, and keeping your Aviary healthy.</p>
          <button className="btn block" onClick={() => setSheet('fill')}>Fill the feeder</button>
        </Sheet>
      )}
      {sheet === 'box' && (
        <Sheet onClose={() => setSheet(null)} label="Bird Box">
          <h3 className="mb8">Bird Box · {box.length}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Birds resting here don't get hungry. Up to {AVIARY_MAX} birds can live in the Aviary, where they eat from the feeder and earn you Feathers.</p>
          {[...aviary, ...box].map((s) => {
            const here = st.diorama.birds.includes(s.id);
            return (
              <div key={s.id} className="srow">
                <Sprite species={speciesOf(s)} parts={s.sprite.parts} scale={1} mode="static" />
                <span className="grow"><span className="name">{speciesOf(s).common}</span><br /><span style={{ display: 'block', width: 120 }}><HpBar hp={hpNow(s)} compact /></span></span>
                <button className="btn small" onClick={() => { if (!toggleHabitatBird(s.id)) nav.toast(`The Aviary holds ${AVIARY_MAX} birds. Move one to the Bird Box first.`); }}>{here ? 'To box' : 'To aviary'}</button>
              </div>
            );
          })}
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
                {!owned ? <button className="btn small" disabled={st.feathers < d.price} onClick={() => { if (buyDecor(d.key, d.price)) { playClip('buy'); placeDecor(slots.find((x) => !st.diorama.decor[x]) ?? slots[0], d.key); } }}>Buy</button>
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
  useEffect(() => { music('explore'); refreshChallenges(new Date()); }, []);
  const rank = rankFor(st.xp);
  const streak = liveStreak(st.streak, dayKey(new Date()));
  const earned = Object.keys(st.badges).length;
  const partner = st.partner ? allKnownSpecies().find((x) => x.id === st.partner!.speciesId) : null;
  const region = getRegion(st.region);
  const life = dedupe(st.sightings.filter(counts));
  const now = new Date();
  const slots = [
    ...st.challenges.daily.map((d) => ({ slot: d, kind: 'Daily' })),
    ...(st.challenges.weekly ? [{ slot: st.challenges.weekly, kind: 'Weekly' }] : []),
    ...(st.challenges.seasonal ? [{ slot: st.challenges.seasonal, kind: 'Seasonal' }] : []),
  ];
  const claimable = slots.filter(({ slot }) => !slot.claimed && challengeProgress(st, slot, now).done).length;
  const [section, setSection] = useState<'quests' | 'badges' | 'life'>(claimable ? 'quests' : 'quests');
  const cats = ['Firsts', 'Taxonomy', 'Place', 'Craft', 'Care', 'Time', 'Dedication'] as const;
  const tierColor = { bronze: 'var(--rust)', silver: 'var(--stone)', gold: 'var(--sun)', platinum: 'var(--ice)' };
  return (
    <div className="screen with-tabs">
      <PageHeader title="Trainer" right={<><FeatherChip /><button className="icon-btn" aria-label="Settings" onClick={() => nav.open({ name: 'settings' })}><Icon name="gear" size={22} /></button></>} />
      <div className="panel" style={{ background: 'linear-gradient(135deg, #1B2229, #11151A 60%)', borderColor: 'var(--accent)' }}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          {partner && st.partner && <div style={{ background: 'var(--slate)', border: '2px solid #000' }}><Sprite species={partner} parts={st.partner.parts} scale={3} /></div>}
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18 }}>{st.trainerName || 'Trainer'}</h2>
            <div className="small muted">{region.flag} {regionLabel(st.region)}</div>
            <div className="mt8"><span className="chip sun">Lv {rank.index + 1}</span> <span className="px small">{rank.name}</span></div>
            {partner && <div className="small mt8">Partner: <b>{partner.common}</b></div>}
          </div>
        </div>
        <div className="mt16"><Meter value={rank.progress * 100} tone="sun" label="Progress to next level" /></div>
        <div className="row between small mt8"><span className="num">{st.xp} XP</span><span className="muted">{rank.next ? `Lv ${rank.index + 2} at ${rank.next.xp}` : 'Max level'}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', marginTop: 12, borderTop: '2px solid #000', paddingTop: 10 }}>
          <div><div className="num" style={{ fontSize: 16 }}>{life.length}</div><div className="label" style={{ fontSize: 10 }}>Species</div></div>
          <div><div className="num" style={{ fontSize: 16 }}>{st.sightings.length}</div><div className="label" style={{ fontSize: 10 }}>Sightings</div></div>
          <div><div className="num" style={{ fontSize: 16 }}>{streak.days}</div><div className="label" style={{ fontSize: 10 }}>Streak</div></div>
          <div><div className="num" style={{ fontSize: 16 }}>{earned}</div><div className="label" style={{ fontSize: 10 }}>Badges</div></div>
        </div>
      </div>

      <Segmented label="Trainer sections" value={section} onChange={setSection} options={[
        { id: 'quests', label: 'Quests', badge: claimable || undefined },
        { id: 'badges', label: `Badges` },
        { id: 'life', label: 'Life list' },
      ]} />

      {section === 'quests' && (
        <section aria-label="Quests">
          {slots.map(({ slot, kind }) => {
            const p = challengeProgress(st, slot, now);
            const ready = p.done && !slot.claimed;
            return (
              <div key={`${kind}-${slot.id}`} className={`panel ${ready ? 'highlight' : ''}`} style={{ padding: 10 }}>
                <div className="row between"><span className="label" style={{ fontSize: 11 }}>{kind}</span><span className="px small" style={{ color: 'var(--accent)' }}>+{p.def.xp} XP</span></div>
                <div className="mt8" style={{ fontWeight: 600 }}>{p.label}</div>
                <div className="row mt8" style={{ gap: 10 }}>
                  <div className="grow"><Meter value={p.progress} max={p.goal} tone="river" label={p.label} /></div>
                  {slot.claimed ? <span className="px small" style={{ color: 'var(--lichen)' }}>✓ Done</span>
                    : ready ? <button className="btn small primary" onClick={() => { const xp = claimChallenge(slot); sfx.levelUp(); nav.toast(`Quest complete! +${xp} XP · +${Math.round(xp / 10)} Feathers`); }}>Claim</button>
                      : <span className="num small">{p.progress}/{p.goal}</span>}
                </div>
              </div>
            );
          })}
          <p className="small muted">Daily quests reset at midnight and one is always quick. Quests pay XP and Feathers.</p>
        </section>
      )}

      {section === 'badges' && (
        <section aria-label="Badges">
          <div className="small muted mb8">{earned} of {BADGES.length} earned. Tap a category to see what's next.</div>
          {cats.map((c) => (
            <div key={c}>
              <div className="section-title"><span>{c}</span><span>{BADGES.filter((b) => b.category === c && st.badges[b.id]).length}/{BADGES.filter((b) => b.category === c).length}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {BADGES.filter((b) => b.category === c).map((b) => {
                  const got = st.badges[b.id]; const p = Math.min(b.goal, b.progress(st));
                  return (
                    <div key={b.id} title={`${b.name}: ${b.desc}`} style={{ textAlign: 'center', background: '#0D1014', border: `2px solid ${got ? tierColor[b.tier] : '#000'}`, padding: '6px 2px' }}>
                      <BadgeIcon icon={b.icon} earned={!!got} size={44} label={`${b.name}, ${b.desc}, ${got ? 'earned' : `${p} of ${b.goal}`}`} />
                      <div style={{ fontSize: 10, lineHeight: '12px', marginTop: 2 }}>{b.name}</div>
                      <div className="num" style={{ fontSize: 9, color: got ? tierColor[b.tier] : 'var(--ash)' }}>{got ? b.tier : `${p}/${b.goal}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {section === 'life' && (
        <section aria-label="Life list">
          {life.length === 0 && <p className="small muted">Your life list starts with your first identified discovery.</p>}
          {life.map((s) => (
            <button key={s.id} className="srow" onClick={() => nav.open({ name: 'species', id: s.speciesId! })}>
              <BirdThumb sp={speciesOf(s)} size={40} />
              <span className="grow"><span className="name">{speciesOf(s).common}</span><br /><span className="small muted">{dexNo(s.dex)} · Lv {s.level ?? 5} · {new Date(s.capturedAt).toLocaleDateString()} · {getRegion(s.region).name}</span></span>
              <RarityTag rarity={s.rarity} showLabel={false} />
            </button>
          ))}
          <button className="btn block mt16" onClick={() => nav.open({ name: 'year' })}>Your year in birds</button>
        </section>
      )}
    </div>
  );
}

function BadgeStrip() {
  const st = useGame((s) => s);
  return (
    <div className="panel" style={{ padding: 10 }}>
      <div className="label mb8">Badge case</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, justifyItems: 'center' }}>
        {BADGES.map((b) => <BadgeIcon key={b.id} icon={b.icon} earned={!!st.badges[b.id]} size={44} label={`${b.name}${st.badges[b.id] ? ', earned' : ', not yet earned'}`} />)}
      </div>
    </div>
  );
}

export function BadgesScreen() {
  const st = useGame((s) => s);
  const nav = useNav();
  const cats = ['Firsts', 'Taxonomy', 'Place', 'Craft', 'Care', 'Time', 'Dedication'] as const;
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
                <BadgeIcon icon={b.icon} earned={!!got} size={64} />
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
          <div>Sightings: <b className="num">{mine.length}</b></div>
          {rarest && <div>Rarest: {speciesOf(rarest).common} (<RarityTag rarity={rarest.rarity} />)</div>}
          {best && <div>Best photo: {speciesOf(best).common} · {best.fieldcraft!.total}</div>}
          {patch && <div>Most-birded patch: {patch[0]}</div>}
        </div>
        <p className="small muted">Generated on this phone. Nothing is sent anywhere.</p>
      </div>
    </div>
  );
}

export { setState, useMemo };
