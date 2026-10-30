import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, SendHorizontal, X } from 'lucide-react';
import { readStore, writeStore } from './common';

// Frame for a running game. On phones it covers the whole screen and follows the visual viewport,
// so the play field and the input stay visible above the on-screen keyboard.
export const GameStage: React.FC<{ title: string; onExit: () => void; children: React.ReactNode }> = ({ title, onExit, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      ref.current?.style.setProperty('--vvh', `${vv.height}px`);
      ref.current?.style.setProperty('--vvt', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <div ref={ref} className="gm-stage">
      <div className="gm-stage-bar">
        <b>{title}</b>
        <button className="icon-btn" title="Thoát trò chơi" onClick={onExit}><X size={18} /></button>
      </div>
      <div className="gm-stage-body">{children}</div>
    </div>
  );
};

export const GameHud: React.FC<{ score: number; combo: number; progress: string; children?: React.ReactNode }> = ({ score, combo, progress, children }) => (
  <div className="gm-hud">
    {children}
    <span><b>{score}</b> điểm</span>
    {combo > 1 && <span className="gm-combo">x{combo}</span>}
    <span className="gm-progress">{progress}</span>
  </div>
);

export const TimerBar: React.FC<{ ratio: number }> = ({ ratio }) => (
  <div className={`gm-timer ${ratio < 0.3 ? 'low' : ''}`}>
    <div style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
  </div>
);

// Pages can't turn off a phone's Vietnamese IME (Telex turns "nurse" into "núe"), but keyboards drop it
// in password fields, so the EN toggle renders the answer box as a password input with visible text
const PLAIN_KEYS_KEY = 'dictation_game_plain_keyboard';

interface AnswerFormProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  wrong: boolean;
  disabled?: boolean;
  placeholder: string;
  submitTitle: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

// Answer box for the typing games: Enter submits, the EN button turns off the phone's Vietnamese typing
export const AnswerForm: React.FC<AnswerFormProps> = ({ inputRef, value, wrong, disabled, placeholder, submitTitle, onChange, onSubmit, onKeyDown }) => {
  const [plainKeys, setPlainKeys] = useState(() => readStore(PLAIN_KEYS_KEY) === '1');

  const togglePlainKeys = () => {
    const next = !plainKeys;
    setPlainKeys(next);
    writeStore(PLAIN_KEYS_KEY, next ? '1' : '0');
    // Re-focus so the phone reopens the keyboard for the new input type
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <form className="gm-answer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <input
        ref={inputRef}
        type={plainKeys ? 'password' : 'text'}
        className={`form-input dc-input ${wrong ? 'vd-wrong' : ''} ${plainKeys ? 'gm-plain-keys' : ''}`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="send"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
      />
      <button
        type="button"
        className={`btn btn-secondary gm-kbd-toggle ${plainKeys ? 'active' : ''}`}
        title={plainKeys ? 'Đang tắt gõ tiếng Việt — bấm để bật lại' : 'Tắt gõ tiếng Việt (Telex/VNI) của bàn phím'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={togglePlainKeys}
      >
        <Keyboard size={16} /> EN
      </button>
      <button type="submit" className="btn btn-primary" disabled={disabled || !value.trim()} title={submitTitle}><SendHorizontal size={18} /></button>
    </form>
  );
};
