import { useEffect } from 'react';
import { useGame, shiftBadgeQueue } from '../app/store';
import { BADGES, TIER_FEATHERS } from '../core/badges';
import { BadgeIcon } from './game';
import { playClip, haptic } from '../app/audio';

const TIER_COL: Record<string, string> = { bronze: '#C2622F', silver: '#B6C0C9', gold: '#F2C14E', platinum: '#9FD3E0' };

/** "Badge earned!" moment for achievements earned outside the discovery sequence. */
export function BadgePopup({ blocked }: { blocked: boolean }) {
  const id = useGame((s) => s.badgeQueue[0]);
  const b = id ? BADGES.find((x) => x.id === id) : undefined;
  useEffect(() => { if (b && !blocked) { playClip('levelUp', { duck: true }); haptic([15, 40, 15, 40, 30]); } }, [b?.id, blocked]);
  useEffect(() => { if (id && !b) shiftBadgeQueue(); }, [id]);
  if (!b || blocked) return null;
  return (
    <div className="badge-pop" role="dialog" aria-modal="true" aria-label={`Badge earned: ${b.name}`} onClick={shiftBadgeQueue}>
      <div className="badge-pop-card" onClick={(e) => e.stopPropagation()} style={{ borderColor: TIER_COL[b.tier] }}>
        <div className="label" style={{ color: TIER_COL[b.tier] }}>Badge earned!</div>
        <div className="badge-pop-icon"><BadgeIcon icon={b.icon} earned size={128} label={b.name} /></div>
        <h2 style={{ fontSize: 18 }}>{b.name}</h2>
        <p className="small" style={{ margin: '6px 0' }}>{b.desc}</p>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <span className="chip" style={{ background: TIER_COL[b.tier], color: '#0A0C0F', borderColor: '#000' }}>{b.tier}</span>
          <span className="chip">+{TIER_FEATHERS[b.tier]} Feathers</span>
        </div>
        <button className="btn primary block mt16" onClick={shiftBadgeQueue}>Nice!</button>
      </div>
    </div>
  );
}
