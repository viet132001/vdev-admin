import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '../context/ThemeContext';

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Hệ thống', icon: Monitor },
];

/** Segmented control: Sáng / Tối / Hệ thống (sidebar). */
export const ThemeSwitch: React.FC = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Giao diện">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          className={theme === value ? 'active' : ''}
          onClick={() => setTheme(value)}
          title={label}
        >
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

/** Single icon button that flips light ↔ dark (auth pages, mobile header). */
export const ThemeToggleButton: React.FC<{ className?: string }> = ({ className }) => {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle-btn ${className || ''}`}
      onClick={() => setTheme(next)}
      aria-label={next === 'dark' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
      title={next === 'dark' ? 'Giao diện tối' : 'Giao diện sáng'}
    >
      <Icon size={18} />
    </button>
  );
};
