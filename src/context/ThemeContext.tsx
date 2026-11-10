import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'vdev_theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage blocked: fall back to system */ }
  return 'system';
};

const resolve = (pref: ThemePref): Resolved =>
  pref === 'system' ? (media().matches ? 'dark' : 'light') : pref;

// Same logic as the inline script in index.html (that one runs before paint to avoid a flash)
const apply = (theme: Resolved) => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};

interface ThemeCtx {
  theme: ThemePref;
  resolved: Resolved;
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePref>(readPref);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(readPref()));

  useEffect(() => {
    const next = resolve(theme);
    setResolved(next);
    apply(next);
    if (theme !== 'system') return;
    // Follow the OS live only while the user picked "system"
    const mq = media();
    const onChange = () => { const r = resolve('system'); setResolved(r); apply(r); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeCtx => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
