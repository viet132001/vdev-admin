import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../../services/api';
import { BookOpen, Castle, Gamepad2, Headphones, Link2, Puzzle, RotateCcw, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { GameStage } from './GameStage';
import { DefenseGame } from './DefenseGame';
import { QuizGame } from './QuizGame';
import { MatchGame } from './MatchGame';
import { ScrambleGame } from './ScrambleGame';
import { DIFFICULTY_LABEL, type Difficulty, type GameProps, type GameResult, type GameWord, readStore, speakTerm, writeStore } from './common';

type Mode = 'defense' | 'listen' | 'quiz' | 'match' | 'scramble';

interface ModeInfo {
  title: string;
  description: string;
  icon: React.ElementType;
  minWords: number;
  typing: boolean; // needs the on-screen keyboard on phones
  headline: [win: string, lose: string];
  render: (props: GameProps) => React.ReactNode;
}

const MODES: Record<Mode, ModeInfo> = {
  defense: {
    title: 'Thủ thành',
    description: 'Nghĩa tiếng Việt rơi xuống thành — gõ đúng từ tiếng Anh để phá hủy.',
    icon: Castle,
    minWords: 1,
    typing: true,
    headline: ['Giữ thành thành công!', 'Thành đã thất thủ'],
    render: (props) => <DefenseGame {...props} prompt="meaning" />
  },
  listen: {
    title: 'Thủ thành nghe',
    description: 'Không có chữ, chỉ có phát âm — nghe và gõ lại từ trước khi chạm thành.',
    icon: Headphones,
    minWords: 1,
    typing: true,
    headline: ['Đôi tai tuyệt vời!', 'Thành đã thất thủ'],
    render: (props) => <DefenseGame {...props} prompt="audio" />
  },
  quiz: {
    title: 'Trắc nghiệm tốc độ',
    description: 'Chọn 1 trong 4 đáp án trước khi hết giờ, hai chiều Anh ↔ Việt.',
    icon: Zap,
    minWords: 2,
    typing: false,
    headline: ['Phản xạ rất nhanh!', 'Ôn thêm rồi thử lại nhé'],
    render: (props) => <QuizGame {...props} />
  },
  match: {
    title: 'Ghép cặp',
    description: 'Nối từ tiếng Anh với nghĩa của nó theo từng lượt có giới hạn thời gian.',
    icon: Link2,
    minWords: 2,
    typing: false,
    headline: ['Ghép cặp hoàn hảo!', 'Còn vài cặp bị nhầm'],
    render: (props) => <MatchGame {...props} />
  },
  scramble: {
    title: 'Xếp chữ',
    description: 'Các chữ cái bị xáo trộn — sắp lại thành từ đúng chính tả.',
    icon: Puzzle,
    minWords: 1,
    typing: false,
    headline: ['Chính tả chuẩn!', 'Ôn thêm rồi thử lại nhé'],
    render: (props) => <ScrambleGame {...props} />
  }
};

const MODE_ORDER: Mode[] = ['defense', 'listen', 'quiz', 'match', 'scramble'];
const SOUND_KEY = 'dictation_game_sound';
const DIFFICULTY_KEY = 'dictation_game_difficulty';

interface VocabGamesProps {
  scope: 'lesson' | 'session';
  id: string;
  onManage?: () => void;
}

export const VocabGames: React.FC<VocabGamesProps> = ({ scope, id, onManage }) => {
  const [words, setWords] = useState<GameWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
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

  const bestKey = (m: Mode) => `dictation_game_best:${m}:${scope}:${id}:${difficulty}`;
  const bestOf = (m: Mode) => Number(readStore(bestKey(m))) || 0;

  const start = (m: Mode, list: GameWord[]) => {
    setMode(m);
    setResult(null);
    setPlaying((p) => ({ run: (p?.run ?? 0) + 1, words: list }));
  };

  // Bound to one run, so a late timer from an abandoned game can't overwrite the current one
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const run = playing?.run;
  const finish = useCallback((r: GameResult) => {
    if (!mode || playingRef.current?.run !== run) return;
    playingRef.current = null;
    const key = `dictation_game_best:${mode}:${scope}:${id}:${difficulty}`;
    const newRecord = r.score > (Number(readStore(key)) || 0);
    if (newRecord) writeStore(key, String(r.score));
    setResult({ ...r, newRecord });
    setPlaying(null);
  }, [run, mode, scope, id, difficulty]);

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
          Thêm từ vựng cho câu ở “Quản lý câu” (mỗi dòng <code>large latte: ly latte lớn</code>) hoặc cột <code>vocabularies</code> khi import.
        </p>
        {onManage && <button className="btn btn-primary mt-4" onClick={onManage}>Thêm từ vựng</button>}
      </div>
    );
  }

  if (playing && mode) {
    return (
      <GameStage title={MODES[mode].title} onExit={() => setPlaying(null)}>
        <React.Fragment key={playing.run}>
          {MODES[mode].render({ words: playing.words, difficulty, sound, onFinish: finish })}
        </React.Fragment>
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

  if (result && mode) {
    const info = MODES[mode];
    return (
      <div className="dc-practice">
        <div className="card gm-result">
          <Trophy size={36} style={{ color: result.won ? 'var(--success)' : 'var(--danger)' }} />
          <h2>{result.won ? info.headline[0] : info.headline[1]}</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{info.title} · {DIFFICULTY_LABEL[difficulty]}</span>
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
            {result.newRecord ? 'Kỷ lục mới!' : `Kỷ lục: ${bestOf(mode)}`}
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
            <button className="btn btn-secondary" onClick={() => { setResult(null); setMode(null); }}><Gamepad2 size={16} /> Trò khác</button>
            {result.missed.length >= info.minWords && (
              <button className="btn btn-secondary" onClick={() => start(mode, result.missed)}>Ôn từ sai</button>
            )}
            <button className="btn btn-primary" onClick={() => start(mode, words)}><RotateCcw size={16} /> Chơi lại</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-practice">
      <div className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b>Chọn trò chơi</b>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{words.length} từ vựng {scope === 'session' ? 'trong cả session' : 'trong bài'}</div>
        </div>
        {settingsRow}
      </div>

      <div className="gm-modes">
        {MODE_ORDER.map((m) => {
          const info = MODES[m];
          const Icon = info.icon;
          const disabled = words.length < info.minWords;
          const best = bestOf(m);
          return (
            <button key={m} className="gm-mode" disabled={disabled} onClick={() => start(m, words)}>
              <span className="gm-mode-icon"><Icon size={22} /></span>
              <span className="gm-mode-body">
                <b>{info.title}</b>
                <span>{info.description}</span>
                <span className="gm-mode-meta">
                  {disabled ? `Cần ít nhất ${info.minWords} từ` : best ? `Kỷ lục: ${best}` : 'Chưa chơi'}
                  {info.typing && ' · cần gõ phím'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

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
