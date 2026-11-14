import { FoodIcon } from '../FoodIcon';
// Merlin's Shop: food and Snap Lenses, reachable from the Feather counter on every screen.
import { useState } from 'react';
import { useNav } from '../nav';
import { useGame, buyFood } from '../../app/store';
import { FOODS, type Food } from '../../core/pets';
import { LENSES } from '../../core/lenses';
import { LensList } from '../LensList';
import { Professor } from '../Characters';
import { Sheet, Icon } from '../components';
import { sfx, playClip } from '../../app/audio';

const SHOP_THANKS = ['A fine choice. Your birds will sing for it.', 'Into the bag it goes! Fill that feeder.', 'Splendid! The birds thank you.', 'Fresh seed, straight from my larder. Enjoy!'];

export function Shop() {
  const nav = useNav();
  const st = useGame((s) => s);
  const [shopCast, setShopCast] = useState(0);
  const [shopLine, setShopLine] = useState('Seeds, berries, mealworms and lenses! Fair prices, paid in Feathers.');
  return (
    <div className="overlay" style={{ background: 'transparent' }}>
      <Sheet onClose={nav.back} label="Merlin's Shop">
          <div className="row between mb8"><h3>Merlin's Shop</h3><span className="chip"><Icon name="feather" size={12} color="var(--sky)" />{st.feathers}</span></div>
          <div className="npc mb8">
            <div key={shopCast} className={shopCast ? 'npc-hop' : ''}><Professor height={96} /></div>
            <div className="bubble"><b>Professor Merlin</b>{shopLine}</div>
          </div>
          {(Object.keys(FOODS) as Food[]).map((f) => (
            <div key={f} className="srow">
              <FoodIcon food={f} size={40} />
              <span className="grow"><span className="name">{FOODS[f].name}</span> <span className="small muted">· have {st.items[f]}</span><br /><span className="small muted">{FOODS[f].desc}</span></span>
              <button className="btn small primary" disabled={st.feathers < FOODS[f].price} onClick={() => { if (buyFood(f)) { playClip('buy'); setShopCast((k) => k + 1); setShopLine(SHOP_THANKS[(shopCast + 1) % SHOP_THANKS.length]); nav.toast(`Bought ${FOODS[f].name}`); } else { sfx.error(); setShopLine('Not enough Feathers, friend. Go and find some birds!'); } }}>
                {FOODS[f].price} <Icon name="feather" size={10} color="var(--accent-ink)" />
              </button>
            </div>
          ))}
          <div className="section-title"><span>Snap Lenses</span><span className="small muted" style={{ textTransform: 'none', fontFamily: 'var(--body)' }}>Better lenses boost Snap Power</span></div>
          <LensList onBought={(id) => { setShopCast((k) => k + 1); setShopLine(`The ${LENSES[id].name}! +${LENSES[id].power} Snap Power on every photo.`); nav.toast(`Bought ${LENSES[id].name}`); }}
            onEquip={(id) => setShopLine(`The ${LENSES[id].name} is ready. Go and find a bird!`)} />
          <p className="small muted">Earn Feathers by discovering real birds (+12, or +20 for a new species), finishing quests, earning badges, and keeping your Aviary healthy.</p>
          <button className="btn block" onClick={() => { nav.back(); nav.setTab('aviary'); }}>Go to my Aviary</button>
        </Sheet>
    </div>
  );
}
