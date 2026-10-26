import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { GameHud, TimerBar } from './GameStage';
import { type GameProps, type GameWord, buzz, shuffle, speakTerm, startLoop } from './common';

// Speed quiz: pick the right answer among 4 before the timer runs out.
// Directions alternate randomly: Vietnamese → English and English → Vietnamese.

interface Question {
  word: GameWord;
  direction: 'vi2en' | 'en2vi';
  options: GameWord[];
}

const SECONDS = { easy: 12, normal: 8, hard: 5 };
const NEXT_DELAY = { right: 650, wrong: 1500 };

const buildQuestions = (words: GameWord[]): Question[] =>
  shuffle(words).map((word) => ({
    word,
    direction: Math.random() < 0.5 ? 'vi2en' : 'en2vi',
    options: shuffle([word, ...shuffle(words.filter((w) => w !== word)).slice(0, 3)])
  }));

export const QuizGame: React.FC<GameProps> = ({ words, difficulty, sound, onFinish }) => {
  const questions = useMemo(() => buildQuestions(words), [words]);
  const limit = SECONDS[difficulty];
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<GameWord | null>(null); // null + answered = timed out
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(limit);
  const stats = useRef({ score: 0, combo: 0, bestCombo: 0, correct: 0, missed: [] as GameWord[] });

  const question = questions[index];
  const label = (w: GameWord) => (question.direction === 'vi2en' ? w.term : w.meaning);

  // Read English prompts aloud so the question also trains listening
  useEffect(() => {
    if (sound && question.direction === 'en2vi') speakTerm(question.word.term);
  }, [question, sound]);

  useEffect(() => {
    if (answered) return;
    setTimeLeft(limit);
    let left = limit;
    return startLoop((dt) => {
      left -= dt;
      setTimeLeft(left);
      if (left > 0) return true;
      answer(null);
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, answered]);

  const answer = (option: GameWord | null) => {
    if (answered) return;
    const s = stats.current;
    const right = option === question.word;
    setPicked(option);
    setAnswered(true);
    if (right) {
      s.correct += 1;
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += 10 + Math.round((Math.max(timeLeft, 0) / limit) * 10) + Math.min(s.combo, 10) * 2;
      buzz(25);
    } else {
      s.combo = 0;
      s.missed.push(question.word);
      buzz([40, 40, 40]);
    }
    if (sound && question.direction === 'vi2en') speakTerm(question.word.term);

    setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        setPicked(null);
        setAnswered(false);
        return;
      }
      onFinish({
        won: s.correct * 2 >= questions.length,
        score: s.score,
        correct: s.correct,
        total: questions.length,
        bestCombo: s.bestCombo,
        accuracy: Math.round((s.correct / questions.length) * 100),
        missed: s.missed
      });
    }, right ? NEXT_DELAY.right : NEXT_DELAY.wrong);
  };

  // Keys 1–4 pick an option on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= question.options.length) answer(question.options[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const s = stats.current;
  const stateOf = (option: GameWord) => {
    if (!answered) return '';
    if (option === question.word) return 'right';
    return option === picked ? 'wrong' : 'dim';
  };

  return (
    <>
      <GameHud score={s.score} combo={s.combo} progress={`Câu ${index + 1}/${questions.length}`} />
      <TimerBar ratio={answered ? 0 : timeLeft / limit} />

      <div className="gm-play">
        <div className="gm-question">
          <span className="gm-question-label">{question.direction === 'vi2en' ? 'Từ tiếng Anh nào có nghĩa là' : 'Nghĩa của từ'}</span>
          <div className="gm-question-text">
            {question.direction === 'vi2en' ? question.word.meaning : question.word.term}
            {question.direction === 'en2vi' && (
              <button className="icon-btn" title="Nghe" onClick={() => speakTerm(question.word.term)}><Volume2 size={18} /></button>
            )}
          </div>
          {answered && !picked && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Hết giờ!</span>}
        </div>

        <div className="gm-options">
          {question.options.map((option, i) => (
            <button key={option.term} className={`gm-option ${stateOf(option)}`} disabled={answered} onClick={() => answer(option)}>
              <span className="dc-kbd gm-option-key">{i + 1}</span>
              <span>{label(option)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="gm-help">Chọn nhanh để được thưởng thời gian · chuỗi đúng liên tiếp nhân điểm</p>
    </>
  );
};
