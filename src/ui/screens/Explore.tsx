import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { useNav } from '../nav';
import { useGame, counts, claimChallenge, refreshChallenges, setRegion, speciesOf } from '../../app/store';
import { getRegion, regionLabel } from '../../data/geo';
import { regionEntries, ensureRegion, onProviderChange, providerStatus, usingSeedFallback, nearbySightings, Sighting as Obs } from '../../data/provider';
import { likelyNow, RARITY_META } from '../../core/rarity';
import { sunTimes, dayPhase, DayPhase } from '../../core/sun';
import { liveStreak, dayKey, rankFor } from '../../core/xp';
import { challengeProgress } from '../../core/challenges';
import { fetchWeather, Weather } from '../../app/net';
import { renderFrames, defaultParts } from '../../core/pixel/sprite';
import { frameImage, Icon, Meter, RarityTag, Sheet } from '../components';
import { BirdThumb, Types, dexNo } from '../game';
import { sfx, music } from '../../app/audio';
import { RegionPicker } from './RegionPicker';
import type { Species } from '../../data/types';
import 'leaflet/dist/leaflet.css';

const PHASE_LINE: Record<DayPhase, string> = {
  night: 'Night — owls are the birds awake now.', dawn: 'Dawn chorus — the best hour to find birds.', morning: 'Morning feeding — birds are busy.',
  day: 'Midday lull — try shady trees and water.', golden: 'Golden hour — soft light for great shots.', dusk: 'Dusk — last feeding before roost.',
};

const spriteURLs = new Map<string, string>();
function spriteURL(sp: Species): string {
  if (spriteURLs.has(sp.id)) return spriteURLs.get(sp.id)!;
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  c.getContext('2d')!.putImageData(frameImage(renderFrames(sp, defaultParts(sp))[0]), 0, 0);
  const u = c.toDataURL(); spriteURLs.set(sp.id, u); return u;
}

function useProvider(code: string) {
  const [, force] = useState(0);
  useEffect(() => { ensureRegion(code); return onProviderChange(() => force((x) => x + 1)); }, [code]);
  return providerStatus(code);
}

function ago(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}
function km(a: [number, number], b: [number, number]) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function BirdMap({ regionCode, onOpen }: { regionCode: string; onOpen: (sp: Species) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const me = useRef<Leaflet.Marker | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [state, setStateMsg] = useState<'idle' | 'loading' | 'ok' | 'offline' | 'error'>('idle');
  const [info, setInfo] = useState<{ n: number; hidden: number }>({ n: 0, hidden: 0 });
  const region = getRegion(regionCode);

  useEffect(() => {
    let live = true;
    import('leaflet').then((mod) => {
      if (!live || !box.current) return;
      const Lf = (mod as any).default ?? mod; L.current = Lf;
      const m = Lf.map(box.current, { zoomControl: false, attributionControl: true }).setView([region.lat, region.lng], 7);
      Lf.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a> · sightings: <a href="https://www.inaturalist.org">iNaturalist</a>',
      }).addTo(m);
      Lf.control.zoom({ position: 'bottomright' }).addTo(m);
      layer.current = Lf.layerGroup().addTo(m);
      map.current = m;
      m.on('popupopen', (e: any) => {
        const btn = e.popup.getElement()?.querySelector('[data-sp]') as HTMLElement | null;
        btn?.addEventListener('click', () => { const id = btn.dataset.sp!; const sp = obsRef.current.find((o) => o.sp.id === id)?.sp; if (sp) onOpen(sp); });
      });
      // auto-locate if permission was already granted
      navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((p) => { if (p.state === 'granted') locate(); else load(region.lat, region.lng, 40); }).catch(() => load(region.lat, region.lng, 40));
    });
    return () => { live = false; map.current?.remove(); map.current = null; };
  }, [regionCode]);

  const obsRef = useRef<Obs[]>([]);
  const load = async (lat: number, lng: number, radius: number, from: [number, number] | null = pos) => {
    if (!navigator.onLine) { setStateMsg('offline'); return; }
    setStateMsg('loading');
    try {
      const { list, hidden } = await nearbySightings(lat, lng, radius, 30);
      obsRef.current = list;
      const Lf = L.current!; const g = layer.current!; g.clearLayers();
      const seen = new Set<string>();
      for (const o of list) {
        const key = `${o.sp.id}|${o.lat.toFixed(3)}|${o.lng.toFixed(3)}`; if (seen.has(key)) continue; seen.add(key);
        const icon = Lf.divIcon({ className: '', html: `<img class="bird-pin" src="${spriteURL(o.sp)}" width="40" height="40" alt="">`, iconSize: [40, 40], iconAnchor: [20, 36] });
        const dist = from ? ` · ${km(from, [o.lat, o.lng]).toFixed(1)} km` : '';
        const esc = (s: string) => s.replace(/[<>&"]/g, '');
        Lf.marker([o.lat, o.lng], { icon, title: o.sp.common }).addTo(g).bindPopup(
          `<div style="display:flex;gap:10px;align-items:center">${o.photo ? `<img src="${esc(o.photo)}" width="56" height="56" style="object-fit:cover;border:2px solid #000">` : ''}
           <div><b>${esc(o.sp.common)}</b><br><i style="color:#4a5560">${esc(o.sp.sci)}</i><br>Seen ${ago(o.observedOn)}${dist}</div></div>
           <button data-sp="${esc(o.sp.id)}" style="margin-top:8px;width:100%;min-height:40px;background:#C6FF1A;border:2px solid #000;font:12px Silkscreen,monospace;text-transform:uppercase">Open BirdDex entry</button>`);
      }
      setInfo({ n: list.length, hidden }); setStateMsg('ok');
    } catch { setStateMsg('error'); }
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    sfx.tap();
    navigator.geolocation.getCurrentPosition((p) => {
      const ll: [number, number] = [p.coords.latitude, p.coords.longitude]; // kept in memory only, never saved
      setPos(ll);
      const Lf = L.current!; const m = map.current!;
      if (!me.current) me.current = Lf.marker(ll, { icon: Lf.divIcon({ className: '', html: '<div class="me-pin pulse"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, title: 'You' }).addTo(m);
      else me.current.setLatLng(ll);
      m.setView(ll, 12);
      load(ll[0], ll[1], 12, ll);
    }, () => load(region.lat, region.lng, 40), { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  };

  return (
    <div className="map-wrap">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map of recent bird sightings" />
      <div className="map-overlay" style={{ left: 12, bottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '70%' }}>
        {state === 'loading' && <span className="chip">Scanning for birds…</span>}
        {state === 'ok' && <span className="chip sun">{info.n} sightings · 30 days</span>}
        {state === 'ok' && info.hidden > 0 && <span className="chip">{info.hidden} sensitive hidden</span>}
        {state === 'offline' && <span className="chip">Offline — map needs a connection</span>}
        {state === 'error' && <span className="chip">Couldn’t load sightings</span>}
      </div>
      <button className="btn primary small map-overlay" style={{ right: 12, top: 12 }} onClick={locate} aria-label="Find birds near me">
        <Icon name="map" size={16} color="var(--accent-ink)" /> Near me
      </button>
    </div>
  );
}

export function Explore() {
  const nav = useNav();
  const st = useGame((s) => s);
  const region = getRegion(st.region);
  const status = useProvider(st.region);
  const now = new Date();
  const phase = dayPhase(now, sunTimes(now, region.lat, region.lng));
  const [wx, setWx] = useState<Weather | null>(null);
  const [pickRegion, setPickRegion] = useState(false);
  useEffect(() => { fetchWeather(region).then(setWx); refreshChallenges(new Date()); }, [st.region]);
  useEffect(() => { music('explore'); }, []);

  const entries = regionEntries(st.region);
  const caught = new Set(st.sightings.filter(counts).map((s) => s.speciesId));
  const have = entries.filter((e) => caught.has(e.sp.id)).length;
  const likely = useMemo(() => likelyNow(region, now, st.habitat, wx ?? undefined).slice(0, 6), [st.region, status, wx, phase]);
  const fallback = usingSeedFallback(st.region);
  const streak = liveStreak(st.streak, dayKey(now));
  const rank = rankFor(st.xp);
  const open = (sp: Species) => nav.open({ name: 'species', id: sp.id });

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      <BirdMap regionCode={st.region} onOpen={open} />
      <div className="row between" style={{ margin: '12px 0' }}>
        <button className="row" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => nav.setTab('you')}>
          <span className="chip sun">Lv {rank.index + 1}</span><span className="px small">{st.trainerName || 'Trainer'}</span>
        </button>
        <div className="row" style={{ gap: 6 }}>
          <span className="chip" aria-label={`${streak.days}-day streak`}><Icon name="flame" size={12} color={streak.days ? 'var(--oriole)' : 'var(--ash)'} />{streak.days}</span>
          <span className="chip" aria-label={`${st.feathers} feathers`}><Icon name="feather" size={12} color="var(--sky)" />{st.feathers}</span>
        </div>
      </div>

      <button className="panel" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => { sfx.tap(); setPickRegion(true); }} aria-label={`Region: ${regionLabel(st.region)}. Change region`}>
        <div className="row between">
          <span className="row"><span style={{ fontSize: 28 }} aria-hidden>{region.flag}</span>
            <span><b>{region.name}</b>{region.name !== region.countryName && <><br /><span className="small muted">{region.countryName}</span></>}</span></span>
          <span className="small" style={{ color: 'var(--accent)' }}>Change ›</span>
        </div>
        <div className="row between small mt8"><span>BirdDex</span><span className="num">{have} / {entries.length}</span></div>
        <Meter value={have} max={Math.max(1, entries.length)} tone="sun" label="Regional BirdDex" />
        <div className="small muted mt8">
          {status === 'loading' ? 'Updating the local bird list from iNaturalist…'
            : fallback ? `Offline list: using curated birds from ${getRegion(fallback).name} until the live list loads.`
              : `${entries.length} species recorded here (iNaturalist research-grade).`}
          {wx ? ` · ${wx.label}${wx.tempC !== undefined ? ` ${wx.tempC}°C` : ''}` : ''}
        </div>
      </button>
      <p className="small" style={{ marginTop: -6 }}>{PHASE_LINE[phase]}</p>

      <section className="panel" aria-labelledby="likely-h">
        <h3 id="likely-h" className="label mb8">Likely here now</h3>
        {likely.map(({ sp, rarity, dex }) => (
          <button key={sp.id} className="srow" onClick={() => open(sp)}>
            <BirdThumb sp={sp} size={52} />
            <span className="grow">
              <span className="dexno">{dexNo(dex)}</span> <span className="name">{caught.has(sp.id) ? sp.common : sp.common}</span><br />
              <span className="row" style={{ gap: 6, display: 'inline-flex', marginTop: 2 }}><Types sp={sp} /> <RarityTag rarity={rarity} showLabel={false} /></span>
            </span>
            {caught.has(sp.id) ? <span className="px small" style={{ color: 'var(--accent)' }}>✓</span> : <span className="px small muted">NEW</span>}
          </button>
        ))}
      </section>
      <button className="btn primary big block" onClick={() => { sfx.select(); nav.open({ name: 'viewfinder' }); }}><Icon name="photo" size={20} color="var(--accent-ink)" /> Catch a bird</button>

      <section className="panel mt16" aria-labelledby="q-h">
        <div className="row between"><h3 id="q-h" className="label">Daily quests</h3><button className="link" onClick={() => nav.open({ name: 'challenges' })}>All quests</button></div>
        {st.challenges.daily.map((slot) => {
          const p = challengeProgress(st, slot, now);
          return (
            <div key={slot.id} className="mt8">
              <div className="row between small"><span>{p.label}</span>
                {p.done && !slot.claimed ? <button className="btn small primary" onClick={() => { const xp = claimChallenge(slot); sfx.levelUp(); nav.toast(`Quest complete! +${xp} XP`); }}>Claim</button>
                  : <span className="num">{slot.claimed ? '✓' : `${p.progress}/${p.goal}`}</span>}
              </div>
              <Meter value={p.progress} max={p.goal} tone="river" label={p.label} />
            </div>
          );
        })}
      </section>

      {st.sightings[0] && (
        <section className="panel">
          <div className="label mb8">Last catch</div>
          <button className="srow" onClick={() => nav.open({ name: 'species', id: st.sightings[0].speciesId ?? '_unknown', sightingId: st.sightings[0].id })}>
            <BirdThumb sp={speciesOf(st.sightings[0])} size={44} />
            <span className="grow"><span className="name">{speciesOf(st.sightings[0]).common}</span><br /><span className="small muted">Lv {st.sightings[0].level ?? 5} · {RARITY_META[st.sightings[0].rarity].label}</span></span>
          </button>
        </section>
      )}

      {pickRegion && (
        <Sheet onClose={() => setPickRegion(false)} label="Choose your region">
          <h3 className="mb8">Choose your region</h3>
          <RegionPicker value={st.region} onPick={(code) => { setRegion(code); setPickRegion(false); nav.toast(`Region: ${regionLabel(code)}`); }} />
        </Sheet>
      )}
    </div>
  );
}
