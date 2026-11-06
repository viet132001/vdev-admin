import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../../services/api';
import { BookOpen, Gamepad2, RotateCcw, Swords, Trophy, Volume2, VolumeX } from 'lucide-react';
import { GameStage } from './GameStage';
import { DefenseGame } from './DefenseGame';
import { createDefenseScene } from './defenseScene';
import { unlockSfx } from './defenseSound';
import { DIFFICULTY_LABEL, type Difficulty, type GameResult, type GameWord, readStore, speakTerm, startLoop, unlockSpeech, writeStore } from './common';

const GAME_TITLE = 'Thủ thành';
const SOUND_KEY = 'dictation_game_sound';
const DIFFICULTY_KEY = 'dictation_game_difficulty';
// Kept to the sides so they don't cover the title and start button
const POSTER_IMPS = [
  { uid: 1, x: 0.1, y: 0.72, meaning: '', mask: null },
  { uid: 2, x: 0.9, y: 0.5, meaning: '', mask: null }
];

// Live game scene as the start screen artwork
const GamePoster: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    if (!field || !canvas) return;
    const scene = createDefenseScene(canvas);
    const fit = () => scene.resize(field.clientWidth, field.clientHeight);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(field);
    const stop = startLoop((dt) => {
      scene.render(POSTER_IMPS, 5, dt);
      return true;
    });
    return () => {
      observer.disconnect();
      stop();
    };
  }, []);

  return (
    <div ref={fieldRef} className="vd-poster">
      <canvas ref={canvasRef} className="vd-canvas" aria-hidden="true" />
      <div className="vd-poster-body">{children}</div>
    </div>
  );
};

interface VocabGamesProps {
  scope: 'lesson' | 'session';
  id: string;
  onManage?: () => void;
}

export const VocabGames: React.FC<VocabGamesProps> = ({ scope, id, onManage }) => {
  const [words, setWords] = useState<GameWord[] | null>(null);
  const [playing, setPlaying] = useState<{ run: number; words: GameWord[] } | null>(null);
  const [result, setResult] = useState<(GameResult & { newRecord: boolean }) | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (readStore(DIFFICULTY_KEY) as Difficulty) || 'normal');
  const [sound, setSound] = useState(() => readStore(SOUND_KEY) !== 'off');

  useEffect(() => {
    let cancelled = false;
    setWords(null);
    api
      .get(`/api/dictation/${scope === 'lesson' ? 'lessons' : 'sessions'}/${id}/vocabularies`, { noCache: true })
      .then((list: any) => { if (!cancelled) setWords(Array.isArray(list) ? list : []); })
      .catch((err: unknown) => {
        if (cancelled) return;
        alert(getErrorMessage(err, 'Không tải được từ vựng'));
        setWords([]);
      });
    return () => { cancelled = true; };
  }, [scope, id]);

  const bestKey = `dictation_game_best:defense:${scope}:${id}:${difficulty}`;
  const best = Number(readStore(bestKey)) || 0;

  const start = (list: GameWord[]) => {
    // Runs inside the click, so iOS lets the game speak and play effects later from timers / animation frames
    unlockSpeech();
    unlockSfx();
    setResult(null);
    setPlaying((p) => ({ run: (p?.run ?? 0) + 1, words: list }));
  };

  // Bound to one run, so a late timer from an abandoned game can't overwrite the current one
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const run = playing?.run;
  const finish = useCallback((r: GameResult) => {
    if (playingRef.current?.run !== run) return;
    playingRef.current = null;
    const newRecord = r.score > (Number(readStore(bestKey)) || 0);
    if (newRecord) writeStore(bestKey, String(r.score));
    setResult({ ...r, newRecord });
    setPlaying(null);
  }, [run, bestKey]);

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    writeStore(DIFFICULTY_KEY, d);
  };

  const toggleSound = () => {
    writeStore(SOUND_KEY, sound ? 'off' : 'on');
    setSound(!sound);
  };

  if (!words) return <div className="loading-container"><span className="spinner"></span><span>Đang tải từ vựng...</span></div>;

  if (words.length === 0) {
    return (
      <div className="empty-state">
        <Gamepad2 className="empty-state-icon" size={32} />
        <p>Chưa có từ vựng để chơi.</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Thêm từ vựng cho câu ở tab “Nội dung” (mỗi dòng <code>large latte: ly latte lớn</code>) hoặc cột <code>vocabularies</code> khi import.
        </p>
        {onManage && <button className="btn btn-primary mt-4" onClick={onManage}>Thêm từ vựng</button>}
      </div>
    );
  }

  if (playing) {
    return (
      <GameStage title={GAME_TITLE} onExit={() => setPlaying(null)}>
        <DefenseGame key={playing.run} words={playing.words} difficulty={difficulty} sound={sound} onFinish={finish} />
      </GameStage>
    );
  }

  const settingsRow = (
    <div className="gm-settings">
      <div className="gm-segment">
        {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
          <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => changeDifficulty(d)}>{DIFFICULTY_LABEL[d]}</button>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={toggleSound} title="Đọc to từ tiếng Anh khi trả lời đúng">
        {sound ? <Volume2 size={14} /> : <VolumeX size={14} />} {sound ? 'Âm thanh bật' : 'Âm thanh tắt'}
      </button>
    </div>
  );

  if (result) {
    return (
      <div className="dc-practice">
        <div className="card gm-result">
          <Trophy size={36} style={{ color: result.won ? 'var(--success)' : 'var(--danger)' }} />
          <h2>{result.won ? 'Giữ thành thành công!' : 'Thành đã thất thủ'}</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{GAME_TITLE} · {DIFFICULTY_LABEL[difficulty]}</span>
          <div className="gm-stats">
            {[
              ['Điểm', result.score],
              ['Đúng', `${result.correct}/${result.total}`],
              ['Combo cao nhất', result.bestCombo],
              ['Chính xác', `${result.accuracy}%`]
            ].map(([label, value]) => (
              <div key={label} className="gm-stat">
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.85rem', color: result.newRecord ? 'var(--success)' : 'var(--text-muted)', fontWeight: result.newRecord ? 600 : 400 }}>
            {result.newRecord ? 'Kỷ lục mới!' : `Kỷ lục: ${best}`}
          </div>
          {result.missed.length > 0 && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div className="tw-label">Từ cần ôn lại ({result.missed.length})</div>
              <div className="gm-word-list">
                {result.missed.map((w) => (
                  <button key={w.term} className="gm-word-row" onClick={() => speakTerm(w.term)}>
                    <Volume2 size={14} />
                    <b>{w.term}</b>
                    <span>{w.meaning}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {settingsRow}
          <div className="gm-actions">
            {result.missed.length > 0 && (
              <button className="btn btn-secondary" onClick={() => start(result.missed)}>Ôn từ sai</button>
            )}
            <button className="btn btn-primary" onClick={() => start(words)}><RotateCcw size={16} /> Chơi lại</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-practice">
      <GamePoster>
        <h2>{GAME_TITLE}</h2>
        <p>Quỷ mang nghĩa tiếng Việt lao xuống thành. Gõ đúng từ tiếng Anh để nỏ bắn hạ chúng.</p>
        <button className="btn vd-start" onClick={() => start(words)}><Swords size={18} /> Vào trận</button>
        <span className="vd-poster-meta">{words.length} từ vựng {scope === 'session' ? 'trong cả khoá học' : 'trong chủ đề'} · {best ? `Kỷ lục ${DIFFICULTY_LABEL[difficulty]}: ${best}` : 'Chưa có kỷ lục'}</span>
      </GamePoster>
      {settingsRow}

      <details className="gm-vocab">
        <summary><BookOpen size={14} /> Xem {words.length} từ vựng trước khi chơi</summary>
        <div className="gm-word-list">
          {words.map((w) => (
            <button key={w.term} className="gm-word-row" onClick={() => speakTerm(w.term)}>
              <Volume2 size={14} />
              <b>{w.term}</b>
              <span>{w.meaning}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
};
