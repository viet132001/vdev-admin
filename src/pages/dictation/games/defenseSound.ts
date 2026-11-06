// Synthesised sound effects, so the game ships no audio files.

type Sfx = 'shoot' | 'boom' | 'crash' | 'wrong' | 'heal' | 'win' | 'lose';

let context: AudioContext | null = null;

const getContext = () => {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor() as AudioContext;
  return context;
};

// iOS only starts audio from inside a user gesture, so call this from the "start" click
export const unlockSfx = () => {
  try {
    void getContext()?.resume();
  } catch {
    // No audio on this device; the game works without it
  }
};

const tone = (ctx: AudioContext, type: OscillatorType, from: number, to: number, start: number, duration: number, volume: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
};

const noise = (ctx: AudioContext, start: number, duration: number, volume: number, cutoff: number) => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  filter.frequency.exponentialRampToValueAtTime(80, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
};

export const playSfx = (name: Sfx) => {
  const ctx = getContext();
  if (!ctx) return;
  try {
    void ctx.resume();
    const t = ctx.currentTime;
    switch (name) {
      case 'shoot':
        tone(ctx, 'sawtooth', 720, 160, t, 0.14, 0.05);
        break;
      case 'boom':
        noise(ctx, t, 0.3, 0.16, 1800);
        tone(ctx, 'sine', 180, 45, t, 0.25, 0.14);
        break;
      case 'crash':
        noise(ctx, t, 0.6, 0.24, 900);
        tone(ctx, 'sine', 110, 30, t, 0.5, 0.22);
        break;
      case 'wrong':
        tone(ctx, 'square', 150, 110, t, 0.16, 0.04);
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => tone(ctx, 'triangle', f, f, t + i * 0.08, 0.16, 0.07));
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(ctx, 'triangle', f, f, t + i * 0.13, 0.3, 0.08));
        break;
      case 'lose':
        noise(ctx, t, 1.2, 0.26, 700);
        [330, 262, 196].forEach((f, i) => tone(ctx, 'sawtooth', f, f * 0.96, t + i * 0.24, 0.32, 0.05));
        break;
    }
  } catch {
    // A failed sound effect must never interrupt the game
  }
};
