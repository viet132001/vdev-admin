import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bird, Bug, Eye, Ghost, Rat, Skull, Snail, Squirrel, Volume2 } from 'lucide-react';
import { vocabularyKey } from '../grading';
import { AnswerForm, GameHud } from './GameStage';
import { type GameProps, type GameWord, accuracyOf, buzz, maskTerm, shuffle, speakTerm } from './common';

// Monster fight: words come in stages of 3–4 monsters. Each monster says its English word (tap it to hear again);
// typing the word defeats it. The next stage only opens once every monster of the current one is down,
// and the game is won when the words run out.

interface Monster {
  word: GameWord;
  icon: number;
  dead: boolean;
  wrongs: number; // wrong answers while this monster was selected
  revealed: boolean; // player asked for the answer
}

const ICONS = [Ghost, Bug, Skull, Rat, Snail, Squirrel, Bird];
const STAGE_SIZE = 4;
// Wrong answers on a monster before its hint shows: Vietnamese meaning, then the first letters
const HINTS = {
  easy: { meaning: 0, letters: 1 },
  normal: { meaning: 1, letters: 2 },
  hard: { meaning: 2, letters: 4 }
};
const NEXT_STAGE_MS = 1100;

// 330 words → 83 stages of 4 or 3, rather than 82 × 4 and a lonely 2
const splitStages = (list: GameWord[]) => {
  const count = Math.ceil(list.length / STAGE_SIZE);
  const stages: GameWord[][] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const size = Math.ceil((list.length - at) / (count - i));
    stages.push(list.slice(at, at + size));
    at += size;
  }
  return stages;
};

const spawn = (stage: GameWord[]): Monster[] =>
  stage.map((word) => ({ word, icon: Math.floor(Math.random() * ICONS.length), dead: false, wrongs: 0, revealed: false }));

export const MonsterGame: React.FC<GameProps> = ({ words, difficulty, sound, onFinish }) => {
  const stages = useMemo(() => splitStages(shuffle(words)), [words]);
  const hints = HINTS[difficulty];
  const [stage, setStage] = useState(0);
  const [monsters, setMonsters] = useState(() => spawn(stages[0]));
  const [focus, setFocus] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useRef({ score: 0, combo: 0, bestCombo: 0, correct: 0, submits: 0, kills: 0, missed: [] as GameWord[] });
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Each new stage: the first monster calls out its word
  useEffect(() => {
    inputRef.current?.focus();
    later(() => speakTerm(stages[stage][0].term), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const select = (at: number) => {
    if (cleared || monsters[at].dead) return;
    setFocus(at);
    setWrong(false);
    speakTerm(monsters[at].word.term);
    inputRef.current?.focus();
  };

  const nextStage = () => {
    if (stage + 1 < stages.length) {
      setMonsters(spawn(stages[stage + 1]));
      setFocus(0);
      setCleared(false);
      setStage(stage + 1);
      return;
    }
    const s = stats.current;
    onFinish({
      won: true,
      score: s.score,
      correct: s.correct,
      total: words.length,
      bestCombo: s.bestCombo,
      accuracy: accuracyOf(s.kills, s.submits),
      missed: s.missed
    });
  };

  const submit = () => {
    if (cleared) return;
    const key = vocabularyKey(input);
    if (!key) return;
    const s = stats.current;
    s.submits += 1;
    const matches = monsters.map((_, i) => i).filter((i) => !monsters[i].dead && vocabularyKey(monsters[i].word.term) === key);
    if (!matches.length) {
      s.combo = 0;
      setMonsters(monsters.map((m, i) => (i === focus ? { ...m, wrongs: m.wrongs + 1 } : m)));
      setWrong(true);
      buzz([40, 40, 40]);
      inputRef.current?.select();
      return;
    }

    const at = matches.includes(focus) ? focus : matches[0];
    const target = monsters[at];
    const clean = !target.wrongs && !target.revealed;
    s.kills += 1;
    s.combo += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += 10 + Math.min(s.combo, 10) * 2 + (clean ? 5 : 0);
    if (clean) s.correct += 1;
    else s.missed.push(target.word);

    const next = monsters.map((m, i) => (i === at ? { ...m, dead: true } : m));
    setMonsters(next);
    setInput('');
    setWrong(false);
    buzz(25);
    if (sound) speakTerm(target.word.term);

    // Move on to the next monster still standing, or clear the stage
    const alive = next.map((_, i) => i).filter((i) => !next[i].dead);
    if (!alive.length) {
      setCleared(true);
      later(nextStage, NEXT_STAGE_MS);
      return;
    }
    const nextFocus = alive.find((i) => i > at) ?? alive[0];
    setFocus(nextFocus);
    later(() => speakTerm(next[nextFocus].word.term), sound ? 900 : 300);
    inputRef.current?.focus();
  };

  const reveal = () => {
    if (cleared || monsters[focus].dead) return;
    stats.current.combo = 0;
    setMonsters(monsters.map((m, i) => (i === focus ? { ...m, revealed: true } : m)));
    speakTerm(monsters[focus].word.term);
    inputRef.current?.focus();
  };

  const s = stats.current;
  const current = monsters[focus];

  return (
    <>
      <GameHud score={s.score} combo={s.combo} progress={`Màn ${stage + 1}/${stages.length}`} />

      <div className="mg-field" onClick={() => inputRef.current?.focus()}>
        <div className="mg-monsters" key={stage}>
          {monsters.map((m, i) => {
            const Icon = ICONS[m.icon];
            const showMeaning = m.dead || m.revealed || m.wrongs >= hints.meaning;
            return (
              <button
                key={i}
                type="button"
                className={`mg-monster ${m.dead ? 'dead' : ''} ${i === focus && !m.dead ? 'focus' : ''} ${i === focus && wrong ? 'hurt' : ''}`}
                style={{ animationDelay: `${i * 80}ms` }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); select(i); }}
              >
                <span className="mg-icon"><Icon size={26} /></span>
                <span className="mg-hp"><span style={{ width: m.dead ? 0 : '100%' }} /></span>
                {m.dead || m.revealed ? (
                  <b className={m.dead ? 'mg-term' : 'mg-term revealed'}>{m.word.term}</b>
                ) : (
                  <span className="mg-mask">{maskTerm(m.word.term, m.wrongs >= hints.letters ? 1 : 0)}</span>
                )}
                <span className="mg-hint">{showMeaning ? m.word.meaning : <Volume2 size={14} />}</span>
              </button>
            );
          })}
        </div>
        {cleared && <div className="mg-cleared">{stage + 1 < stages.length ? `Qua màn ${stage + 1}!` : 'Hết quái!'}</div>}
      </div>

      <AnswerForm
        inputRef={inputRef}
        value={input}
        wrong={wrong}
        disabled={cleared}
        placeholder="Gõ từ quái vật vừa nói..."
        submitTitle="Tấn công (Enter)"
        onChange={(value) => { setInput(value); setWrong(false); }}
        onSubmit={submit}
      />
      <div className="gm-actions">
        <button className="btn btn-secondary btn-sm" disabled={cleared} onClick={() => select(focus)}><Volume2 size={14} /> Nghe lại</button>
        <button className="btn btn-secondary btn-sm" disabled={cleared || current.dead || current.revealed} onClick={reveal}><Eye size={14} /> Xem đáp án</button>
      </div>
      <p className="gm-help">
        Chạm quái để chọn và nghe · <span className="dc-kbd">Enter</span> tấn công · hạ hết quái để qua màn
      </p>
    </>
  );
};
