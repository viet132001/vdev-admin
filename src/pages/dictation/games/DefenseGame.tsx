import React, { useEffect, useRef, useState } from 'react';
import { Castle, Headphones, Heart, Pause, Play, SendHorizontal } from 'lucide-react';
import { vocabularyKey } from '../grading';
import { GameHud } from './GameStage';
import { type GameProps, type GameWord, accuracyOf, buzz, maskTerm, nextUid, shuffle, speakTerm, startLoop } from './common';

// Tower defense: prompts fall towards the castle, typing the English term destroys them.
// prompt "meaning" shows the Vietnamese meaning; "audio" only plays the term (tap to replay).

interface Enemy {
  uid: number;
  word: GameWord;
  x: number; // left, % of field width
  y: number; // 0 = top, 1 = reached the wall
  fall: number; // seconds to reach the wall at speed 1
}

interface Fx {
  uid: number;
  kind: 'hit' | 'miss';
  x: number;
  y: number;
  text: string;
  sub?: string;
  at: number;
}

const CONFIG = {
  easy: { fall: 16, spawn: 3.4, maxOnField: 3 },
  normal: { fall: 11, spawn: 2.4, maxOnField: 4 },
  hard: { fall: 7.5, spawn: 1.6, maxOnField: 6 }
};
const LIVES = 5;
const FX_MS = { hit: 900, miss: 1800 };
const HINT_FROM = 0.5; // reveal first letters once a prompt has fallen this far

export const DefenseGame: React.FC<GameProps & { prompt: 'meaning' | 'audio' }> = ({ words, difficulty, sound, onFinish, prompt }) => {
  const listen = prompt === 'audio';
  const config = CONFIG[difficulty];
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const game = useRef({
    queue: shuffle(words),
    enemies: [] as Enemy[],
    fx: [] as Fx[],
    sinceSpawn: Infinity,
    lives: LIVES,
    score: 0,
    combo: 0,
    bestCombo: 0,
    submits: 0,
    destroyed: [] as GameWord[],
    missed: [] as GameWord[]
  });
  const finished = useRef(false);
  // Prompts are wider relative to the field on phones, so keep them further from the right edge
  const maxX = useRef(window.matchMedia('(max-width: 768px)').matches ? 52 : 64).current;

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (paused) return;
    return startLoop((dt, now) => {
      const s = game.current;
      const speed = Math.min(1 + Math.floor(s.destroyed.length / 5) * 0.08, 1.8);

      s.sinceSpawn += dt;
      const canSpawn = s.enemies.length === 0 || (s.sinceSpawn >= config.spawn / speed && s.enemies.length < config.maxOnField);
      if (s.queue.length && canSpawn) {
        // Avoid stacking a new prompt right on top of one that has just started falling
        const crowded = s.enemies.filter((e) => e.y < 0.3).map((e) => e.x);
        let x = 2 + Math.random() * (maxX - 2);
        for (let tries = 0; tries < 6 && crowded.some((c) => Math.abs(c - x) < 24); tries++) x = 2 + Math.random() * (maxX - 2);
        const word = s.queue.shift()!;
        s.enemies.push({ uid: nextUid(), word, x, y: 0, fall: config.fall * (listen ? 1.25 : 1) * (0.9 + Math.random() * 0.2) });
        s.sinceSpawn = 0;
        if (listen) speakTerm(word.term);
      }

      s.enemies.forEach((e) => { e.y += (dt * speed) / e.fall; });
      const landed = s.enemies.filter((e) => e.y >= 1);
      if (landed.length) {
        s.enemies = s.enemies.filter((e) => e.y < 1);
        s.lives = Math.max(0, s.lives - landed.length);
        s.combo = 0;
        buzz(120);
        landed.forEach((e) => {
          s.missed.push(e.word);
          s.fx.push({ uid: nextUid(), kind: 'miss', x: e.x, y: 1, text: e.word.term, sub: e.word.meaning, at: now });
        });
      }
      s.fx = s.fx.filter((f) => now - f.at < FX_MS[f.kind]);
      setFrame((f) => f + 1);

      if (s.lives <= 0 || (!s.queue.length && !s.enemies.length)) {
        if (!finished.current) {
          finished.current = true;
          onFinish({
            won: s.lives > 0,
            score: s.score,
            correct: s.destroyed.length,
            total: words.length,
            bestCombo: s.bestCombo,
            accuracy: accuracyOf(s.destroyed.length, s.submits),
            // Words that never fell because the castle fell first count as missed too
            missed: [...s.missed, ...s.enemies.map((e) => e.word), ...s.queue]
          });
        }
        return false;
      }
      return true;
    });
  }, [paused, config, listen, maxX, words.length, onFinish]);

  // Pause when the tab is hidden so prompts don't fall unseen
  useEffect(() => {
    const onHide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const resume = () => {
    setPaused(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    const key = vocabularyKey(input);
    if (!key || paused) return;
    const s = game.current;
    s.submits += 1;
    const targets = s.enemies.filter((e) => vocabularyKey(e.word.term) === key);
    if (!targets.length) {
      s.combo = 0;
      setWrong(true);
      buzz([40, 40, 40]);
      inputRef.current?.select();
      return;
    }
    const target = targets.reduce((a, b) => (b.y > a.y ? b : a));
    s.enemies = s.enemies.filter((e) => e !== target);
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += 10 + Math.round((1 - target.y) * 10) + Math.min(s.combo, 10) * 2 + (listen ? 5 : 0);
    s.destroyed.push(target.word);
    s.fx.push({ uid: nextUid(), kind: 'hit', x: target.x, y: target.y, text: target.word.term, sub: listen ? target.word.meaning : undefined, at: performance.now() });
    if (sound) speakTerm(target.word.term);
    buzz(25);
    setInput('');
    setWrong(false);
    inputRef.current?.focus();
  };

  const s = game.current;

  return (
    <>
      <GameHud score={s.score} combo={s.combo} progress={`Còn ${s.queue.length + s.enemies.length}/${words.length}`}>
        <div className="flex align-center" style={{ gap: 2 }} title={`${s.lives}/${LIVES} mạng`}>
          {Array.from({ length: LIVES }, (_, i) => <Heart key={i} size={15} className={i < s.lives ? 'gm-heart' : 'gm-heart lost'} />)}
        </div>
        <button className="icon-btn gm-hud-end" title="Tạm dừng (Esc)" onClick={() => (paused ? resume() : setPaused(true))}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </GameHud>

      <div className="vd-field" onClick={() => inputRef.current?.focus()}>
        <div className="vd-sky">
          {s.enemies.map((e) => (
            <div
              key={e.uid}
              className={`vd-enemy ${e.y > 0.75 ? 'danger' : ''} ${listen ? 'listen' : ''}`}
              style={{ left: `${e.x}%`, top: `calc(${e.y} * (100% - 52px))` }}
              onClick={listen ? (ev) => { ev.stopPropagation(); speakTerm(e.word.term); inputRef.current?.focus(); } : undefined}
            >
              {listen ? <Headphones size={16} /> : <span>{e.word.meaning}</span>}
              {(listen || e.y > HINT_FROM) && <span className="vd-mask">{maskTerm(e.word.term, e.y > HINT_FROM ? 1 : 0)}</span>}
            </div>
          ))}
          {s.fx.map((f) => (
            <div key={f.uid} className={`vd-fx ${f.kind}`} style={{ left: `${f.x}%`, top: `calc(${f.y} * (100% - 52px))` }}>
              <b>{f.text}</b>
              {f.sub && <span>{f.sub}</span>}
            </div>
          ))}
        </div>
        <div className="vd-wall"><Castle size={18} /></div>
        {paused && (
          <div className="vd-overlay">
            <b>Tạm dừng</b>
            <button className="btn btn-primary" onClick={resume}><Play size={16} /> Tiếp tục</button>
          </div>
        )}
      </div>

      <form className="gm-answer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          ref={inputRef}
          className={`form-input dc-input ${wrong ? 'vd-wrong' : ''}`}
          placeholder={listen ? 'Gõ từ bạn nghe được...' : 'Gõ từ tiếng Anh...'}
          value={input}
          disabled={paused}
          onChange={(e) => { setInput(e.target.value); setWrong(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); if (paused) resume(); else setPaused(true); } }}
          enterKeyHint="send"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button type="submit" className="btn btn-primary" disabled={paused || !input.trim()} title="Bắn (Enter)"><SendHorizontal size={18} /></button>
      </form>
      <p className="gm-help">
        {listen ? 'Chạm vào ô tai nghe để nghe lại · ' : ''}<span className="dc-kbd">Enter</span> bắn · <span className="dc-kbd">Esc</span> tạm dừng · không phân biệt hoa thường
      </p>
    </>
  );
};
