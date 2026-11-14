import { useGame, buyLens, equipLens } from '../app/store';
import { LENSES, LENS_ORDER, type LensId } from '../core/lenses';
import { Capsule } from './game';
import { Icon } from './components';
import { sfx, playClip } from '../app/audio';

/** Every Snap Lens: what it does, its Snap Power boost, and buy / use buttons. */
export function LensList({ onBought, onEquip }: { onBought?: (id: LensId) => void; onEquip?: (id: LensId) => void }) {
  const st = useGame((s) => s);
  return (
    <div className="lens-list">
      {LENS_ORDER.map((id) => {
        const l = LENSES[id]; const owned = st.lenses.includes(id); const on = st.lens === id;
        return (
          <div key={id} className={`srow lens-row ${on ? 'on' : ''}`}>
            <span className="lens-ico" aria-hidden><Capsule size={36} lens={id} glow={on} /></span>
            <span className="grow">
              <span className="name">{l.name}</span>{on && <span className="small" style={{ color: 'var(--accent)' }}> · in use</span>}
              <br /><span className="lens-power">{l.power ? `+${l.power} Snap Power` : 'No Snap Power boost'}</span>
              <br /><span className="small muted">{l.desc}</span>
            </span>
            {owned ? (
              <button className="btn small" disabled={on} aria-label={on ? `${l.name} in use` : `Use ${l.name}`} onClick={() => { equipLens(id); sfx.select(); onEquip?.(id); }}>{on ? 'Using' : 'Use'}</button>
            ) : (
              <button className="btn small primary" disabled={st.feathers < l.price} aria-label={`Buy ${l.name} for ${l.price} Feathers`}
                onClick={() => { if (buyLens(id)) { playClip('buy'); onBought?.(id); } else sfx.error(); }}>
                {l.price} <Icon name="feather" size={10} color="var(--accent-ink)" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
