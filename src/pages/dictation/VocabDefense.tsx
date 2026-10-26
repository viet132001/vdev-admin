import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Castle, Gamepad2, Heart, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { vocabularyKey } from './grading';
import { loadSettings, playSentence } from './media';

// Tower-defense vocabulary game: Vietnamese meanings fall towards the castle,
// typing the matching English term destroys them (and reads the term aloud).

interface GameWord {
  term: string;
  meaning: string;
  sentence?: string;
}

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

interface GameState {
  queue: GameWord[];
  enemies: Enemy[];
  fx: Fx[];
  sinceSpawn: number;
  lives: number;
  score: number;
  combo: number;
  bestCombo: number;
  submits: number;
  destroyed: GameWord[];
  missed: GameWord[];
  total: number;
}

type Phase = 'loading' | 'empty' | 'ready' | 'playing' | 'paused' | 'over';
type Difficulty = 'easy' | 'normal' | 'hard';

const DIFFICULTIES: Record<Difficulty, { label: string; fall: number; spawn: number; maxOnField: number }> = {
  easy: { label: 'Dễ', fall: 16, spawn: 3.4, maxOnField: 3 },
  normal: { label: 'Vừa', fall: 11, spawn: 2.4, maxOnField: 4 },
  hard: { label: 'Khó', fall: 7.5, spawn: 1.6, maxOnField: 6 }
};
const LIVES = 5;
const FX_MS = { hit: 900, miss: 1800 };
const HINT_FROM = 0.5; // show the masked term once a meaning has fallen this far
const SOUND_KEY = 'dictation_game_sound';

let uidSeq = 0;
const nextUid = () => ++uidSeq;

const shuffle = <T,>(items: T[]) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// "large latte" → "l____ l____"
const maskTerm = (term: string) =>
  term.split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? w : w.slice(0, 1) + w.slice(1).replace(/[a-z0-9]/gi, '_'))).join('');

// Speeds up a little every 5 words destroyed
const speedOf = (s: GameState) => Math.min(1 + Math.floor(s.destroyed.length / 5) * 0.08, 1.8);

const readStore = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStore = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best score / sound preference are conveniences; ignore storage failures
  }
};

const newState = (words: GameWord[]): GameState => ({
  queue: shuffle(words),
  enemies: [],
  fx: [],
  sinceSpawn: Infinity,
  lives: LIVES,
  score: 0,
  combo: 0,
  bestCombo: 0,
  submits: 0,
  destroyed: [],
  missed: [],
  total: words.length
});

interface VocabDefenseProps {
  scope: 'lesson' | 'session';
  id: string;
  onManage?: () => void;
}

export const VocabDefense: React.FC<VocabDefenseProps> = ({ scope, id, onManage }) => {
  const [words, setWords] = useState<GameWord[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [sound, setSound] = useState(() => readStore(SOUND_KEY) !== 'off');
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const [, setFrame] = useState(0);
  const game = useRef<GameState>(newState([]));
  const inputRef = useRef<HTMLInputElement>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const bestKey = `dictation_game_best:${scope}:${id}:${difficulty}`;
  const [best, setBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  useEffect(() => setBest(Number(readStore(bestKey)) || 0), [bestKey]);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    api
      .get(`/api/dictation/${scope === 'lesson' ? 'lessons' : 'sessions'}/${id}/vocabularies`, { noCache: true })
      .then((list: any) => {
        if (cancelled) return;
        const items = Array.isArray(list) ? list : [];
        setWords(items);
        setPhase(items.length ? 'ready' : 'empty');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        alert(getErrorMessage(err, 'Không tải được từ vựng'));
        setPhase('empty');
      });
    return () => { cancelled = true; };
  }, [scope, id]);

  const speak = useCallback((term: string) => {
    if (!soundRef.current) return;
    const settings = loadSettings();
    playSentence({ text: term }, settings.rate, settings.voiceURI);
  }, []);

  const start = (list: GameWord[]) => {
    game.current = newState(list);
    setInput('');
    setWrong(false);
    setPhase('playing');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const finish = useCallback(() => {
    const s = game.current;
    setNewRecord(s.score > best);
    if (s.score > best) {
      setBest(s.score);
      writeStore(bestKey, String(s.score));
    }
    setPhase('over');
  }, [best, bestKey]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;
    const config = DIFFICULTIES[difficulty];
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = game.current;
      const speed = speedOf(s);

      s.sinceSpawn += dt;
      const canSpawn = s.enemies.length === 0 || (s.sinceSpawn >= config.spawn / speed && s.enemies.length < config.maxOnField);
      if (s.queue.length && canSpawn) {
        // Avoid stacking a new meaning right on top of one that has just started falling
        const crowded = s.enemies.filter((e) => e.y < 0.3).map((e) => e.x);
        let x = 2 + Math.random() * 66;
        for (let tries = 0; tries < 6 && crowded.some((c) => Math.abs(c - x) < 22); tries++) x = 2 + Math.random() * 66;
        s.enemies.push({ uid: nextUid(), word: s.queue.shift()!, x, y: 0, fall: config.fall * (0.9 + Math.random() * 0.2) });
        s.sinceSpawn = 0;
      }

      s.enemies.forEach((e) => { e.y += (dt * speed) / e.fall; });
      const landed = s.enemies.filter((e) => e.y >= 1);
      if (landed.length) {
        s.enemies = s.enemies.filter((e) => e.y < 1);
        s.lives = Math.max(0, s.lives - landed.length);
        s.combo = 0;
        landed.forEach((e) => {
          s.missed.push(e.word);
          s.fx.push({ uid: nextUid(), kind: 'miss', x: e.x, y: 1, text: e.word.term, sub: e.word.meaning, at: now });
        });
      }
      s.fx = s.fx.filter((f) => now - f.at < FX_MS[f.kind]);

      setFrame((f) => f + 1);
      if (s.lives <= 0 || (!s.queue.length && !s.enemies.length)) {
        finish();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, difficulty, finish]);

  // Pause when the tab is hidden so meanings don't fall unseen
  useEffect(() => {
    const onHide = () => { if (document.hidden) setPhase((p) => (p === 'playing' ? 'paused' : p)); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const togglePause = () => {
    if (phase === 'playing') setPhase('paused');
    if (phase === 'paused') {
      setPhase('playing');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const submit = () => {
    const key = vocabularyKey(input);
    if (!key || phase !== 'playing') return;
    const s = game.current;
    s.submits += 1;
    const targets = s.enemies.filter((e) => vocabularyKey(e.word.term) === key);
    if (!targets.length) {
      s.combo = 0;
      setWrong(true);
      inputRef.current?.select();
      return;
    }
    // Several identical answers can't be on the field (terms are unique), but take the lowest to be safe
    const target = targets.reduce((a, b) => (b.y > a.y ? b : a));
    s.enemies = s.enemies.filter((e) => e !== target);
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += 10 + Math.round((1 - target.y) * 10) + Math.min(s.combo, 10) * 2;
    s.destroyed.push(target.word);
    s.fx.push({ uid: nextUid(), kind: 'hit', x: target.x, y: target.y, text: target.word.term, at: performance.now() });
    speak(target.word.term);
    setInput('');
    setWrong(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      togglePause();
    }
  };

  const toggleSound = () => {
    writeStore(SOUND_KEY, sound ? 'off' : 'on');
    setSound(!sound);
  };

  // ---------- render ----------

  if (phase === 'loading') return <div className="loading-container"><span className="spinner"></span><span>Đang tải từ vựng...</span></div>;

  if (phase === 'empty') {
    return (
      <div className="empty-state">
        <Gamepad2 className="empty-state-icon" size={32} />
        <p>Chưa có từ vựng để chơi.</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Thêm từ vựng cho câu ở “Quản lý câu” (mỗi dòng <code>large latte: ly latte lớn</code>) hoặc cột <code>vocabularies</code> khi import.
        </p>
        {onManage && <button className="btn btn-primary mt-4" onClick={onManage}>Thêm từ vựng</button>}
      </div>
    );
  }

  const s = game.current;
  const difficultyPicker = (
    <div className="flex gap-2 align-center" style={{ justifyContent: 'center' }}>
      {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
        <button key={d} className={`btn btn-sm ${difficulty === d ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDifficulty(d)}>
          {DIFFICULTIES[d].label}
        </button>
      ))}
    </div>
  );

  if (phase === 'ready') {
    return (
      <div className="dc-practice">
        <div className="card flex flex-col gap-4" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <Castle size={40} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Thủ thành từ vựng</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 6 }}>
              Nghĩa tiếng Việt rơi xuống thành. Gõ đúng từ tiếng Anh rồi nhấn <span className="dc-kbd">Enter</span> để phá hủy — từ sẽ được đọc lại.
              <br />Để lọt {LIVES} nghĩa là thua. Nghĩa rơi quá nửa sẽ hiện gợi ý chữ cái đầu.
            </p>
          </div>
          <div style={{ fontSize: '0.85rem' }}>{words.length} từ · Kỷ lục ({DIFFICULTIES[difficulty].label}): <b>{best}</b></div>
          {difficultyPicker}
          <button className="btn btn-primary" onClick={() => start(words)}><Play size={16} /> Bắt đầu</button>
        </div>
      </div>
    );
  }

  if (phase === 'over') {
    const won = s.lives > 0;
    const accuracy = s.submits ? Math.round((s.destroyed.length / s.submits) * 100) : 0;
    return (
      <div className="dc-practice">
        <div className="card flex flex-col gap-4" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <Trophy size={36} style={{ color: won ? 'var(--success)' : 'var(--danger)' }} />
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{won ? 'Giữ thành thành công!' : 'Thành đã thất thủ'}</h2>
          <div className="grid grid-cols-4 gap-2" style={{ width: '100%' }}>
            {[
              ['Điểm', s.score],
              ['Phá hủy', `${s.destroyed.length}/${s.total}`],
              ['Combo cao nhất', s.bestCombo],
              ['Gõ đúng', `${accuracy}%`]
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.8rem', color: newRecord ? 'var(--success)' : 'var(--text-muted)', fontWeight: newRecord ? 600 : 400 }}>
            {newRecord ? 'Kỷ lục mới!' : `Kỷ lục (${DIFFICULTIES[difficulty].label}): ${best}`}
          </div>
          {s.missed.length > 0 && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div className="tw-label">Từ bị lọt ({s.missed.length})</div>
              <div className="flex flex-col" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', maxHeight: 220, overflowY: 'auto' }}>
                {s.missed.map((w) => (
                  <div key={w.term} className="flex align-center gap-2" style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                    <button className="icon-btn" title="Nghe" onClick={() => { const st = loadSettings(); playSentence({ text: w.term }, st.rate, st.voiceURI); }}><Volume2 size={14} /></button>
                    <b>{w.term}</b>
                    <span style={{ color: 'var(--text-muted)' }}>{w.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {difficultyPicker}
          <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {s.missed.length > 0 && <button className="btn btn-secondary" onClick={() => start(s.missed)}>Chơi lại các từ bị lọt</button>}
            <button className="btn btn-primary" onClick={() => start(words)}><RotateCcw size={16} /> Chơi lại</button>
          </div>
        </div>
      </div>
    );
  }

  const remaining = s.queue.length + s.enemies.length;

  return (
    <div className="dc-practice">
      <div className="vd-hud">
        <div className="flex align-center" style={{ gap: 2 }} title={`${s.lives}/${LIVES} mạng`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart key={i} size={16} className={i < s.lives ? 'vd-heart' : 'vd-heart lost'} />
          ))}
        </div>
        <span><b>{s.score}</b> điểm</span>
        {s.combo > 1 && <span className="vd-combo"><Zap size={14} /> x{s.combo}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>Còn {remaining}/{s.total} từ</span>
        <button className="icon-btn" title={sound ? 'Tắt đọc từ' : 'Bật đọc từ'} onClick={toggleSound}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        <button className="icon-btn" title="Tạm dừng (Esc)" onClick={togglePause}>{phase === 'paused' ? <Play size={16} /> : <Pause size={16} />}</button>
      </div>

      <div className="vd-field" onClick={() => inputRef.current?.focus()}>
        <div className="vd-sky">
          {s.enemies.map((e) => (
            <div key={e.uid} className={`vd-enemy ${e.y > 0.75 ? 'danger' : ''}`} style={{ left: `${e.x}%`, top: `calc(${e.y} * (100% - 52px))` }}>
              <span>{e.word.meaning}</span>
              {e.y > HINT_FROM && <span className="vd-mask">{maskTerm(e.word.term)}</span>}
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
        {phase === 'paused' && (
          <div className="vd-overlay">
            <b>Tạm dừng</b>
            <button className="btn btn-primary" onClick={togglePause}><Play size={16} /> Tiếp tục</button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        className={`form-input dc-input ${wrong ? 'vd-wrong' : ''}`}
        placeholder="Gõ từ tiếng Anh rồi nhấn Enter..."
        value={input}
        disabled={phase === 'paused'}
        onChange={(e) => { setInput(e.target.value); setWrong(false); }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
      />
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        <span className="dc-kbd">Enter</span> bắn · <span className="dc-kbd">Esc</span> tạm dừng · không phân biệt hoa thường và dấu câu
      </p>
    </div>
  );
};
