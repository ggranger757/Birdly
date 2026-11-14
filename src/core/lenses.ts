// Snap Lenses: cosmetic. Each records birds with its own effect (owner-supplied fx sheets in public/fx).
export type LensId = 'ripple' | 'bubble' | 'ember' | 'arcane' | 'phantom';

export interface Lens {
  id: LensId; name: string; price: number; desc: string;
  /** Snap Power bonus added to every field photo recorded with this lens */
  power: number;
  fx: { src: string; fw: number; fh: number; frames: number; fps: number };
  /** how the effect is laid out around the bird */
  pattern: 'single' | 'ring3' | 'swarm';
  /** capsule colours: A = shell, a = shell shade, g = glass */
  colors: { A: string; a: string; g: string };
}

export const LENSES: Record<LensId, Lens> = {
  ripple: { id: 'ripple', power: 0, name: 'Ripple Lens', price: 0, desc: 'A soft ring of light. Every explorer starts with one.',
    fx: { src: 'fx/ripple.png', fw: 40, fh: 40, frames: 8, fps: 14 }, pattern: 'single', colors: { A: '#B3B0FF', a: '#6F6AE0', g: '#E4E2FF' } },
  bubble: { id: 'bubble', power: 5, name: 'Bubble Lens', price: 60, desc: 'Records your bird in a stream of bubbles.',
    fx: { src: 'fx/bubble.png', fw: 11, fh: 11, frames: 3, fps: 8 }, pattern: 'swarm', colors: { A: '#7CCBFF', a: '#2F7FD0', g: '#D8F1FF' } },
  ember: { id: 'ember', power: 10, name: 'Ember Lens', price: 120, desc: 'Three flaming crescents spin around your bird.',
    fx: { src: 'fx/ember.png', fw: 16, fh: 26, frames: 6, fps: 14 }, pattern: 'ring3', colors: { A: '#FF9A3C', a: '#D2541A', g: '#FFD69A' } },
  arcane: { id: 'arcane', power: 15, name: 'Arcane Lens', price: 180, desc: 'Violet crescents: Merlin’s own favourite.',
    fx: { src: 'fx/arcane.png', fw: 16, fh: 26, frames: 6, fps: 14 }, pattern: 'ring3', colors: { A: '#B98AFF', a: '#6F3FD0', g: '#E6D4FF' } },
  phantom: { id: 'phantom', power: 20, name: 'Phantom Lens', price: 260, desc: 'A spooky spirit swirl that fades to sparkles.',
    fx: { src: 'fx/phantom.png', fw: 64, fh: 64, frames: 8, fps: 12 }, pattern: 'single', colors: { A: '#FF6BD6', a: '#B02A92', g: '#FFC9F1' } },
};
export const LENS_ORDER: LensId[] = ['ripple', 'bubble', 'ember', 'arcane', 'phantom'];
/** Snap Power after the lens bonus (field photos only), capped at 100. */
export const boostedPower = (base: number, lens?: string) => Math.min(100, base + lensOf(lens).power);
export const lensOf = (id?: string): Lens => LENSES[(id as LensId)] ?? LENSES.ripple;
