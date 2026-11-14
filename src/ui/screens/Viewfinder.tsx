import { MerlinTip } from '../MerlinTip';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '../nav';
import { useGame, setState, logEvent } from '../../app/store';
import { getRegion } from '../../data/geo';
import { likelyNow } from '../../core/rarity';
import { normalize, fromFile, exifDate, analyze, canvas } from '../../app/photo';
import { Sprite, Icon, RarityTag, TopBar, RefThumb } from '../components';
import { sfx, haptic } from '../../app/audio';

type CamState = 'ask' | 'starting' | 'live' | 'denied' | 'none' | 'busy';

export function Viewfinder() {
  const nav = useNav();
  const regionCode = useGame((s) => s.region);
  const habitat = useGame((s) => s.habitat);
  const grid = useGame((s) => s.settings.grid);
  const asked = useGame((s) => s.log.some((l) => l.e === 'camera_granted'));
  const region = getRegion(regionCode);
  const short = useMemo(() => likelyNow(region, new Date(), habitat).slice(0, 5), [regionCode, habitat]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>(asked ? 'starting' : 'ask');
  const [reticle, setReticle] = useState<{ x: number; y: number } | null>(null);
  const [exposure, setExposure] = useState(0); // -2..2 EV
  const [zoom, setZoom] = useState(1);
  const [hwExposure, setHwExposure] = useState<{ min: number; max: number } | null>(null);
  const [hwZoom, setHwZoom] = useState<{ min: number; max: number } | null>(null);
  const [freeze, setFreeze] = useState<string | null>(null);
  const [small, setSmall] = useState(false);
  const [showList, setShowList] = useState(true);
  const [importErr, setImportErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const start = async () => {
    setCam('starting');
    if (!navigator.mediaDevices?.getUserMedia) { setCam('none'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream; await v.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.() ?? {};
      if (caps.exposureCompensation) setHwExposure({ min: caps.exposureCompensation.min, max: caps.exposureCompensation.max });
      if (caps.zoom) setHwZoom({ min: caps.zoom.min, max: caps.zoom.max });
      setCam('live');
      logEvent('camera_granted');
    } catch (e: any) {
      setCam(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : e?.name === 'NotReadableError' ? 'busy' : 'none');
    }
  };
  useEffect(() => { if (cam === 'starting') start(); return () => streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  // hardware exposure / zoom when the device supports it; otherwise apply in software (preview AND capture)
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0]; if (!track) return;
    const adv: any = {};
    if (hwExposure) adv.exposureCompensation = Math.max(hwExposure.min, Math.min(hwExposure.max, exposure));
    if (hwZoom) adv.zoom = Math.max(hwZoom.min, Math.min(hwZoom.max, zoom));
    if (Object.keys(adv).length) track.applyConstraints({ advanced: [adv] } as any).catch(() => {});
  }, [exposure, zoom, hwExposure, hwZoom]);
  const swFilter = !hwExposure && exposure ? `brightness(${Math.pow(2, exposure / 2).toFixed(2)})` : undefined;
  const swZoom = hwZoom ? 1 : zoom;

  // CAM-4 distance cue: sample the frame every ~1.2s
  useEffect(() => {
    if (cam !== 'live') return;
    let n = 0;
    const iv = setInterval(async () => {
      const v = videoRef.current; if (!v || !v.videoWidth) return;
      const side = Math.min(v.videoWidth, v.videoHeight) / swZoom;
      const c = canvas(128, 128); const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 128, 128);
      const a = await analyze(g.getImageData(0, 0, 128, 128).data, 128);
      const area = a.bbox.w * a.bbox.h;
      n = area < 0.05 && a.score.separation > 4 ? n + 1 : 0;
      setSmall(n >= 2);
    }, 1200);
    return () => clearInterval(iv);
  }, [cam, swZoom]);

  const tapFocus = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    setReticle({ x, y }); sfx.tap();
    const track = streamRef.current?.getVideoTracks()[0];
    track?.applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] } as any] }).catch(() => {});
  };

  const shoot = async () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    sfx.shutter(); haptic(14);
    const side = Math.min(v.videoWidth, v.videoHeight) / swZoom;
    const crop = { x: (v.videoWidth - side) / 2, y: (v.videoHeight - side) / 2, s: side };
    const shot = await normalize(v, v.videoWidth, v.videoHeight, crop, swFilter);
    setFreeze(shot.preview); // CAM-5: the freeze shows the actual captured image
    setTimeout(() => { setFreeze(null); nav.open({ name: 'catch', job: { mode: 'field', shot, returnTo: 'journal' } }); }, 220);
  };

  const onImport = async (f: File | undefined) => {
    setImportErr('');
    if (!f) return;
    const taken = await exifDate(f);
    if (!taken) { setImportErr("That photo has no capture date, so we can't check it's from today. Live photos earn full credit."); return; }
    if (Date.now() - taken.getTime() > 24 * 3600e3) { setImportErr(`That photo is from ${taken.toLocaleDateString()}. Imports must be from the last 24 hours — this keeps discoveries honest.`); return; }
    try {
      const { bmp, w, h } = await fromFile(f);
      const shot = await normalize(bmp, w, h);
      shot.takenAt = taken;
      nav.open({ name: 'catch', job: { mode: 'import', shot, returnTo: 'journal' } });
    } catch { setImportErr("We couldn't read that file. Try a JPEG straight from your camera app."); }
  };

  const importInput = <input ref={fileRef} type="file" accept="image/jpeg,image/*" hidden onChange={(e) => onImport(e.target.files?.[0])} />;
  const importNote = <p className="small muted">Imports earn 50% XP, no Fieldcraft credit, and are tagged “Archived”. Only photos taken in the last 24 hours are accepted. This keeps discoveries honest while still letting you use a better camera.</p>;

  if (cam === 'ask') {
    return (
      <div className="overlay">
        <TopBar title="Field Mode" onBack={nav.back} backIcon="close" />
        <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          <Icon name="photo" size={64} color="var(--accent)" />
          <h2>BirdlyQuest needs your camera to discover real birds.</h2>
          <p className="muted small">Photos stay on this phone. Location is never read from them.</p>
          <button className="btn primary big block" onClick={start}>Allow camera</button>
          <button className="btn ghost block" onClick={() => nav.replace({ name: 'quicklog' })}>Saw a bird? Log it without a photo</button>
          <button className="btn ghost block" onClick={() => nav.replace({ name: 'sketch' })}>Sketch it instead</button>
        </div>
      </div>
    );
  }

  if (cam === 'denied' || cam === 'none' || cam === 'busy') {
    const copy = cam === 'denied'
      ? ['Camera is switched off for BirdlyQuest.', 'Turn it on in your browser’s site settings, or sketch the bird — sketches count too.']
      : cam === 'busy' ? ['The camera is busy.', 'Close other apps and try once more.']
        : ['No camera found on this device.', 'Sketch the bird or import a photo from today instead.'];
    return (
      <div className="overlay">
        <TopBar title="Field Mode" onBack={nav.back} backIcon="close" />
        <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
          <h2>{copy[0]}</h2><p className="muted">{copy[1]}</p>
          <button className="btn primary big block" onClick={() => nav.replace({ name: 'sketch' })}><Icon name="pencil" size={20} /> Sketch it</button>
          <button className="btn block" onClick={() => fileRef.current?.click()}>Import today’s photo</button>
          {cam !== 'denied' && <button className="btn ghost block" onClick={start}>Try again</button>}
          {importErr && <p className="small" role="alert" style={{ color: 'var(--oriole)' }}>{importErr}</p>}
          {importNote}{importInput}
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" style={{ background: '#000' }}>
      <TopBar title={regionCode} onBack={nav.back} backIcon="close"
        right={<button className="icon-btn" aria-pressed={grid} aria-label="Toggle grid" onClick={() => setState((s) => ({ ...s, settings: { ...s.settings, grid: !s.settings.grid } }))}><Icon name="grid" size={20} filled={grid} /></button>} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#000' }} onPointerDown={tapFocus}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', transform: swZoom > 1 ? `scale(${swZoom})` : undefined, filter: swFilter }} />
          {grid && (
            <svg viewBox="0 0 3 3" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
              <path d="M1 0V3M2 0V3M0 1H3M0 2H3" stroke="rgba(247,244,233,.55)" strokeWidth="0.008" />
            </svg>
          )}
          {reticle && <div className="reticle locked" style={{ left: `calc(${reticle.x * 100}% - 32px)`, top: `calc(${reticle.y * 100}% - 32px)` }}><i /><i /><i /><i /></div>}
          {freeze && <img src={freeze} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          {freeze && <div className="flash" />}
          {cam === 'starting' && <p className="px" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Waking the camera…</p>}
          {/* exposure slider: right edge, thumb-reachable */}
          <input type="range" min={-2} max={2} step={0.5} value={exposure} onChange={(e) => setExposure(Number(e.target.value))} aria-label="Exposure"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', right: -52, top: '50%', width: 150, transform: 'translateY(-50%) rotate(-90deg)', accentColor: 'var(--accent)' }} />
          {small && <div className="chip" style={{ position: 'absolute', left: 8, bottom: 8 }} role="status">Small in frame — get closer if you can</div>}
        </div>
      </div>
      <div style={{ padding: '8px 16px calc(12px + var(--safe-b))', background: 'var(--ink)' }}>
        <MerlinTip id="camera" placement="inline" />
        <button className="btn ghost block small" onClick={() => setShowList((v) => !v)} aria-expanded={showList} style={{ justifyContent: 'flex-start', textTransform: 'none', fontFamily: 'var(--body)', letterSpacing: 0 }}>
          <span className="px" style={{ fontSize: 11, color: 'var(--accent)' }}>Likely</span>&nbsp;{short.map((l) => l.sp.common.split(' ').pop()).join(' · ')}
        </button>
        {showList && (
          <div className="hscroll mt8">
            {short.map(({ sp, rarity }) => (
              <div key={sp.id} className="panel flat" style={{ minWidth: 132, margin: 0, padding: 8 }}>
                <div className="row"><Sprite species={sp} scale={2} mode="static" /><RefThumb sp={sp} size={40} /></div>
                <div className="small" style={{ fontWeight: 600 }}>{sp.common}</div>
                <RarityTag rarity={rarity} />
              </div>
            ))}
          </div>
        )}
        <div className="row mt8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn ghost small" onClick={() => setZoom((z) => (z >= 3 ? 1 : z + 1))} aria-label={`Zoom ${zoom} times`}>{zoom}×</button>
          <button className="shutter ready" onClick={shoot} disabled={cam !== 'live'} aria-label="Shutter"><Icon name="photo" size={28} color="var(--ink)" /></button>
          <button className="btn ghost small" onClick={() => fileRef.current?.click()} aria-label="Import a photo from today">Import</button>
        </div>
        <button className="btn ghost block small mt8" onClick={() => nav.replace({ name: 'quicklog' })}>It flew off? Log it without a photo</button>
        {importErr && <p className="small" role="alert" style={{ color: 'var(--oriole)' }}>{importErr}</p>}
        {importInput}
      </div>
    </div>
  );
}
