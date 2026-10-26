import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameHud, TimerBar } from './GameStage';
import { type GameProps, type GameWord, accuracyOf, buzz, shuffle, speakTerm, startLoop } from './common';

// Match pairs: tap an English term and its Vietnamese meaning. Words are played in rounds,
// each round has a time limit; unmatched pairs when time runs out count as missed.

const ROUND = {
  easy: { pairs: 4, secondsPerPair: 12 },
  normal: { pairs: 5, secondsPerPair: 8 },
  hard: { pairs: 6, secondsPerPair: 5 }
};

type Side = 'en' | 'vi';
interface Pick {
  side: Side;
  word: GameWord;
}

export const MatchGame: React.FC<GameProps> = ({ words, difficulty, sound, onFinish }) => {
  const config = ROUND[difficulty];
  const rounds = useMemo(() => {
    const list = shuffle(words);
    const chunks: GameWord[][] = [];
    for (let i = 0; i < list.length; i += config.pairs) chunks.push(list.slice(i, i + config.pairs));
    // Avoid a lonely last pair: merge it into the previous round
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 2) chunks[chunks.length - 2].push(...chunks.pop()!);
    return chunks;
  }, [words, config.pairs]);

  const [round, setRound] = useState(0);
  const [columns, setColumns] = useState(() => ({ en: shuffle(rounds[0]), vi: shuffle(rounds[0]) }));
  const [done, setDone] = useState<Set<GameWord>>(new Set());
  const [selected, setSelected] = useState<Pick | null>(null);
  const [wrongPair, setWrongPair] = useState<Pick[]>([]);
  const [timeLeft, setTimeLeft] = useState(rounds[0].length * config.secondsPerPair);
  const stats = useRef({ score: 0, combo: 0, bestCombo: 0, correct: 0, attempts: 0, missed: new Set<GameWord>() });
  const doneRef = useRef(done);
  doneRef.current = done;
  const roundOver = useRef(false);
  const limit = rounds[round].length * config.secondsPerPair;

  const nextRound = (matched: Set<GameWord>, secondsLeft: number) => {
    if (roundOver.current) return;
    roundOver.current = true;
    const s = stats.current;
    rounds[round].filter((w) => !matched.has(w)).forEach((w) => s.missed.add(w));
    s.score += Math.max(0, Math.round(secondsLeft)); // time bonus
    if (round + 1 < rounds.length) {
      const next = rounds[round + 1];
      setRound(round + 1);
      setColumns({ en: shuffle(next), vi: shuffle(next) });
      setDone(new Set());
      setSelected(null);
      roundOver.current = false;
      return;
    }
    onFinish({
      won: s.missed.size * 3 <= words.length,
      score: s.score,
      correct: s.correct,
      total: words.length,
      bestCombo: s.bestCombo,
      accuracy: accuracyOf(s.correct, s.attempts),
      missed: words.filter((w) => s.missed.has(w))
    });
  };

  useEffect(() => {
    let left = limit;
    setTimeLeft(left);
    return startLoop((dt) => {
      if (roundOver.current) return false;
      left -= dt;
      setTimeLeft(left);
      if (left > 0) return true;
      nextRound(doneRef.current, 0);
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const tap = (side: Side, word: GameWord) => {
    if (done.has(word) || wrongPair.length) return;
    if (side === 'en' && sound) speakTerm(word.term);
    if (!selected || selected.side === side) {
      setSelected(selected?.word === word && selected.side === side ? null : { side, word });
      return;
    }

    const s = stats.current;
    s.attempts += 1;
    setSelected(null);
    if (selected.word === word) {
      s.correct += 1;
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += 10 + Math.min(s.combo, 10) * 2;
      buzz(25);
      if (side === 'vi' && sound) speakTerm(word.term);
      const matched = new Set(done).add(word);
      setDone(matched);
      if (matched.size === rounds[round].length) {
        const secondsLeft = timeLeft;
        setTimeout(() => nextRound(matched, secondsLeft), 450);
      }
      return;
    }
    s.combo = 0;
    // Both words of a wrong pair need more practice
    s.missed.add(word).add(selected.word);
    buzz([40, 40, 40]);
    setWrongPair([selected, { side, word }]);
    setTimeout(() => setWrongPair([]), 550);
  };

  const classOf = (side: Side, word: GameWord) => {
    if (done.has(word)) return 'done';
    if (wrongPair.some((p) => p.side === side && p.word === word)) return 'wrong';
    if (selected?.side === side && selected.word === word) return 'selected';
    return '';
  };

  const s = stats.current;
  return (
    <>
      <GameHud score={s.score} combo={s.combo} progress={`Lượt ${round + 1}/${rounds.length}`} />
      <TimerBar ratio={timeLeft / limit} />
      <div className="gm-match gm-play">
        {(['en', 'vi'] as Side[]).map((side) => (
          <div key={side} className="gm-match-col">
            {columns[side].map((word) => (
              <button key={word.term} className={`gm-card ${side} ${classOf(side, word)}`} disabled={done.has(word)} onClick={() => tap(side, word)}>
                {side === 'en' ? word.term : word.meaning}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="gm-help">Chạm một từ tiếng Anh rồi chạm nghĩa của nó · ghép xong sớm được thưởng thời gian</p>
    </>
  );
};
