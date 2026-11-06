import React, { useEffect, useRef, useState } from 'react';
import { Heart, Pause, Play } from 'lucide-react';
import { vocabularyKey } from '../grading';
import { AnswerForm } from './GameStage';
import { type GameProps, type GameResult, type GameWord, accuracyOf, buzz, maskTerm, nextUid, shuffle, speakAsImp, startLoop } from './common';
import { createDefenseScene, type DefenseScene, type SceneEnemy } from './defenseScene';
import { playSfx } from './defenseSound';

// Castle defense: imps carrying Vietnamese meanings dive at the castle, typing the English term shoots them down.

interface Enemy {
  uid: number;
  word: GameWord;
  x: number; // center, fraction of field width
  y: number; // 0 = top, 1 = reached the wall
  fall: number; // seconds to reach the wall at speed 1
}

const CONFIG = {
  easy: { fall: 20, spawn: 3.4, maxOnField: 3 },
  normal: { fall: 14, spawn: 2.4, maxOnField: 4 },
  hard: { fall: 9.5, spawn: 1.6, maxOnField: 6 }
};
const LIVES = 5;
// Adaptive speed: each destroyed prompt nudges it up, each one reaching the wall eases it off,
// so long sessions settle at a pace the player can keep instead of ramping forever
const SPEED = { max: 1.4, up: 0.015, down: 0.15 };
const HEAL_COMBO = 10; // regain a life every this many prompts destroyed in a row
const HINT_FROM = 0.5; // reveal first letters once a prompt has fallen this far
const INTRO_SECONDS = 1.1; // let the opening banner play before the first imp
const ENDING_MS = 2200; // ending scene (fireworks / collapse) before the result screen

const toSceneEnemy = (e: Enemy): SceneEnemy => ({
  uid: e.uid,
  x: e.x,
  y: e.y,
  meaning: e.word.meaning,
  mask: e.y > HINT_FROM ? maskTerm(e.word.term) : null
});

export const DefenseGame: React.FC<GameProps> = ({ words, difficulty, sound, onFinish }) => {
  const config = CONFIG[difficulty];
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const game = useRef({
    queue: shuffle(words),
    enemies: [] as Enemy[],
    elapsed: 0,
    sinceSpawn: Infinity,
    lives: LIVES,
    speed: 1,
    score: 0,
    combo: 0,
    bestCombo: 0,
    submits: 0,
    destroyed: [] as GameWord[],
    missed: [] as GameWord[],
    ending: null as { at: number; result: GameResult } | null
  });
  const finished = useRef(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DefenseScene | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const sfx = (name: Parameters<typeof playSfx>[0]) => { if (soundRef.current) playSfx(name); };

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Must run before the game loop effect below, which draws through the scene
  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    if (!field || !canvas) return;
    const scene = createDefenseScene(canvas);
    sceneRef.current = scene;
    const fit = () => {
      scene.resize(field.clientWidth, field.clientHeight);
      // Keeps the field drawn when the size changes while paused
      scene.render(game.current.enemies.map(toSceneEnemy), game.current.lives, 0);
    };
    fit();
    scene.showBanner('GIỮ THÀNH!');
    const observer = new ResizeObserver(fit);
    observer.observe(field);
    return () => {
      observer.disconnect();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    return startLoop((dt, now) => {
      const s = game.current;
      const scene = sceneRef.current;
      const speed = s.speed;
      let hudChanged = false;

      if (s.ending) {
        scene?.render(s.enemies.map(toSceneEnemy), s.lives, dt);
        if (now - s.ending.at < ENDING_MS) return true;
        if (!finished.current) {
          finished.current = true;
          onFinish(s.ending.result);
        }
        return false;
      }

      s.elapsed += dt;
      s.sinceSpawn += dt;
      const canSpawn = s.elapsed >= INTRO_SECONDS && (s.enemies.length === 0 || (s.sinceSpawn >= config.spawn / speed && s.enemies.length < config.maxOnField));
      if (s.queue.length && canSpawn) {
        // Avoid stacking a new prompt right on top of one that has just started falling
        const crowded = s.enemies.filter((e) => e.y < 0.3).map((e) => e.x);
        let x = 0.14 + Math.random() * 0.72;
        for (let tries = 0; tries < 6 && crowded.some((c) => Math.abs(c - x) < 0.24); tries++) x = 0.14 + Math.random() * 0.72;
        const word = s.queue.shift()!;
        s.enemies.push({ uid: nextUid(), word, x, y: 0, fall: config.fall * (0.9 + Math.random() * 0.2) });
        s.sinceSpawn = 0;
        hudChanged = true;
      }

      s.enemies.forEach((e) => { e.y += (dt * speed) / e.fall; });
      const landed = s.enemies.filter((e) => e.y >= 1);
      if (landed.length) {
        s.enemies = s.enemies.filter((e) => e.y < 1);
        s.lives = Math.max(0, s.lives - landed.length);
        s.speed = Math.max(1, s.speed - SPEED.down * landed.length);
        s.combo = 0;
        hudChanged = true;
        buzz(120);
        sfx('crash');
        landed.forEach((e) => {
          s.missed.push(e.word);
          scene?.crash(toSceneEnemy(e), e.word.term, e.word.meaning);
        });
      }

      if (s.lives <= 0 || (!s.queue.length && !s.enemies.length)) {
        const won = s.lives > 0;
        s.ending = {
          at: now,
          result: {
            won,
            score: s.score,
            correct: s.destroyed.length,
            total: words.length,
            bestCombo: s.bestCombo,
            accuracy: accuracyOf(s.destroyed.length, s.submits),
            // Words that never fell because the castle fell first count as missed too
            missed: [...s.missed, ...s.enemies.map((e) => e.word), ...s.queue]
          }
        };
        if (won) scene?.win();
        else scene?.lose();
        sfx(won ? 'win' : 'lose');
        hudChanged = true;
      }

      scene?.render(s.enemies.map(toSceneEnemy), s.lives, dt);
      // The field is canvas, so React only needs a render when the HUD changes
      if (hudChanged) setFrame((f) => f + 1);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, config, words.length, onFinish]);

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
    const s = game.current;
    if (!key || paused || s.ending) return;
    s.submits += 1;
    const targets = s.enemies.filter((e) => vocabularyKey(e.word.term) === key);
    if (!targets.length) {
      s.combo = 0;
      setWrong(true);
      sceneRef.current?.misfire();
      sfx('wrong');
      buzz([40, 40, 40]);
      inputRef.current?.select();
      return;
    }
    const target = targets.reduce((a, b) => (b.y > a.y ? b : a));
    s.enemies = s.enemies.filter((e) => e !== target);
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.speed = Math.min(SPEED.max, s.speed + SPEED.up);
    if (s.combo % HEAL_COMBO === 0 && s.lives < LIVES) {
      s.lives += 1;
      sceneRef.current?.heal();
      sfx('heal');
    }
    const points = 10 + Math.round((1 - target.y) * 10) + Math.min(s.combo, 10) * 2;
    s.score += points;
    s.destroyed.push(target.word);
    sceneRef.current?.fire(toSceneEnemy(target), target.word.term, points, s.combo);
    sfx('shoot');
    window.setTimeout(() => sfx('boom'), 130);
    if (sound) speakAsImp(target.word.term, target.uid);
    buzz(25);
    setInput('');
    setWrong(false);
    inputRef.current?.focus();
  };

  const s = game.current;

  return (
    <>
      <div ref={fieldRef} className="vd-field" onClick={() => inputRef.current?.focus()}>
        <canvas ref={canvasRef} className="vd-canvas" aria-hidden="true" />
        <div className="vd-hud">
          <div className="vd-lives" title={`${s.lives}/${LIVES} mạng`}>
            {Array.from({ length: LIVES }, (_, i) => <Heart key={i} size={16} className={i < s.lives ? 'on' : ''} />)}
          </div>
          <div className="vd-score"><b>{s.score}</b>{s.combo > 1 && <span key={s.combo} className="vd-combo">Combo x{s.combo}</span>}</div>
          <div className="vd-hud-end">
            <span>Còn {s.queue.length + s.enemies.length}/{words.length}</span>
            <button className="vd-pause" title="Tạm dừng (Esc)" onClick={(e) => { e.stopPropagation(); if (paused) resume(); else setPaused(true); }}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        </div>
        {paused && (
          <div className="vd-overlay">
            <b>Tạm dừng</b>
            <button className="btn btn-primary" onClick={resume}><Play size={16} /> Tiếp tục</button>
          </div>
        )}
      </div>

      <AnswerForm
        inputRef={inputRef}
        value={input}
        wrong={wrong}
        disabled={paused}
        placeholder="Gõ từ tiếng Anh..."
        submitTitle="Bắn (Enter)"
        onChange={(value) => { setInput(value); setWrong(false); }}
        onSubmit={submit}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); if (paused) resume(); else setPaused(true); } }}
      />
      <p className="gm-help">
        <span className="dc-kbd">Enter</span> bắn · <span className="dc-kbd">Esc</span> tạm dừng · không phân biệt hoa thường
      </p>
    </>
  );
};
