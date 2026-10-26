import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Delete, Lightbulb, SkipForward, Volume2 } from 'lucide-react';
import { GameHud, TimerBar } from './GameStage';
import { type GameProps, type GameWord, accuracyOf, buzz, shuffle, speakTerm, startLoop } from './common';

// Scramble: the letters of the English term are shuffled into tiles; tap (or type) them in order.
// Spaces between words are kept as fixed gaps in the answer slots.

interface Tile {
  id: number;
  char: string;
}

const SECONDS = { easy: 0, normal: 40, hard: 20 }; // 0 = no time limit
const HINT_COST = 5;

const lettersOf = (term: string) => [...term.replace(/\s+/g, '')];

const scramble = (term: string): Tile[] => {
  const tiles = lettersOf(term).map((char, id) => ({ id, char }));
  if (tiles.length < 2) return tiles;
  // Make sure the shuffle doesn't hand back the answer
  for (let tries = 0; tries < 8; tries++) {
    const mixed = shuffle(tiles);
    if (mixed.map((t) => t.char).join('').toLowerCase() !== term.replace(/\s+/g, '').toLowerCase()) return mixed;
  }
  return [...tiles].reverse();
};

export const ScrambleGame: React.FC<GameProps> = ({ words, difficulty, sound, onFinish }) => {
  const order = useMemo(() => shuffle(words), [words]);
  const limit = SECONDS[difficulty];
  const [index, setIndex] = useState(0);
  const word = order[index];
  const answer = useMemo(() => lettersOf(word.term), [word]);
  const [tiles, setTiles] = useState<Tile[]>(() => scramble(word.term));
  const [slots, setSlots] = useState<(Tile | null)[]>(() => answer.map(() => null));
  const [locked, setLocked] = useState(0); // leading slots filled by hints
  const [status, setStatus] = useState<'playing' | 'right' | 'wrong' | 'skipped'>('playing');
  const [timeLeft, setTimeLeft] = useState(limit);
  const stats = useRef({ score: 0, combo: 0, bestCombo: 0, correct: 0, attempts: 0, hints: 0, missed: [] as GameWord[] });

  const used = new Set(slots.filter(Boolean).map((t) => t!.id));
  const solved = status === 'right' || status === 'skipped';

  const goNext = () => {
    if (index + 1 < order.length) {
      const next = order[index + 1];
      setIndex(index + 1);
      setTiles(scramble(next.term));
      setSlots(lettersOf(next.term).map(() => null));
      setLocked(0);
      setStatus('playing');
      stats.current.hints = 0;
      return;
    }
    const s = stats.current;
    onFinish({
      won: s.correct * 2 >= order.length,
      score: s.score,
      correct: s.correct,
      total: order.length,
      bestCombo: s.bestCombo,
      accuracy: accuracyOf(s.correct, s.attempts),
      missed: s.missed
    });
  };

  const giveUp = () => {
    if (solved) return;
    const s = stats.current;
    s.combo = 0;
    s.missed.push(word);
    setStatus('skipped');
    if (sound) speakTerm(word.term);
    setTimeout(goNext, 1600);
  };

  useEffect(() => {
    if (!limit || solved) return;
    let left = limit;
    setTimeLeft(left);
    return startLoop((dt) => {
      left -= dt;
      setTimeLeft(left);
      if (left > 0) return true;
      giveUp();
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, solved]);

  const check = (filled: (Tile | null)[]) => {
    if (filled.some((t) => !t)) return;
    const s = stats.current;
    s.attempts += 1;
    if (filled.map((t) => t!.char.toLowerCase()).join('') === answer.join('').toLowerCase()) {
      s.correct += 1;
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const timeBonus = limit ? Math.round((Math.max(timeLeft, 0) / limit) * 10) : 5;
      s.score += Math.max(2, 10 + answer.length + timeBonus + Math.min(s.combo, 10) * 2 - s.hints * HINT_COST);
      setStatus('right');
      buzz(25);
      if (sound) speakTerm(word.term);
      setTimeout(goNext, 900);
    } else {
      s.combo = 0;
      setStatus('wrong');
      buzz([40, 40, 40]);
    }
  };

  const place = (tile: Tile) => {
    if (solved || used.has(tile.id)) return;
    const at = slots.findIndex((t) => !t);
    if (at < 0) return;
    const next = [...slots];
    next[at] = tile;
    setSlots(next);
    setStatus('playing');
    check(next);
  };

  const removeAt = (at: number) => {
    if (solved || at < locked || !slots[at]) return;
    const next = [...slots];
    next[at] = null;
    setSlots(next);
    setStatus('playing');
  };

  const removeLast = () => {
    for (let i = slots.length - 1; i >= locked; i--) {
      if (slots[i]) return removeAt(i);
    }
  };

  // Hint: clear everything after the locked prefix and lock in the next correct letter
  const hint = () => {
    if (solved || locked >= answer.length) return;
    stats.current.hints += 1;
    const keep = slots.slice(0, locked) as Tile[];
    const keepIds = new Set(keep.map((t) => t.id));
    const tile = tiles.find((t) => !keepIds.has(t.id) && t.char.toLowerCase() === answer[locked].toLowerCase())!;
    const next: (Tile | null)[] = [...keep, tile, ...answer.slice(locked + 1).map(() => null)];
    setSlots(next);
    setLocked(locked + 1);
    setStatus('playing');
    check(next);
  };

  // Physical keyboard: type letters, Backspace removes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        removeLast();
        return;
      }
      if (e.key.length !== 1 || e.key === ' ') return;
      const tile = tiles.find((t) => !used.has(t.id) && t.char.toLowerCase() === e.key.toLowerCase());
      if (tile) place(tile);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Slots grouped per word of the term, so "large latte" shows as two blocks
  const groups: number[][] = [];
  let cursor = 0;
  word.term.trim().split(/\s+/).forEach((part) => {
    groups.push([...part].map(() => cursor++));
  });

  const s = stats.current;
  return (
    <>
      <GameHud score={s.score} combo={s.combo} progress={`Từ ${index + 1}/${order.length}`} />
      {limit > 0 && <TimerBar ratio={solved ? 0 : timeLeft / limit} />}

      <div className="gm-play">
        <div className="gm-question">
          <span className="gm-question-label">Xếp chữ thành từ tiếng Anh có nghĩa</span>
          <div className="gm-question-text">{word.meaning}</div>
        </div>

        <div className={`gm-slots ${status}`}>
          {groups.map((group, g) => (
            <div key={g} className="gm-slot-group">
              {group.map((at) => (
                <button
                  key={at}
                  className={`gm-slot ${at < locked ? 'locked' : ''}`}
                  onClick={() => removeAt(at)}
                >
                  {status === 'skipped' ? answer[at] : slots[at]?.char ?? ''}
                </button>
              ))}
            </div>
          ))}
        </div>
        {status === 'wrong' && <div className="gm-feedback wrong">Chưa đúng — chạm vào chữ để gỡ ra và sắp lại</div>}
        {status === 'right' && <div className="gm-feedback right">Chính xác! {word.term}</div>}
        {status === 'skipped' && <div className="gm-feedback wrong">Đáp án: {word.term}</div>}

        <div className="gm-tiles">
          {tiles.map((tile) => (
            <button key={tile.id} className="gm-tile" disabled={solved || used.has(tile.id)} onClick={() => place(tile)}>
              {tile.char}
            </button>
          ))}
        </div>
      </div>

      <div className="gm-actions">
        <button className="btn btn-secondary" disabled={solved} onClick={removeLast}><Delete size={16} /> Xóa</button>
        <button className="btn btn-secondary" disabled={solved} onClick={hint}><Lightbulb size={16} /> Gợi ý (-{HINT_COST})</button>
        <button className="btn btn-secondary" onClick={() => speakTerm(word.term)} title="Nghe (gợi ý bằng âm thanh)"><Volume2 size={16} /></button>
        <button className="btn btn-secondary" disabled={solved} onClick={giveUp}><SkipForward size={16} /> Bỏ qua</button>
      </div>
      <p className="gm-help">Chạm chữ cái theo thứ tự (hoặc gõ phím) · chạm ô đã điền để gỡ</p>
    </>
  );
};
