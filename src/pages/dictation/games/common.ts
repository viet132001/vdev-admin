import { loadSettings, playSentence } from '../media';

// Shared types and helpers for the vocabulary mini-games (see src/doc/dictation-api.md section 13)

export interface GameWord {
  term: string;
  meaning: string;
  sentence?: string;
}

export interface GameResult {
  won: boolean;
  score: number;
  correct: number;
  total: number;
  bestCombo: number;
  accuracy: number; // % of answers that were right
  missed: GameWord[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Dễ', normal: 'Vừa', hard: 'Khó' };

export interface GameProps {
  words: GameWord[];
  difficulty: Difficulty;
  sound: boolean;
  onFinish: (result: GameResult) => void;
}

let uidSeq = 0;
export const nextUid = () => ++uidSeq;

export const shuffle = <T,>(items: T[]) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// "large latte" → "l____ l____"
export const maskTerm = (term: string, reveal = 1) =>
  term.split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? w : w.slice(0, reveal) + w.slice(reveal).replace(/[a-z0-9]/gi, '_'))).join('');

export const speakTerm = (term: string) => {
  const settings = loadSettings();
  return playSentence({ text: term }, settings.rate, settings.voiceURI);
};

// Short haptic feedback on phones that support it
export const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported — ignore
  }
};

export const readStore = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeStore = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best scores / preferences are conveniences; ignore storage failures
  }
};

export const accuracyOf = (right: number, attempts: number) => (attempts ? Math.round((right / attempts) * 100) : 0);

// Requests animation frames while `active`, passing the elapsed seconds (capped so a background tab doesn't jump)
export const startLoop = (step: (dt: number, now: number) => boolean) => {
  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (step(dt, now)) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};
