import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import {
  Volume2, Snail, Lightbulb, Eye, SkipForward, RotateCcw, ArrowRight, CircleCheck, CircleX, Settings2, Repeat, X
} from 'lucide-react';
import { grade, type DiffOp, type GradeResult } from './grading';
import { englishVoices, loadSettings, playSentence, saveSettings, stopPlayback, type PracticeSettings } from './media';

interface PracticeProps {
  lessonId: string;
  nextLesson: any | null;
  onOpenLesson: (id: string) => void;
  onManage: () => void;
  onProgressChanged: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'var(--success)',
  IN_PROGRESS: 'var(--warning)',
  SKIPPED: 'var(--danger)',
  NOT_STARTED: 'var(--border-color)'
};

const SLOW_RATE = 0.7;

export const DiffView: React.FC<{ diff: DiffOp[] }> = ({ diff }) => (
  <div className="dc-diff">
    {diff.map((op, i) => {
      if (op.type === 'MATCH') return <span key={i} className="dc-word match">{op.actual}</span>;
      if (op.type === 'WRONG') {
        return (
          <span key={i} className="dc-word wrong" title={`Bạn gõ “${op.actual}”, đúng là “${op.expected}”`}>
            <s>{op.actual}</s>
            <span className="dc-expected">{op.expected}</span>
          </span>
        );
      }
      if (op.type === 'MISSING') return <span key={i} className="dc-word missing" title="Thiếu từ">{op.expected}</span>;
      return <span key={i} className="dc-word extra" title="Thừa từ"><s>{op.actual}</s></span>;
    })}
  </div>
);

// "Could I get" with 1 hint -> "Could _ ___"
const maskSentence = (text: string, revealedWords: number) =>
  text
    .split(/\s+/)
    .map((word, i) => (i < revealedWords ? word : word.replace(/[A-Za-z0-9]/g, '_')))
    .join(' ');

export const Practice: React.FC<PracticeProps> = ({ lessonId, nextLesson, onOpenLesson, onManage, onProgressChanged }) => {
  const [lesson, setLesson] = useState<any | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [finished, setFinished] = useState(false);
  const [round, setRound] = useState(0); // bumps on redo so the sentence effect re-runs

  const [input, setInput] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [checkedInput, setCheckedInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [settings, setSettings] = useState<PracticeSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(englishVoices);

  const playCount = useRef(0);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sentence = lesson?.sentences.find((s: any) => s.id === queue[pos]) || null;

  // ---------- loading ----------

  const startQueue = (data: any, onlyUnfinished: boolean) => {
    const all = data.sentences.map((s: any) => s.id);
    const ids = onlyUnfinished ? data.sentences.filter((s: any) => s.progress.status !== 'COMPLETED').map((s: any) => s.id) : all;
    const firstOpen = data.sentences.findIndex((s: any) => s.progress.status !== 'COMPLETED');
    setQueue(ids);
    setPos(onlyUnfinished ? 0 : Math.max(firstOpen, 0));
    setFinished(data.sentences.length > 0 && firstOpen === -1 && !onlyUnfinished);
    setRound((r) => r + 1);
  };

  const loadLesson = useCallback(async () => {
    try {
      const data = await api.get(`/api/dictation/lessons/${lessonId}`, { noCache: true });
      setLesson(data);
      return data;
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được bài'));
      return null;
    }
  }, [lessonId]);

  useEffect(() => {
    setLesson(null);
    loadLesson().then((data) => { if (data) startQueue(data, false); });
    return () => stopPlayback();
  }, [loadLesson]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(englishVoices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const updateSettings = (patch: Partial<PracticeSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  // ---------- audio ----------

  const play = useCallback(async (times = 1, rate?: number) => {
    if (!sentence) return;
    setPlaying(true);
    for (let i = 0; i < times; i++) {
      playCount.current += 1;
      await playSentence(sentence, rate ?? settings.rate, settings.voiceURI);
      if (i < times - 1) await new Promise((r) => setTimeout(r, 600));
    }
    setPlaying(false);
    inputRef.current?.focus();
  }, [sentence, settings.rate, settings.voiceURI]);

  // Reset per-sentence state and auto play whenever the sentence (or a redo) changes
  useEffect(() => {
    if (!sentence || finished) return;
    setInput('');
    setResult(null);
    setCheckedInput('');
    setRevealed(false);
    setHintCount(0);
    playCount.current = 0;
    startedAt.current = Date.now();
    inputRef.current?.focus();
    if (settings.autoPlay) play(Math.max(1, settings.autoReplayTimes));
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentence?.id, round, finished]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        play(1, e.shiftKey ? SLOW_RATE : undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [play]);

  // ---------- actions ----------

  const applyProgress = (sentenceId: string, progress: any) => {
    setLesson((prev: any) => prev && { ...prev, sentences: prev.sentences.map((s: any) => (s.id === sentenceId ? { ...s, progress } : s)) });
    onProgressChanged();
  };

  const check = async () => {
    if (!sentence || !input.trim() || submitting) return;
    // Grade locally for instant feedback; the server re-grades and its result wins
    setResult(grade(sentence.text, input));
    setCheckedInput(input);
    setSubmitting(true);
    try {
      const res = await api.post(`/api/dictation/sentences/${sentence.id}/attempts`, {
        input,
        playCount: playCount.current,
        hintCount,
        revealed: false,
        durationMs: Date.now() - startedAt.current
      });
      if (res?.attempt) setResult({ isCorrect: res.attempt.isCorrect, accuracy: res.attempt.accuracy, diff: res.attempt.diff });
      if (res?.progress) applyProgress(sentence.id, res.progress);
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu kết quả thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  const markSkipped = async () => {
    if (!sentence) return;
    try {
      const progress = await api.post(`/api/dictation/sentences/${sentence.id}/skip`, {});
      applyProgress(sentence.id, progress);
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật tiến độ thất bại'));
    }
  };

  const reveal = async () => {
    setRevealed(true);
    if (sentence?.progress.status !== 'COMPLETED') await markSkipped();
  };

  const next = async () => {
    stopPlayback();
    if (pos + 1 < queue.length) {
      setPos(pos + 1);
      return;
    }
    await loadLesson();
    setFinished(true);
  };

  const skip = async () => {
    if (sentence?.progress.status !== 'COMPLETED') await markSkipped();
    next();
  };

  const redo = () => {
    stopPlayback();
    setRound((r) => r + 1);
  };

  const restartLesson = async () => {
    try {
      const data = await api.post(`/api/dictation/lessons/${lessonId}/reset-progress`, {});
      setLesson(data);
      startQueue(data, false);
      onProgressChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Làm lại bài thất bại'));
    }
  };

  const jumpTo = (sentenceId: string) => {
    const all = lesson.sentences.map((s: any) => s.id);
    setQueue(all);
    setPos(all.indexOf(sentenceId));
    setFinished(false);
    setRound((r) => r + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (result?.isCorrect || revealed) next();
    else check();
  };

  // ---------- render ----------

  if (!lesson) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải bài...</span></div>;
  }

  if (lesson.sentences.length === 0) {
    return (
      <div className="empty-state">
        <Volume2 className="empty-state-icon" size={32} />
        <p>Bài này chưa có câu nào.</p>
        <button className="btn btn-primary mt-4" onClick={onManage}>Thêm câu</button>
      </div>
    );
  }

  const navigator = (
    <div className="dc-nav-dots">
      {lesson.sentences.map((s: any, i: number) => (
        <button
          key={s.id}
          className={`dc-dot ${!finished && s.id === sentence?.id ? 'active' : ''}`}
          style={{ backgroundColor: STATUS_COLORS[s.progress.status] }}
          title={`Câu ${i + 1}`}
          onClick={() => jumpTo(s.id)}
        />
      ))}
    </div>
  );

  if (finished) {
    const p = lesson.progress;
    const unfinished = lesson.sentences.filter((s: any) => s.progress.status !== 'COMPLETED').length;
    return (
      <div className="card dc-practice">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Kết quả bài “{lesson.title}”</h2>
          <div className="grid grid-cols-3 gap-4" style={{ marginTop: 16 }}>
            {[
              ['Câu đúng', `${p.completed}/${p.total}`],
              ['Bỏ qua', String(p.skipped)],
              ['Chính xác trung bình', `${p.averageAccuracy ?? 0}%`]
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        {navigator}
        <div className="table-container">
          <table>
            <thead><tr><th>#</th><th>Câu</th><th>Lượt thử</th><th>Tốt nhất</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {lesson.sentences.map((s: any, i: number) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => jumpTo(s.id)}>
                  <td>{i + 1}</td>
                  <td>{s.text}<div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.translation}</div></td>
                  <td>{s.progress.attemptCount}</td>
                  <td>{s.progress.bestAccuracy === null ? '—' : `${s.progress.bestAccuracy}%`}</td>
                  <td>
                    {s.progress.status === 'COMPLETED' && <span className="badge badge-success">Đúng</span>}
                    {s.progress.status === 'SKIPPED' && <span className="badge badge-danger">Bỏ qua</span>}
                    {s.progress.status === 'IN_PROGRESS' && <span className="badge badge-warning">Chưa đúng</span>}
                    {s.progress.status === 'NOT_STARTED' && <span className="badge">Chưa làm</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {unfinished > 0 && (
            <button className="btn btn-primary" onClick={() => startQueue(lesson, true)}><Repeat size={16} /> Luyện lại {unfinished} câu chưa đúng</button>
          )}
          <button className="btn btn-secondary" onClick={restartLesson}><RotateCcw size={16} /> Làm lại cả bài</button>
          {nextLesson && (
            <button className="btn btn-secondary" onClick={() => onOpenLesson(nextLesson.id)}>Bài tiếp: {nextLesson.title} <ArrowRight size={16} /></button>
          )}
        </div>
      </div>
    );
  }

  if (!sentence) return null;

  const isDone = !!result?.isCorrect || revealed;
  const showMeaning = isDone || settings.showTranslation === 'ALWAYS';
  const stale = !!result && input !== checkedInput;

  return (
    <div className="card dc-practice">
      <div className="flex justify-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Câu {pos + 1}/{queue.length}{queue.length !== lesson.sentences.length && ' (luyện lại)'}
        </span>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" title="Cài đặt" onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={16} /></button>
          {settingsOpen && (
            <div className="tw-popover" style={{ right: 0, top: '100%', width: 280, padding: 12, gap: 10 }}>
              <div className="flex justify-between align-center">
                <b style={{ fontSize: '0.85rem' }}>Cài đặt luyện tập</b>
                <button className="icon-btn" onClick={() => setSettingsOpen(false)}><X size={14} /></button>
              </div>
              <label className="form-label">Tốc độ đọc: {settings.rate}x</label>
              <input type="range" min={0.5} max={1.5} step={0.1} value={settings.rate} onChange={(e) => updateSettings({ rate: Number(e.target.value) })} />
              <label className="form-label flex align-center gap-2">
                <input type="checkbox" checked={settings.autoPlay} onChange={(e) => updateSettings({ autoPlay: e.target.checked })} />
                Tự phát khi sang câu mới
              </label>
              <label className="form-label">Số lần tự phát</label>
              <select className="form-input" value={settings.autoReplayTimes} onChange={(e) => updateSettings({ autoReplayTimes: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} lần</option>)}
              </select>
              <label className="form-label">Hiện nghĩa tiếng Việt</label>
              <select className="form-input" value={settings.showTranslation} onChange={(e) => updateSettings({ showTranslation: e.target.value as PracticeSettings['showTranslation'] })}>
                <option value="AFTER_CHECK">Sau khi làm đúng / xem đáp án</option>
                <option value="ALWAYS">Luôn hiện (dễ hơn)</option>
              </select>
              {voices.length > 0 && (
                <>
                  <label className="form-label">Giọng đọc (khi câu không có file audio)</label>
                  <select className="form-input" value={settings.voiceURI} onChange={(e) => updateSettings({ voiceURI: e.target.value })}>
                    <option value="">Mặc định (en-US)</option>
                    {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </select>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="progress-bar-container" style={{ height: 6 }}>
        <div className="progress-bar-fill" style={{ width: `${(pos / queue.length) * 100}%` }} />
      </div>

      {/* Listen */}
      <div className="flex align-center gap-2" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="dc-play" onClick={() => play(1)} disabled={playing} title="Nghe (Ctrl + Space)">
          <Volume2 size={28} />
        </button>
        <button className="btn btn-secondary" onClick={() => play(1, SLOW_RATE)} disabled={playing} title="Nghe chậm (Ctrl + Shift + Space)">
          <Snail size={16} /> Chậm
        </button>
      </div>

      {hintCount > 0 && !isDone && <div className="dc-hint">{maskSentence(sentence.text, hintCount)}</div>}
      {showMeaning && sentence.translation && !isDone && <div className="dc-meaning">{sentence.translation}</div>}

      {/* Type */}
      <textarea
        ref={inputRef}
        className="form-input dc-input"
        rows={2}
        placeholder="Gõ lại câu bạn nghe được rồi nhấn Enter để kiểm tra..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
      />

      {/* Result */}
      {result && (
        <div className={`dc-result ${result.isCorrect ? 'ok' : 'bad'}`} style={{ opacity: stale ? 0.55 : 1 }}>
          <div className="flex align-center gap-2" style={{ fontWeight: 600 }}>
            {result.isCorrect ? <CircleCheck size={18} /> : <CircleX size={18} />}
            {result.isCorrect ? 'Chính xác!' : `Chưa đúng — ${result.accuracy}% số từ`}
            {stale && <span style={{ fontWeight: 400, fontSize: '0.8rem' }}>(đã sửa, nhấn Enter để kiểm tra lại)</span>}
          </div>
          <DiffView diff={result.diff} />
          {!result.isCorrect && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span className="dc-word wrong" style={{ padding: '0 4px' }}><s>sai</s></span> từ gõ sai ·
              <span className="dc-word missing" style={{ padding: '0 4px', margin: '0 4px' }}>thiếu</span> từ còn thiếu ·
              <span className="dc-word extra" style={{ padding: '0 4px', margin: '0 4px' }}><s>thừa</s></span> từ thừa
            </div>
          )}
        </div>
      )}

      {isDone && (
        <div className="dc-answer">
          <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{sentence.text}</div>
          {sentence.translation && <div className="dc-meaning" style={{ marginTop: 6 }}>{sentence.translation}</div>}
          {sentence.note && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'pre-wrap' }}>Ghi chú: {sentence.note}</div>}
          {sentence.vocabularies?.length > 0 && (
            <div className="dc-vocab-list" style={{ marginTop: 8 }}>
              {sentence.vocabularies.map((v: any) => (
                <span key={v.term} className="dc-vocab-chip"><b>{v.term}</b> {v.meaning}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {isDone ? (
          <>
            <button className="btn btn-secondary" onClick={redo}><RotateCcw size={16} /> Làm lại câu này</button>
            <button className="btn btn-primary" onClick={next}>
              {pos + 1 < queue.length ? 'Câu tiếp theo' : 'Xem kết quả'} <ArrowRight size={16} /> <span className="dc-kbd">Enter</span>
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => setHintCount(Math.min(hintCount + 1, sentence.text.split(/\s+/).length))}>
              <Lightbulb size={16} /> Gợi ý
            </button>
            <button className="btn btn-secondary" onClick={reveal}><Eye size={16} /> Xem đáp án</button>
            <button className="btn btn-secondary" onClick={skip}><SkipForward size={16} /> Bỏ qua</button>
            <button className="btn btn-primary" onClick={check} disabled={!input.trim() || submitting}>
              Kiểm tra <span className="dc-kbd">Enter</span>
            </button>
          </>
        )}
      </div>

      {navigator}
      <p className="dc-shortcuts" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        Phím tắt: <span className="dc-kbd">Ctrl + Space</span> nghe lại · <span className="dc-kbd">Ctrl + Shift + Space</span> nghe chậm · <span className="dc-kbd">Enter</span> kiểm tra / câu tiếp
      </p>
    </div>
  );
};
