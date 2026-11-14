import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { useNav } from '../nav';
import { useGame, counts, refreshChallenges, setRegion } from '../../app/store';
import { getRegion, regionLabel } from '../../data/geo';
import { regionEntries, ensureRegion, onProviderChange, providerStatus, usingSeedFallback, nearbySightings, Sighting as Obs } from '../../data/provider';
import { likelyNow } from '../../core/rarity';
import { sunTimes, dayPhase, DayPhase } from '../../core/sun';
import { liveStreak, dayKey, rankFor } from '../../core/xp';
import { fetchWeather, Weather } from '../../app/net';
import { renderFrames, defaultParts } from '../../core/pixel/sprite';
import { frameImage, Icon, RarityTag, Sheet } from '../components';
import { FeatherChip } from '../kit';
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
export function agoTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
function km(a: [number, number], b: [number, number]) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Feed { status: 'idle' | 'loading' | 'ok' | 'offline' | 'error'; list: Obs[]; hidden: number; at: number; error?: string; from: [number, number] | null; near: boolean }
const REFRESH_MS = 5 * 60e3;

function BirdMap({ regionCode, onOpen, onData, refreshKey }: { regionCode: string; onOpen: (sp: Species) => void; onData: (f: Feed) => void; refreshKey: number }) {
  const lastQuery = useRef<{ lat: number; lng: number; radius: number; from: [number, number] | null } | null>(null);
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
    lastQuery.current = { lat, lng, radius, from };
    if (!navigator.onLine) { setStateMsg('offline'); onData({ status: 'offline', list: [], hidden: 0, at: Date.now(), from, near: !!from }); return; }
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
        const when = o.observedAt ? agoTime(o.observedAt) : ago(o.observedOn);
        const esc = (s: string) => s.replace(/[<>&"]/g, '');
        Lf.marker([o.lat, o.lng], { icon, title: o.sp.common }).addTo(g).bindPopup(
          `<div style="display:flex;gap:10px;align-items:center">${o.photo ? `<img src="${esc(o.photo)}" width="56" height="56" style="object-fit:cover;border:2px solid #000">` : ''}
           <div><b>${esc(o.sp.common)}</b><br><i style="color:#4a5560">${esc(o.sp.sci)}</i><br>Seen ${when}${dist}</div></div>
           <button data-sp="${esc(o.sp.id)}" style="margin-top:8px;width:100%;min-height:40px;background:#C6FF1A;border:2px solid #000;font:12px Silkscreen,monospace;text-transform:uppercase">Open BirdDex entry</button>`);
      }
      setInfo({ n: list.length, hidden }); setStateMsg('ok');
      onData({ status: 'ok', list, hidden, at: Date.now(), from, near: !!from });
    } catch (e) {
      setStateMsg('error');
      const msg = (e as Error)?.name === 'AbortError' ? 'iNaturalist took too long to answer' : /^\d{3}$/.test(String((e as Error)?.message)) ? `iNaturalist answered with error ${(e as Error).message}` : 'Could not reach iNaturalist';
      onData({ status: 'error', list: [], hidden: 0, at: Date.now(), error: msg, from, near: !!from });
    }
  };
  // near-realtime: refresh every 5 minutes while the map is open, and on demand
  useEffect(() => {
    const t = setInterval(() => { const q = lastQuery.current; if (q && document.visibilityState === 'visible') load(q.lat, q.lng, q.radius, q.from); }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { const q = lastQuery.current; if (refreshKey && q) load(q.lat, q.lng, q.radius, q.from); }, [refreshKey]);

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
      <div className="map-overlay" style={{ left: 10, top: 'calc(54px + var(--safe-t))', display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '75%' }}>
        {state === 'loading' && <span className="chip">Scanning for birds…</span>}
        {state === 'ok' && <span className="chip sun">{info.n} sightings nearby · 30 days</span>}
        {state === 'ok' && info.hidden > 0 && <span className="chip" style={{ background: 'rgba(10,12,15,.88)' }}>{info.hidden} sensitive hidden</span>}
        {state === 'offline' && <span className="chip">Offline — map needs a connection</span>}
        {state === 'error' && <span className="chip">Couldn’t load sightings</span>}
      </div>
      <button className="btn primary small map-overlay" style={{ right: 10, top: 'calc(10px + var(--safe-t))', minHeight: 36 }} onClick={locate} aria-label="Find birds near me">
        <Icon name="map" size={14} color="var(--accent-ink)" /> Near me
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
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>({ status: 'idle', list: [], hidden: 0, at: 0, from: null, near: false });
  const [refreshKey, setRefreshKey] = useState(0);
  const [, tickNow] = useState(0);
  useEffect(() => { const t = setInterval(() => tickNow((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchWeather(region).then(setWx); refreshChallenges(new Date()); }, [st.region]);
  useEffect(() => { music('explore'); }, []);

  const entries = regionEntries(st.region);
  const caught = new Set(st.sightings.filter(counts).map((s) => s.speciesId));
  const have = entries.filter((e) => caught.has(e.sp.id)).length;
  const likely = useMemo(() => likelyNow(region, now, st.habitat, wx ?? undefined).slice(0, 12), [st.region, status, wx, phase]);
  const fallback = usingSeedFallback(st.region);
  const streak = liveStreak(st.streak, dayKey(now));
  const rank = rankFor(st.xp);
  const openSp = (sp: Species) => nav.open({ name: 'species', id: sp.id });

  return (
    <div className="explore">
      <BirdMap regionCode={st.region} onOpen={openSp} onData={setFeed} refreshKey={refreshKey} />
      {/* HUD: who you are, streak, money */}
      <div className="hud" style={{ right: 110 }}>
        <button className="chip" onClick={() => nav.setTab('you')} aria-label={`Trainer ${st.trainerName}, level ${rank.index + 1}`}>
          <b style={{ color: 'var(--accent)', fontWeight: 400 }}>Lv{rank.index + 1}</b> {st.trainerName || 'Trainer'}
        </button>
        <span className="chip" aria-label={`${streak.days}-day streak`}><Icon name="flame" size={12} color={streak.days ? 'var(--oriole)' : 'var(--ash)'} />{streak.days}</span>
        <FeatherChip />
      </div>

      <div className="drawer" style={{ height: open ? '72%' : 228 }}>
        <button className="grab" onClick={() => { sfx.move(); setOpen(!open); }} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} style={{ border: 0, minHeight: 4, padding: 0 }} />
        <div className="drawer-body">
          <div className="row between" style={{ marginBottom: 8 }}>
            <button className="row" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', minHeight: 44 }} onClick={() => { sfx.tap(); setPickRegion(true); }} aria-label={`Region ${regionLabel(st.region)}. Change`}>
              <span style={{ fontSize: 24 }} aria-hidden>{region.flag}</span>
              <span><b>{region.name}</b> <span className="small" style={{ color: 'var(--accent)' }}>▾</span><br />
                <span className="small muted">{wx ? `${wx.label}${wx.tempC !== undefined ? ` ${wx.tempC}°C` : ''} · ` : ''}{PHASE_LINE[phase].split(' — ')[0]}</span></span>
            </button>
            <button className="chip" onClick={() => nav.setTab('dex')} aria-label={`BirdDex ${have} of ${entries.length}`}>Dex {have}/{entries.length}</button>
          </div>
          <div className={`live ${feed.status}`} role="status">
            {feed.status === 'ok' && <><span className="live-dot" aria-hidden />Live · {feed.list.length} sightings {feed.near ? 'near you' : `around ${region.name}`} · updated {agoTime(new Date(feed.at).toISOString())}</>}
            {feed.status === 'loading' && <>Checking iNaturalist for new sightings…</>}
            {feed.status === 'idle' && <>Connecting to live sightings…</>}
            {feed.status === 'offline' && <>You're offline. The map will update when you're back online.</>}
            {feed.status === 'error' && <>{feed.error}. <button className="link" style={{ minHeight: 0, padding: 0 }} onClick={() => setRefreshKey((k) => k + 1)}>Retry</button></>}
          </div>
          <div className="section-title" style={{ marginTop: 0 }}><span>Likely here now</span><button className="link" style={{ minHeight: 0, padding: 0, fontSize: 13 }} onClick={() => setOpen(!open)}>{open ? 'Less' : 'More'}</button></div>
          {!open ? (
            <div className="bird-cards">
              {likely.map(({ sp, dex }) => (
                <button key={sp.id} className={`bird-card ${caught.has(sp.id) ? 'caught' : ''}`} onClick={() => openSp(sp)}>
                  {sp.photo ? <img src={sp.photo} alt="" loading="lazy" /> : <span className="ph" style={{ display: "block", overflow: "hidden" }}><BirdThumb sp={sp} size={84} /></span>}
                  <span className="dexno">{dexNo(dex)} {caught.has(sp.id) ? <span style={{ color: 'var(--accent)' }}>✓ found</span> : ''}</span>
                  <span className="nm">{sp.common}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="small" style={{ marginTop: 0 }}>{PHASE_LINE[phase]}</p>
              {likely.map(({ sp, rarity, dex }) => (
                <button key={sp.id} className="srow" onClick={() => openSp(sp)}>
                  <BirdThumb sp={sp} size={52} />
                  <span className="grow"><span className="dexno">{dexNo(dex)}</span> <span className="name">{sp.common}</span><br />
                    <span className="row" style={{ gap: 6, display: 'inline-flex', marginTop: 2 }}><Types sp={sp} /> <RarityTag rarity={rarity} showLabel={false} /></span></span>
                  {caught.has(sp.id) ? <span className="px small" style={{ color: 'var(--accent)' }}>✓</span> : <span className="px small muted">NEW</span>}
                </button>
              ))}
              {feed.list.length > 0 && (
                <>
                  <div className="section-title"><span>Latest sightings</span><button className="link" style={{ minHeight: 0, padding: 0, fontSize: 13 }} onClick={() => setRefreshKey((k) => k + 1)}>Refresh</button></div>
                  {feed.list.slice(0, 10).map((o) => (
                    <button key={o.id} className="srow" onClick={() => openSp(o.sp)}>
                      {o.photo ? <img src={o.photo} alt="" width={44} height={44} style={{ objectFit: 'cover', border: '2px solid #000' }} /> : <BirdThumb sp={o.sp} size={44} />}
                      <span className="grow"><span className="name">{o.sp.common}</span><br />
                        <span className="small muted">{o.observedAt ? agoTime(o.observedAt) : ago(o.observedOn)}{feed.from ? ` · ${km(feed.from, [o.lat, o.lng]).toFixed(1)} km` : ''}{o.place ? ` · ${o.place.split(',')[0]}` : ''}</span></span>
                    </button>
                  ))}
                  <p className="small muted">Real reports from iNaturalist observers. Sensitive species are never shown.</p>
                </>
              )}
              <p className="small muted mt16">
                {status === 'loading' ? 'Updating the local bird list from iNaturalist…'
                  : fallback ? `Offline list: using curated birds from ${getRegion(fallback).name} until the live list loads.`
                    : `${entries.length} species recorded in ${region.name} (iNaturalist research-grade).`}
              </p>
            </>
          )}
        </div>
      </div>

      {pickRegion && (
        <Sheet onClose={() => setPickRegion(false)} label="Choose your region">
          <h3 className="mb8">Choose your region</h3>
          <RegionPicker value={st.region} onPick={(code) => { setRegion(code); setPickRegion(false); nav.toast(`Region: ${regionLabel(code)}`); }} />
        </Sheet>
      )}
    </div>
  );
}
