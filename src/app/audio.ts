// ART-9: chiptune SFX synthesised with WebAudio (no audio files to download or license).
import { getState } from './store';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!getState().settings.sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.08) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(vol, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02);
}

function noise(start: number, dur: number, vol = 0.12, hp = 1200) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export const sfx = {
  tap: () => tone(880, 0, 0.04, 'square', 0.03),
  shutter: () => { noise(0, 0.05, 0.25, 2500); noise(0.06, 0.04, 0.18, 1800); tone(1568, 0.02, 0.06, 'square', 0.05); },
  focus: () => { tone(1320, 0, 0.03, 'square', 0.04); tone(1760, 0.05, 0.03, 'square', 0.04); },
  stamp: () => { tone(110, 0, 0.12, 'triangle', 0.25); noise(0, 0.05, 0.12, 300); },
  page: () => noise(0, 0.14, 0.06, 3000),
  sparkle: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.12, 'square', 0.05)),
  pixel: () => tone(220 + Math.random() * 40, 0, 0.02, 'square', 0.015),
  fanfare: () => {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    seq.forEach((f, i) => tone(f, i * 0.11, i === seq.length - 1 ? 0.5 : 0.1, 'square', 0.06));
    [262, 330, 392, 523].forEach((f, i) => tone(f, i * 0.22, 0.2, 'triangle', 0.08));
  },
  error: () => { tone(330, 0, 0.1, 'square', 0.05); tone(247, 0.1, 0.16, 'square', 0.05); },
};

export function haptic(pattern: number | number[] = 10) {
  if (!getState().settings.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}
