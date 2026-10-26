import { api, authFetch } from '../../services/api';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface PracticeSettings {
  rate: number;
  autoPlay: boolean;
  autoReplayTimes: number;
  voiceURI: string;
  showTranslation: 'AFTER_CHECK' | 'ALWAYS';
}

const SETTINGS_KEY = 'dictation_settings';
const DEFAULT_SETTINGS: PracticeSettings = { rate: 1, autoPlay: true, autoReplayTimes: 1, voiceURI: '', showTranslation: 'AFTER_CHECK' };

export const loadSettings = (): PracticeSettings => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: PracticeSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; ignore storage failures
  }
};

export const englishVoices = (): SpeechSynthesisVoice[] =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
    : [];

let currentAudio: HTMLAudioElement | null = null;

// Chrome drops (and can get stuck on) a speak() issued right after cancel() interrupted speech,
// so remember when we last interrupted something and give the engine a moment.
let interruptedAt = 0;
const RESTART_DELAY_MS = 80;

// Kept at module level: Chrome may garbage-collect an unreferenced utterance, and then onend never fires
let currentUtterance: SpeechSynthesisUtterance | null = null;

export const stopPlayback = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) interruptedAt = performance.now();
    synth.cancel();
  }
};

// iOS only allows speech that starts inside a user gesture until it has been "unlocked" once.
// Call this from a tap/click handler before speech that will start from a timer or animation frame.
export const unlockSpeech = () => {
  if (!('speechSynthesis' in window) || window.speechSynthesis.speaking) return;
  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
};

const speak = (text: string, rate: number, voiceURI: string) =>
  new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = englishVoices();
    utterance.voice = voices.find((v) => v.voiceURI === voiceURI) || voices.find((v) => v.lang === 'en-US') || voices[0] || null;
    utterance.lang = utterance.voice?.lang || 'en-US';
    utterance.rate = rate;

    let started = false;
    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach((t) => window.clearTimeout(t));
      if (currentUtterance === utterance) currentUtterance = null;
      resolve();
    };
    utterance.onstart = () => { started = true; };
    utterance.onend = finish;
    utterance.onerror = finish;
    currentUtterance = utterance;

    const start = () => {
      if (currentUtterance !== utterance) return finish(); // superseded while waiting
      // A tab that was hidden can leave the engine paused, which silences everything after it
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      // Watchdogs so callers (e.g. the play button) never wait forever on a stuck engine:
      // nothing started → reset the engine; started but onend never came → give up after a generous estimate
      timers.push(window.setTimeout(() => {
        if (started || done) return;
        synth.cancel();
        finish();
      }, 2500));
      timers.push(window.setTimeout(finish, 3000 + (text.length * 150) / Math.max(rate, 0.1)));
    };

    // Speak synchronously when possible: on iOS the first speech must happen inside the user gesture
    if (performance.now() - interruptedAt < RESTART_DELAY_MS) window.setTimeout(start, RESTART_DELAY_MS);
    else start();
  });

// Plays the sentence's uploaded audio when it has one, otherwise (or if the file fails) the browser's English voice
export const playSentence = async (sentence: { text: string; audioUrl?: string | null }, rate: number, voiceURI: string) => {
  stopPlayback();
  if (sentence.audioUrl) {
    const audio = new Audio(sentence.audioUrl.startsWith('http') ? sentence.audioUrl : `${API_BASE}${sentence.audioUrl}`);
    audio.playbackRate = rate;
    currentAudio = audio;
    const played = await new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
    if (currentAudio !== audio) return;
    currentAudio = null;
    if (played) return;
  }
  await speak(sentence.text, rate, voiceURI);
};

// Same upload flow as the Learning module: real endpoint first, then the api helper (mock fallback)
export const uploadAudio = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const response = await authFetch('/api/storage/upload', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await response.text() || 'Upload failed');
    const json = await response.json();
    const id = json.data?.file?.id || json.file?.id || json.data?.id || json.id;
    if (id) return id;
    throw new Error('Không nhận được fileId');
  } catch (err: any) {
    if (err?.name !== 'TypeError') throw err;
    const res = await api.post('/api/storage/upload', formData);
    return res.file?.id || res.id;
  }
};
