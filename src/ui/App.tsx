import { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { NavCtx, Nav, Route, Tab } from './nav';
import { useGame, isReady, getState } from '../app/store';
import { Icon, Toast } from './components';
import { Boot, Onboarding } from './screens/Onboarding';
import { Field } from './screens/Field';
import { Journal } from './screens/Journal';
import { MapTab, HabitatTab, YouTab, BadgesScreen, ChallengesScreen, YearScreen } from './screens/Tabs';
import { WindowMode } from './screens/WindowMode';
import { Viewfinder } from './screens/Viewfinder';
import { CatchFlow } from './screens/Catch';
import { SpeciesCard } from './screens/SpeciesCard';
import { Spread } from './screens/Spread';
import { Sketch } from './screens/Sketch';
import { Settings, Debug, Lab } from './screens/Settings';
import { sfx } from '../app/audio';
import { challengeProgress } from '../core/challenges';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'field', label: 'Field', icon: 'field' }, { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'map', label: 'Map', icon: 'map' }, { id: 'habitat', label: 'Habitat', icon: 'habitat' }, { id: 'you', label: 'You', icon: 'you' },
];

function renderRoute(r: Route) {
  switch (r.name) {
    case 'species': return <SpeciesCard id={r.id} sightingId={r.sightingId} />;
    case 'spread': return <Spread sightingId={r.sightingId} />;
    case 'viewfinder': return <Viewfinder />;
    case 'window': return <WindowMode sit={r.sit} starter={r.starter} />;
    case 'catch': return <CatchFlow job={r.job} />;
    case 'sketch': return <Sketch />;
    case 'badges': return <BadgesScreen />;
    case 'challenges': return <ChallengesScreen />;
    case 'settings': return <Settings />;
    case 'year': return <YearScreen />;
    case 'lab': return <Lab />;
    case 'debug': return <Debug />;
  }
}

export function App() {
  const ready = useGame(() => isReady());
  const onboarded = useGame((s) => s.onboarded);
  useGame((s) => s.challenges); // re-render tab dot when challenges change
  useGame((s) => s.sightings.length);
  const dys = useGame((s) => s.settings.dyslexiaFont);
  const motion = useGame((s) => s.settings.motion);
  const [booted, setBooted] = useState(false);
  const [tab, setTabState] = useState<Tab>(() => (location.hash.slice(2) as Tab) || 'field');
  const [stack, setStack] = useState<Route[]>(() => (location.hash === '#/lab' ? [{ name: 'lab' }] : []));
  const [toast, setToast] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    document.documentElement.classList.toggle('dyslexia', dys);
    document.documentElement.classList.toggle('motion-reduced', motion === 'reduced');
    document.documentElement.classList.toggle('motion-full', motion === 'full');
  }, [dys, motion]);

  // Android back button / browser back closes the top overlay
  useEffect(() => {
    const onPop = () => { if (stackRef.current.length) setStack((s) => s.slice(0, -1)); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', `#/${t}`);
  }, []);
  const nav: Nav = {
    tab, setTab, stack, highlight, setHighlight,
    open: (r) => { history.pushState({ o: true }, ''); setStack((s) => [...s, r]); },
    replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
    back: () => { if (stackRef.current.length) history.back(); },
    closeAll: () => { const n = stackRef.current.length; setStack([]); if (n) history.go(-n); },
    toast: (t) => setToast(t),
  };

  if (!ready) return <div className="app" aria-busy="true" />;
  if (!booted) return <div className="app"><Boot onDone={() => setBooted(true)} /></div>;
  if (!onboarded) {
    return (
      <div className="app">
        <Onboarding onFinish={() => { setTab('field'); nav.open({ name: 'window', starter: true }); }} />
      </div>
    );
  }

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} aria-hidden={stack.length > 0}>
          {tab === 'field' && <Field />}
          {tab === 'journal' && <Journal />}
          {tab === 'map' && <MapTab />}
          {tab === 'habitat' && <HabitatTab />}
          {tab === 'you' && <YouTab />}
        </main>
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => { sfx.tap(); setTab(t.id); }}>
              <Icon name={t.icon} size={24} filled={tab === t.id} />{t.label}
              {t.id === 'you' && hasClaimable() && <span className="dot" aria-label="Challenge ready to claim" />}
            </button>
          ))}
        </nav>
        {stack.map((r, i) => <div key={i} style={{ display: 'contents' }} aria-hidden={i < stack.length - 1}>{renderRoute(r)}</div>)}
        {toast && <Toast text={toast} onDone={() => setToast(null)} />}
      </div>
      <p className="desk-note"><b>PIXEL BIRDER</b> is built for phones. Open this page on your phone and add it to your home screen to play.</p>
    </NavCtx.Provider>
  );
}

function hasClaimable() {
  const st = getState();
  const now = new Date();
  const slots = [...st.challenges.daily, st.challenges.weekly, st.challenges.seasonal].filter(Boolean) as typeof st.challenges.daily;
  return slots.some((s) => !s.claimed && challengeProgress(st, s, now).done);
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="app"><div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <h2>PIXEL BIRDER tripped over a branch.</h2>
        <p className="small">Your journal is safe — it is saved on this phone after every catch. Reload to carry on.</p>
        <pre className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.err.message).slice(0, 300)}</pre>
        <button className="btn primary big block" onClick={() => location.reload()}>Reload</button>
      </div></div>
    );
  }
}
