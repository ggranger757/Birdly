import { useEffect, useMemo, useState } from 'react';
import { useNav } from '../nav';
import { useGame, counts, speciesOf, logEvent } from '../../app/store';
import { getRegion } from '../../data/geo';
import { regionEntries, ensureRegion, onProviderChange, providerStatus } from '../../data/provider';
import { typesOf, BirdType, GROUP_PLURAL, GROUP_TYPES, PLACE_TYPES } from '../../core/rarity';
import { Segmented } from '../kit';
import type { Sighting } from '../../core/model';
import { Sprite, Meter, VERIFY_META, formatDate } from '../components';
import { Types, dexNo, HpBar } from '../game';
import { PageHeader, FeatherChip } from '../kit';
import { hpNow } from '../../core/pets';
import { HEX } from '../../core/palette';

type Filter = 'all' | 'found' | 'missing';

export function Dex() {
  const nav = useNav();
  const st = useGame((s) => s);
  const [, force] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState<BirdType | ''>('');
  const [place, setPlace] = useState<BirdType | ''>('');
  const [q, setQ] = useState('');
  useEffect(() => { logEvent('journal_open'); ensureRegion(st.region); return onProviderChange(() => force((x) => x + 1)); }, [st.region]);
  useEffect(() => { if (nav.highlight) { const t = setTimeout(() => nav.setHighlight(null), 2600); return () => clearTimeout(t); } }, [nav.highlight]);

  const region = getRegion(st.region);
  const entries = regionEntries(st.region);
  const mine = useMemo(() => {
    const m = new Map<string, Sighting[]>();
    for (const s of st.sightings) if (s.speciesId && counts(s)) { const a = m.get(s.speciesId) ?? []; a.push(s); m.set(s.speciesId, a); }
    return m;
  }, [st.sightings]);
  const have = entries.filter((e) => mine.has(e.sp.id)).length;
  const outside = [...mine.keys()].filter((id) => !entries.some((e) => e.sp.id === id));
  const pending = st.sightings.filter((s) => !counts(s));
  const present = new Set(entries.flatMap((e) => typesOf(e.sp)));
  const groups = GROUP_TYPES.filter((t) => present.has(t));
  // each group: how many birds, and the most familiar local example, so the menu explains itself
  const groupInfo = (t: BirdType) => {
    const list = entries.filter((e) => typesOf(e.sp)[0] === t);
    return { n: list.length, example: list[0]?.sp.common };
  };

  const shown = entries.filter((e) => {
    const caught = mine.has(e.sp.id);
    if (filter === 'found' && !caught) return false;
    if (filter === 'missing' && caught) return false;
    if (group && typesOf(e.sp)[0] !== group) return false;
    if (place && !(e.sp.habitats.includes(place === 'City' ? 'urban' : place === 'Forest' ? 'woodland' : 'water'))) return false;
    if (q && !(caught && `${e.sp.common} ${e.sp.sci}`.toLowerCase().includes(q.toLowerCase())) && !String(e.dex).includes(q)) return false;
    return true;
  });

  return (
    <div className="screen with-tabs">
      <PageHeader title="BirdDex" sub={`${region.flag ?? ''} ${region.name} · ${have} of ${entries.length} discovered`} right={<FeatherChip />} />
      <div className="panel" style={{ padding: 10 }}>
        <Meter value={have} max={Math.max(1, entries.length)} tone="sun" label="BirdDex completion" />
        <div className="row between small mt8"><span className="muted">{entries.length - have} still to find here</span><span>Life list <b className="num">{mine.size}</b></span></div>
        {providerStatus(st.region) === 'loading' && <div className="small muted mt8">Updating the list for {region.name}…</div>}
      </div>

      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your birds or a dex number" aria-label="Search BirdDex"
        style={{ width: '100%', minHeight: 44, padding: '6px 12px', background: '#000', border: '2px solid var(--smoke)', marginBottom: 8 }} />
      <Segmented label="Show" value={filter} onChange={setFilter} options={[
        { id: 'all', label: `All ${entries.length}` }, { id: 'found', label: `Found ${have}` }, { id: 'missing', label: `Missing ${entries.length - have}` },
      ]} />
      <div className="row" style={{ gap: 8 }}>
        <label className="grow"><span className="sr-only">Bird group</span>
          <select className="filter" style={{ width: '100%' }} value={group} onChange={(e) => setGroup(e.target.value as BirdType | '')}>
            <option value="">All bird groups</option>
            {groups.map((t) => { const g = groupInfo(t); return <option key={t} value={t}>{GROUP_PLURAL[t]} · {g.n}{g.example ? ` (e.g. ${g.example})` : ''}</option>; })}
          </select>
        </label>
        <label className="grow"><span className="sr-only">Where they live</span>
          <select className="filter" style={{ width: '100%' }} value={place} onChange={(e) => setPlace(e.target.value as BirdType | '')}>
            <option value="">Anywhere</option>
            {PLACE_TYPES.map((t) => <option key={t} value={t}>{t === 'City' ? 'City & gardens' : t === 'Forest' ? 'Parks & woods' : 'Water & shore'}</option>)}
          </select>
        </label>
      </div>
      {(group || place) && <button className="link" onClick={() => { setGroup(''); setPlace(''); }}>Clear filters</button>}

      {pending.length > 0 && (
        <section className="panel dashed mt8" aria-label="Unidentified discoveries">
          <div className="label mb8">Waiting for a name · {pending.length}</div>
          <div className="hscroll">
            {pending.map((s) => (
              <button key={s.id} className="jcell" style={{ width: 80, flex: 'none' }} onClick={() => nav.open({ name: 'species', id: s.speciesId ?? '_unknown', sightingId: s.id })}
                aria-label={`${s.speciesId ? speciesOf(s).common : 'Unidentified bird'}, ${VERIFY_META[s.verification].label}, ${formatDate(s.capturedAt)}`}>
                <Sprite species={speciesOf(s)} parts={s.sprite.parts} scale={2} mode="static" />
                <span className="cap">{s.speciesId ? speciesOf(s).common : '???'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {st.sightings.length === 0 && <p className="small muted">Your BirdDex is empty. Photograph a real bird to discover entry #001.</p>}
      {shown.length === 0 ? <p className="small muted mt16">Nothing matches. Loosen a filter?</p> : (
        <ul className="jgrid mt8" aria-label={`${region.name} BirdDex`} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {shown.map((e) => {
            const s = mine.get(e.sp.id)?.[0];
            if (!s) {
              return (
                <li key={e.sp.id}>
                  <button className="jcell missing" onClick={() => nav.open({ name: 'species', id: e.sp.id })} aria-label={`${dexNo(e.dex)}, not discovered yet`}>
                    <span className="dexno" style={{ alignSelf: 'flex-start' }}>{dexNo(e.dex)}</span>
                    <Sprite species={e.sp} mode="silhouette" scale={2} />
                    <span className="cap muted">???</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={e.sp.id}>
                <button className={`jcell ${nav.highlight && mine.get(e.sp.id)!.some((x) => x.id === nav.highlight) ? 'fresh' : ''}`}
                  style={{ background: `linear-gradient(${HEX[s.sprite.bg]}55, var(--plum) 70%)` }}
                  onClick={() => nav.open({ name: 'species', id: e.sp.id })} aria-label={`${dexNo(e.dex)} ${e.sp.common}, discovered ${formatDate(s.capturedAt)}`}>
                  <span className="dexno" style={{ alignSelf: 'flex-start', color: 'var(--accent)' }}>{dexNo(e.dex)}</span>
                  <Sprite species={e.sp} parts={s.sprite.parts} scale={2} mode={nav.highlight === s.id ? 'idle' : 'static'} />
                  <span className="cap">{e.sp.common}</span>
                  <span style={{ width: '80%', marginTop: 2 }}><HpBar hp={hpNow(s)} compact /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {outside.length > 0 && <p className="small muted mt16">+ {outside.length} birds discovered in other regions (see your life list on the Trainer tab).</p>}
      <p className="small muted mt16">Local list: species with research-grade iNaturalist records in {region.name}.</p>
    </div>
  );
}
