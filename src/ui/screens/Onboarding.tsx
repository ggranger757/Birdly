import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES_BY_ID } from '../../data/species';
import { setState, getState, logEvent, setRegion, setTrainer, setPartner, useGame } from '../../app/store';
import { paintSceneThumb } from '../../render/diorama';
import { Sprite, useReducedMotion } from '../components';
import { Dialog, Types, BirdThumb, Capsule } from '../game';
import { sfx, music } from '../../app/audio';
import { Professor } from '../Professor';
import { RegionPicker } from './RegionPicker';
import { getRegion, regionLabel } from '../../data/geo';
import { regionEntries, ensureRegion, onProviderChange, providerStatus } from '../../data/provider';
import { typesOf } from '../../core/rarity';
import type { Species } from '../../data/types';

function SceneBackdrop({ opacity = 0.45 }: { opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { paintSceneThumb(ref.current!, 'woodland', 'dawn', 200, 300); }, []);
  return <canvas ref={ref} className="pix" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity, zIndex: -1 }} />;
}

export function Boot({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  useEffect(() => { music('title'); }, []);
  return (
    <div className="screen" onClick={() => { sfx.select(); onDone(); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, position: 'relative', isolation: 'isolate' }}>
      <SceneBackdrop opacity={0.55} />
      <div style={{ animation: reduced ? undefined : 'bob 900ms steps(2) infinite' }}><Sprite species={SPECIES_BY_ID.norcar} scale={4} mode="fly" /></div>
      <h1 className="title-logo">BIRDLY<b>QUEST</b></h1>
      <p className="small" style={{ margin: 0, textShadow: '1px 1px 0 #000' }}>Catch real birds with your camera.</p>
      <p className="press mt24">TAP TO START</p>
    </div>
  );
}

const PROF = SPECIES_BY_ID.grhowl;

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState<'intro' | 'name' | 'region' | 'partner' | 'outro'>('intro');
  const [name, setName] = useState(getState().trainerName);
  const region = useGame((s) => s.region);
  useEffect(() => { logEvent('onboarding_step', step); }, [step]);
  useEffect(() => { music('title'); }, []);

  const prof = (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
      <div style={{ filter: 'drop-shadow(4px 4px 0 #000)' }}><Professor height={144} /></div>
    </div>
  );

  if (step === 'intro') {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', isolation: 'isolate', paddingBottom: 32 }}>
        <SceneBackdrop />
        {prof}
        <Dialog speaker="Professor Rowan" lines={[
          'Welcome, traveller, to the world of BIRDS! I am Rowan, druid of the old woods.',
          'Real wild birds live all around you — in parks, on rooftops, by the water.',
          'Snap a photo of one with BirdlyQuest, and it is caught: it joins your BirdDex as a pixel companion.',
          'Every bird you catch is drawn from YOUR photo. No two trainers have the same birds.',
          'Now then… what should I call you?',
        ]} onDone={() => setStep('name')} />
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        {prof}
        <label className="label" htmlFor="tname">Trainer name</label>
        <input id="tname" autoFocus value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Your name"
          style={{ minHeight: 56, padding: '8px 14px', background: '#000', border: '3px solid var(--accent)', fontFamily: 'var(--px)', fontSize: 20, textTransform: 'uppercase', borderRadius: 0 }} />
        <button className="btn primary big block" onClick={() => { setTrainer(name.trim() || 'Birder'); sfx.select(); setStep('region'); }}>{name.trim() ? 'That’s me' : 'Skip'}</button>
      </div>
    );
  }

  if (step === 'region') {
    return (
      <div className="screen">
        <Dialog speaker="Professor Rowan" lines={[`${name.trim() || 'Birder'}! Where do you live? Every place has its own birds.`]} />
        <div className="mt16">
          <RegionPicker value={getState().onboarded ? region : undefined} onPick={(code) => { setRegion(code); setStep('partner'); }} />
        </div>
      </div>
    );
  }

  if (step === 'partner') return <PartnerPick region={region} onDone={() => setStep('outro')} />;

  const r = getRegion(region);
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', isolation: 'isolate', paddingBottom: 32 }}>
      <SceneBackdrop />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><Capsule size={72} /></div>
      <Dialog speaker="Professor Rowan" lines={[
        `${r.flag ?? ''} ${regionLabel(region)}. Splendid birding country!`,
        'Here are your Snap Capsules. Point your camera at a real bird and press the shutter.',
        'Fill your BirdDex, earn badges, and grow your Aviary. Your quest begins now!',
      ]} onDone={() => {
        setState((s) => ({ ...s, onboarded: true, diorama: { ...s.diorama, biome: s.habitat } }));
        sfx.levelUp(); onFinish();
      }} />
    </div>
  );
}

function PartnerPick({ region, onDone }: { region: string; onDone: () => void }) {
  const [, force] = useState(0);
  useEffect(() => { ensureRegion(region); return onProviderChange(() => force((x) => x + 1)); }, [region]);
  const status = providerStatus(region);
  const choices = useMemo(() => {
    const top = regionEntries(region).filter((e) => !e.sp.sensitive && e.sp.archetype !== 'owl').slice(0, 40);
    const out: Species[] = []; const types = new Set<string>();
    for (const e of top) { const t = typesOf(e.sp)[0]; if (!types.has(t)) { types.add(t); out.push(e.sp); } if (out.length === 3) break; }
    for (const e of top) { if (out.length >= 3) break; if (!out.includes(e.sp)) out.push(e.sp); }
    return out;
  }, [region, status]);
  const [pick, setPick] = useState<Species | null>(null);
  return (
    <div className="screen">
      <Dialog speaker="Professor Rowan" lines={['Every trainer needs a partner. These three are common where you live. Choose one!']} />
      {status === 'loading' && <p className="small muted mt8">Looking up the birds of {regionLabel(region)}…</p>}
      <div className="col mt16" style={{ gap: 12 }}>
        {choices.map((sp) => (
          <button key={sp.id} className={`panel ${pick?.id === sp.id ? 'highlight' : ''}`} style={{ margin: 0, textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}
            onClick={() => { sfx.select(); setPick(sp); }} aria-pressed={pick?.id === sp.id}>
            <div style={{ background: 'var(--slate)', border: '2px solid #000' }}><Sprite species={sp} scale={2} mode={pick?.id === sp.id ? 'idle' : 'static'} /></div>
            <span className="grow"><span className="name">{sp.common}</span><br /><Types sp={sp} /></span>
            <BirdThumb sp={sp} size={56} />
          </button>
        ))}
      </div>
      <button className="btn primary big block mt16" disabled={!pick} onClick={() => { if (pick) { setPartner(pick); sfx.caught(); onDone(); } }}>
        {pick ? `Choose ${pick.common}` : 'Pick a partner'}
      </button>
      <p className="small muted">Your partner is a gift, not a catch. Your BirdDex fills only with birds you photograph.</p>
    </div>
  );
}
