import { useEffect, useMemo, useState } from 'react';
import { useNav } from '../nav';
import { useGame, counts, speciesOf, logEvent } from '../../app/store';
import { REGIONS, REGION_BY_CODE } from '../../data/regions';
import { SPECIES, displayName } from '../../data/species';
import type { Species } from '../../data/types';
import { regionSpecies, lns, rarityOf, RARITY_META, Rarity } from '../../core/rarity';
import type { Sighting } from '../../core/model';
import { Sprite, RarityTag, Meter, VERIFY_META, formatDate } from '../components';
import { HEX } from '../../core/palette';

type Filter = 'all' | 'caught' | 'missing' | 'rare';
type Sort = 'taxonomic' | 'recent' | 'rarity' | 'alpha' | 'closest';

const HAB_HINT: Record<string, string> = { urban: 'Gardens and streets', woodland: 'Trees and parks', water: 'Water and shore' };
const RANK: Rarity[] = ['common', 'uncommon', 'rare', 'mega', 'legendary'];

export function Journal() {
  const nav = useNav();
  const st = useGame((s) => s);
  const [regionCode, setRegionCode] = useState(st.region);
  const [filter, setFilter] = useState<Filter>('all');
  const [family, setFamily] = useState('');
  const [habitat, setHabitat] = useState('');
  const [sort, setSort] = useState<Sort>('taxonomic');
  useEffect(() => { logEvent('journal_open'); }, []);
  useEffect(() => { if (nav.highlight) { const t = setTimeout(() => nav.setHighlight(null), 2600); return () => clearTimeout(t); } }, [nav.highlight]);

  const region = REGION_BY_CODE[regionCode];
  const list = regionSpecies(regionCode);
  const now = new Date();
  const bySpecies = useMemo(() => {
    const m = new Map<string, Sighting[]>();
    for (const s of st.sightings) if (s.speciesId && counts(s)) { const a = m.get(s.speciesId) ?? []; a.push(s); m.set(s.speciesId, a); }
    return m;
  }, [st.sightings]);
  const caughtHere = list.filter((sp) => bySpecies.get(sp.id)?.some((x) => x.region === regionCode) || bySpecies.has(sp.id));
  const families = [...new Set(list.map((s) => s.familyName))].sort();
  const famProgress = families.map((f) => {
    const all = list.filter((s) => s.familyName === f);
    return { f, have: all.filter((s) => bySpecies.has(s.id)).length, total: all.length };
  });
  const famDone = famProgress.filter((f) => f.have === f.total).length;
  const lifeList = new Set(st.sightings.filter(counts).map((s) => s.speciesId)).size;
  const pending = st.sightings.filter((s) => !counts(s));

  const rarityNow = (sp: Species) => rarityOf(lns(sp, region, now, st.habitat));
  let shown = list.filter((sp) => {
    const caught = bySpecies.has(sp.id);
    if (filter === 'caught' && !caught) return false;
    if (filter === 'missing' && caught) return false;
    if (filter === 'rare' && RANK.indexOf(rarityNow(sp)) < 2) return false;
    if (family && sp.familyName !== family) return false;
    if (habitat && !sp.habitats.includes(habitat as any)) return false;
    return true;
  });
  const order = SPECIES.map((s) => s.id);
  const latest = (sp: Species) => bySpecies.get(sp.id)?.[0];
  shown = shown.slice().sort((a, b) => {
    switch (sort) {
      case 'alpha': return displayName(a, regionCode).localeCompare(displayName(b, regionCode));
      case 'recent': return (latest(b)?.capturedAt ?? '').localeCompare(latest(a)?.capturedAt ?? '');
      case 'rarity': return RANK.indexOf(rarityNow(b)) - RANK.indexOf(rarityNow(a));
      case 'closest': {
        const fp = (s: Species) => { const f = famProgress.find((x) => x.f === s.familyName)!; return f.have / f.total; };
        return fp(b) - fp(a) || a.familyName.localeCompare(b.familyName);
      }
      default: return a.order.localeCompare(b.order) || a.family.localeCompare(b.family) || order.indexOf(a.id) - order.indexOf(b.id);
    }
  });
  const closest = famProgress.filter((f) => f.have > 0 && f.have < f.total).sort((a, b) => b.have / b.total - a.have / a.total).slice(0, 3);

  return (
    <div className="screen with-tabs">
      <header className="row between">
        <h1 style={{ fontSize: 18 }}>Journal</h1>
        <span className="px small" style={{ color: 'var(--accent)' }}>{region.code} · {caughtHere.length}/{list.length}</span>
      </header>
      {/* COL-5: three meters, never a single global percentage */}
      <div className="panel mt8" style={{ padding: 10 }}>
        <div className="row between small"><span>{region.name}</span><span className="num">{caughtHere.length} of {list.length}</span></div>
        <Meter value={caughtHere.length} max={list.length} tone="sun" label={`${region.name} completion`} />
        <div className="row between small mt8"><span>Families complete</span><span className="num">{famDone} of {families.length}</span></div>
        <Meter value={famDone} max={families.length} tone="river" label="Family completion" />
        <div className="row between small mt8"><span>Life list</span><span className="num">{lifeList}</span></div>
      </div>

      <div className="hscroll" role="group" aria-label="Filters">
        {(['all', 'caught', 'missing', 'rare'] as Filter[]).map((f) => (
          <button key={f} className="filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'rare' ? 'Rare+' : f}</button>
        ))}
        <select className="filter" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Family">
          <option value="">Family</option>{families.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="filter" value={habitat} onChange={(e) => setHabitat(e.target.value)} aria-label="Habitat">
          <option value="">Habitat</option><option value="urban">Urban</option><option value="woodland">Woodland</option><option value="water">Water</option>
        </select>
        <select className="filter" value={regionCode} onChange={(e) => setRegionCode(e.target.value)} aria-label="Region">
          {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
        </select>
        <select className="filter" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="taxonomic">Taxonomic</option><option value="recent">Recent</option><option value="rarity">Rarity</option><option value="alpha">A–Z</option><option value="closest">Closest to complete</option>
        </select>
      </div>

      {pending.length > 0 && (
        <section className="panel dashed mt8" aria-label="Unidentified and vagrant catches">
          <div className="label mb8">Waiting for a name · {pending.length}</div>
          <div className="hscroll">
            {pending.map((s) => (
              <button key={s.id} className="jcell" style={{ width: 76, flex: 'none' }} onClick={() => nav.open({ name: 'species', id: s.speciesId ?? '_unknown', sightingId: s.id })}
                aria-label={`${s.speciesId ? speciesOf(s).common : 'Unidentified bird'}, ${VERIFY_META[s.verification].label}, ${formatDate(s.capturedAt)}`}>
                <Sprite species={speciesOf(s)} parts={s.sprite.parts} scale={2} mode="static" />
                <span className="stamp" style={{ color: 'var(--oriole)' }}>{VERIFY_META[s.verification].short}</span>
                <span className="cap">{s.speciesId ? displayName(speciesOf(s), s.region) : '???'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {st.sightings.length === 0 && <p className="small muted">No birds filed yet. Your first one is twenty seconds away.</p>}
      {shown.length === 0 ? (
        <p className="small muted mt16">Nothing matches. Loosen a filter?</p>
      ) : (
        <ul className="jgrid mt8" aria-label={`${region.name} species`}>
          {shown.map((sp) => {
            const mine = bySpecies.get(sp.id);
            const s = mine?.[0];
            const r = rarityNow(sp);
            if (!s) {
              return (
                <li key={sp.id}>
                  <button className="jcell missing" onClick={() => nav.open({ name: 'species', id: sp.id })} aria-label={`Not yet seen. ${HAB_HINT[sp.habitats[0]]}. ${RARITY_META[r].label} here now.`}>
                    <Sprite species={sp} mode="silhouette" scale={2} />
                    <span className="glyph" aria-hidden style={{ color: 'var(--smoke)' }}>{RARITY_META[r].glyph}</span>
                    <span className="cap muted">???<br /><span style={{ fontSize: 10 }}>{HAB_HINT[sp.habitats[0]]}</span></span>
                  </button>
                </li>
              );
            }
            const label = `${displayName(sp, regionCode)}, ${RARITY_META[s.rarity].label.toLowerCase()}, caught ${formatDate(s.capturedAt, { month: 'long', day: 'numeric' })}, ${mine!.length} ${mine!.length === 1 ? 'photo' : 'photos'}`;
            return (
              <li key={sp.id}>
                <button className={`jcell ${nav.highlight && mine!.some((x) => x.id === nav.highlight) ? 'fresh' : ''}`} style={{ background: HEX[s.sprite.bg] === '#14121F' ? undefined : 'var(--plum)' }}
                  onClick={() => nav.open({ name: 'species', id: sp.id })} aria-label={label}>
                  <Sprite species={sp} parts={s.sprite.parts} scale={2} mode={nav.highlight === s.id ? 'idle' : 'static'} />
                  <span className="glyph" aria-hidden><RarityTag rarity={s.rarity} showLabel={false} /></span>
                  <span className="stamp" aria-hidden style={{ color: s.verification === 'verified' ? 'var(--lichen)' : 'var(--stone)' }}>{VERIFY_META[s.verification].short}</span>
                  <span className="cap">{displayName(sp, regionCode)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {closest.length > 0 && (
        <section className="mt24" aria-label="Closest to complete">
          <div className="label mb8">Closest to complete</div>
          {closest.map((f) => (
            <div key={f.f} className="mb8">
              <div className="row between small"><span>{f.f}</span><span className="num">{f.have}/{f.total}</span></div>
              <Meter value={f.have} max={f.total} tone="river" label={f.f} />
            </div>
          ))}
        </section>
      )}
      {list.length < 20 && <p className="small muted">Limited data for this region. The seed list covers its common and notable birds only.</p>}
    </div>
  );
}
