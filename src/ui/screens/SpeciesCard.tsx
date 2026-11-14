import { useEffect, useState } from 'react';
import { useNav } from '../nav';
import { useGame, plumagesOf, deletePhotoKeepSprite, toggleHabitatBird, identifySighting, deleteSighting, counts } from '../../app/store';
import { SPECIES_BY_ID, displayName, SPECIES } from '../../data/species';
import { REGION_BY_CODE } from '../../data/regions';
import { UNKNOWN } from '../../core/model';
import { lns, rarityOf, regionSpecies } from '../../core/rarity';
import { photoURL } from '../../app/db';
import { Sprite, RarityTag, TopBar, VERIFY_META, formatDate, RefPhotoCard, Icon, Sheet, Meter } from '../components';
import { HEX } from '../../core/palette';

const HAB_LABEL: Record<string, string> = { urban: 'Urban & suburban', woodland: 'Woodland', water: 'Water & wetland' };

export function SpeciesCard({ id, sightingId }: { id: string; sightingId?: string }) {
  const nav = useNav();
  const st = useGame((s) => s);
  const sp = SPECIES_BY_ID[id] ?? UNKNOWN;
  const mine = st.sightings.filter((x) => (id === '_unknown' ? x.id === sightingId : x.speciesId === id));
  const plumages = id === '_unknown' ? mine : plumagesOf(st, id);
  const [sel, setSel] = useState<string | undefined>(sightingId ?? plumages[0]?.id ?? mine[0]?.id);
  const cur = mine.find((x) => x.id === sel) ?? mine[0];
  const [photo, setPhoto] = useState<string | null>(null);
  const [identify, setIdentify] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { let live = true; photoURL(cur?.photoId ?? null).then((u) => live && setPhoto(u)); return () => { live = false; }; }, [cur?.photoId]);

  const region = REGION_BY_CODE[st.region];
  const rarity = sp.occ[st.region] ? rarityOf(lns(sp, region, new Date(), st.habitat)) : null;
  const regionsSeen = Object.keys(sp.occ);
  const inHab = cur ? st.diorama.birds.includes(cur.id) : false;

  return (
    <div className="overlay">
      <TopBar title={cur ? displayName(sp, cur.region) : displayName(sp, st.region)} onBack={nav.back}
        right={cur && <button className="icon-btn" aria-label="Open journal spread" onClick={() => nav.open({ name: 'spread', sightingId: cur.id })}><Icon name="journal" size={20} /></button>} />
      <div className="screen">
        <div style={{ background: cur ? HEX[cur.sprite.bg] : 'var(--plum)', border: '2px solid var(--ink)', boxShadow: '4px 4px 0 #000', display: 'flex', justifyContent: 'center', padding: 8 }}>
          {cur ? <Sprite species={sp} parts={cur.sprite.parts} scale={6} mode={cur.sprite.pose === 'flight' ? 'fly' : 'idle'} />
            : <Sprite species={sp} scale={6} mode="silhouette" label={`${sp.common} silhouette — not yet seen`} />}
        </div>
        {plumages.length > 1 && (
          <div className="row mt8" role="radiogroup" aria-label="Plumage records">
            <span className="label">Plumages</span>
            {plumages.map((p, i) => (
              <button key={p.id} role="radio" aria-checked={p.id === cur?.id} aria-label={`Plumage ${i + 1}, ${formatDate(p.capturedAt)}`} onClick={() => setSel(p.id)}
                className="icon-btn"><span style={{ width: 14, height: 14, display: 'block', background: p.id === cur?.id ? 'var(--accent)' : 'transparent', border: '2px solid var(--accent)' }} /></button>
            ))}
            {Array.from({ length: Math.max(0, 4 - plumages.length) }).map((_, i) => <span key={i} style={{ width: 14, height: 14, border: '2px solid var(--smoke)', margin: '0 15px' }} aria-hidden />)}
          </div>
        )}

        <div className="mt16">
          <div className="row wrap" style={{ gap: 10 }}>
            {rarity ? <RarityTag rarity={rarity} /> : sp.id !== '_unknown' && <span className="small muted">Not on the {region.name} list</span>}
            {cur && <span className={`stampmark ${VERIFY_META[cur.verification].cls}`}>{VERIFY_META[cur.verification].label}</span>}
            {cur?.sprite.variant !== undefined && cur.sprite.variant !== 'normal' && <span className="stampmark rust">{cur.sprite.variant}</span>}
          </div>
          {sp.sci && <div className="sci mt8">{sp.sci}</div>}
          {sp.sizeCm > 0 && <div className="small muted">{sp.familyName} ({sp.family}) · {sp.sizeCm} cm{sp.wingspanCm ? ` · wingspan ${sp.wingspanCm} cm` : ''}</div>}
          {sp.id !== '_unknown' && <div className="small muted">{sp.habitats.map((h) => HAB_LABEL[h]).join(' · ')}</div>}
        </div>

        {cur && (
          <div className="row mt16" style={{ alignItems: 'flex-start', gap: 16 }}>
            {photo ? (
              <div className="taped tilt-l" style={{ width: 132, flex: 'none' }}><img src={photo} alt={`Your photo, ${formatDate(cur.capturedAt)}`} style={{ aspectRatio: '1/1', objectFit: 'cover', imageRendering: cur.mode === 'window' || cur.mode === 'sketch' ? 'pixelated' : 'auto' }} /></div>
            ) : (
              <div className="taped tilt-l" style={{ width: 132, flex: 'none', background: 'var(--paper)' }}><div style={{ aspectRatio: '1/1', display: 'grid', placeItems: 'center', color: 'var(--smoke)', fontSize: 12, textAlign: 'center' }}>Photo removed.<br />Sprite kept.</div></div>
            )}
            <div className="small">
              <div className="px">{formatDate(cur.capturedAt, { day: 'numeric', month: 'short' })} · {cur.region}</div>
              <div className="muted">{cur.mode === 'field' ? 'Field photo' : cur.mode === 'window' ? 'Window Mode' : cur.mode === 'import' ? 'Archived import' : 'Sketch'}</div>
              {cur.fieldcraft && <div className="mt8">Fieldcraft {cur.fieldcraft.total}<Meter value={cur.fieldcraft.total} tone="sun" label="Fieldcraft" /></div>}
              {cur.coaching[0] && <div className="muted mt8">“{cur.coaching[0]}”</div>}
            </div>
          </div>
        )}

        <p style={{ fontStyle: 'italic' }} className="mt16">“{sp.fact}”</p>

        {(cur?.verification === 'unverified' || cur?.verification === 'vagrant') && (
          <div className="panel">
            <p className="small" style={{ marginTop: 0 }}>{cur.verification === 'vagrant' ? 'Flagged as a vagrant. It counts toward completion once you confirm the identification.' : 'This bird has no name yet. Pick one when you know.'}</p>
            {cur.verification === 'vagrant'
              ? <button className="btn primary block" onClick={() => identifySighting(cur.id, cur.speciesId!, 'self-reported')}>I'm sure — confirm it</button>
              : <button className="btn primary block" onClick={() => setIdentify(true)}>Identify this bird</button>}
          </div>
        )}

        {sp.id !== '_unknown' && (
          <section className="mt16">
            <div className="label mb8">The real bird</div>
            <RefPhotoCard sp={sp} />
          </section>
        )}

        {sp.id !== '_unknown' && (
          <section className="panel mt16">
            <div className="label mb8">Call</div>
            <p className="small" style={{ marginTop: 0 }}>Listen to recordings of the {sp.common} on Xeno-canto (opens in your browser, each recording credited to its recordist).</p>
            <a className="btn block" href={`https://xeno-canto.org/explore?query=${encodeURIComponent(sp.sci)}`} target="_blank" rel="noopener">Listen on Xeno-canto ↗</a>
            <p className="small muted">Playback can stress birds. Never use it near a nest.</p>
          </section>
        )}

        {sp.id !== '_unknown' && (
          <section className="mt16">
            <div className="label mb8">Seed regions</div>
            <div className="row wrap">{regionsSeen.map((r) => <span key={r} className="chip" style={{ background: r === st.region ? 'var(--fern)' : undefined }}>{r}</span>)}</div>
            {sp.sensitive && <p className="small muted">Sensitive — location hidden. Owl and raptor sightings are never pinned, and PIXEL BIRDER stores no coordinates at all.</p>}
          </section>
        )}

        {mine.length > 0 && (
          <section className="mt16">
            <div className="label mb8">Your sightings · {mine.length}</div>
            {mine.map((x) => (
              <button key={x.id} className="srow" onClick={() => setSel(x.id)} aria-pressed={x.id === cur?.id}>
                <Sprite species={sp} parts={x.sprite.parts} scale={1} mode="static" />
                <span className="grow small">{formatDate(x.capturedAt)} · {x.region} · {VERIFY_META[x.verification].label}{x.fieldcraft ? ` · ${x.fieldcraft.total}` : ''}</span>
                {x.id === cur?.id && <span className="px small" style={{ color: 'var(--accent)' }}>●</span>}
              </button>
            ))}
          </section>
        )}

        {cur && (
          <div className="col mt24">
            <div className="row">
              <button className="btn grow" onClick={() => nav.open({ name: 'spread', sightingId: cur.id })}><Icon name="share" size={16} /> Spread & share</button>
              {counts(cur) && <button className="btn grow" onClick={() => { if (!toggleHabitatBird(cur.id)) nav.toast('Your habitat holds 12 birds. Move one out first.'); }}>{inHab ? 'In habitat ✓' : 'Add to habitat'}</button>}
            </div>
            {cur.photoId && <button className="link" onClick={() => deletePhotoKeepSprite(cur.id)}>Delete my photo, keep my sprite</button>}
            <button className="link" style={{ color: 'var(--oriole)' }} onClick={() => setConfirmDelete(true)}>Remove this sighting</button>
          </div>
        )}
      </div>
      {identify && cur && <IdentifySheet onClose={() => setIdentify(false)} onPick={(sid, v) => { identifySighting(cur.id, sid, v); setIdentify(false); nav.replace({ name: 'species', id: sid, sightingId: cur.id }); }} />}
      {confirmDelete && cur && (
        <Sheet onClose={() => setConfirmDelete(false)} label="Remove sighting">
          <h3 className="mb8">Remove this sighting?</h3>
          <p className="small">The sprite, photo and note for {formatDate(cur.capturedAt)} will be deleted from this phone. XP already earned stays.</p>
          <button className="btn danger block" onClick={() => { deleteSighting(cur.id); setConfirmDelete(false); nav.back(); }}>Remove</button>
          <button className="btn ghost block mt8" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </Sheet>
      )}
    </div>
  );
}

function IdentifySheet({ onClose, onPick }: { onClose: () => void; onPick: (id: string, v: 'self-reported' | 'vagrant') => void }) {
  const region = useGame((s) => s.region);
  const [q, setQ] = useState('');
  const regional = regionSpecies(region);
  const pool = q ? SPECIES : regional;
  const res = pool.filter((s) => !q || `${s.common} ${s.sci}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet onClose={onClose} label="Identify this bird">
      <h3 className="mb8">Identify this bird</h3>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search species" aria-label="Search species"
        style={{ width: '100%', minHeight: 48, padding: '8px 12px', background: 'var(--ink)', border: '2px solid var(--smoke)' }} />
      {res.map((s) => (
        <button key={s.id} className="srow" onClick={() => onPick(s.id, s.occ[region] ? 'self-reported' : 'vagrant')}>
          <Sprite species={s} mode="static" scale={1} />
          <span className="grow"><span className="name">{s.common}</span><br /><span className="sci">{s.sci}{!s.occ[region] ? ' · would file as vagrant' : ''}</span></span>
        </button>
      ))}
    </Sheet>
  );
}
