import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { BookOpen, Gamepad2, Headphones, Languages, Pause, Play, Volume2, X } from 'lucide-react';
import { loadSettings, playSentence, saveSettings, stopPlayback, unlockSpeech } from './media';
import { readStore, writeStore } from './games/common';

interface ReadingProps {
  lessonId: string;
  onManage: () => void;
  onPractice: () => void;
  onGame: () => void;
}

const TRANSLATION_KEY = 'dictation_reading_translation';
const RATES = [0.7, 0.85, 1, 1.2];
const WORDS_PER_MINUTE = 180;
const PAUSE_BETWEEN_SENTENCES_MS = 300;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Marks the sentence's vocabulary inside its text. Terms may be a base form that isn't in the sentence; those stay unmarked.
const renderText = (sentence: any) => {
  const vocab: any[] = sentence.vocabularies || [];
  if (vocab.length === 0) return sentence.text;
  const terms = [...vocab].sort((a, b) => b.term.length - a.term.length).map((v) => escapeRegExp(v.term));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return sentence.text.split(pattern).map((part: string, i: number) => {
    if (i % 2 === 0) return part;
    const meaning = vocab.find((v) => v.term.toLowerCase() === part.toLowerCase())?.meaning;
    return <mark key={i} className="rd-term" title={meaning}>{part}</mark>;
  });
};

export const Reading: React.FC<ReadingProps> = ({ lessonId, onManage, onPractice, onGame }) => {
  const [sentences, setSentences] = useState<any[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [showTranslation, setShowTranslation] = useState(() => readStore(TRANSLATION_KEY) === 'on');
  const [rate, setRate] = useState(() => loadSettings().rate);

  // A newer playback bumps this, which tells the older loop to stop
  const playRun = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const sentenceRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setSentences(null);
    api
      .get(`/api/dictation/lessons/${lessonId}`, { noCache: true })
      .then((data: any) => { if (!cancelled) setSentences(data.sentences || []); })
      .catch((err: unknown) => {
        if (cancelled) return;
        alert(getErrorMessage(err, 'Không tải được bài đọc'));
        setSentences([]);
      });
    return () => {
      cancelled = true;
      playRun.current += 1;
      stopPlayback();
    };
  }, [lessonId]);

  const stop = useCallback(() => {
    playRun.current += 1;
    stopPlayback();
    setListening(false);
  }, []);

  const listenFrom = async (start: number) => {
    if (!sentences) return;
    unlockSpeech();
    const run = ++playRun.current;
    setListening(true);
    for (let i = start; i < sentences.length; i++) {
      const sentence = sentences[i];
      setActiveId(sentence.id);
      sentenceRefs.current[sentence.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await playSentence(sentence, rateRef.current, loadSettings().voiceURI);
      if (playRun.current !== run) return;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_SENTENCES_MS));
      if (playRun.current !== run) return;
    }
    setListening(false);
  };

  const selectSentence = (sentence: any) => {
    unlockSpeech();
    playRun.current += 1;
    setListening(false);
    setActiveId(sentence.id);
    playSentence(sentence, rate, loadSettings().voiceURI);
  };

  const closeDetail = () => {
    stop();
    setActiveId(null);
  };

  const changeRate = (value: number) => {
    setRate(value);
    saveSettings({ ...loadSettings(), rate: value });
  };

  const toggleTranslation = () => {
    writeStore(TRANSLATION_KEY, showTranslation ? 'off' : 'on');
    setShowTranslation(!showTranslation);
  };

  const vocabulary = useMemo(() => {
    const seen = new Set<string>();
    return (sentences || []).flatMap((s) => s.vocabularies || []).filter((v: any) => {
      const key = v.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sentences]);

  if (!sentences) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải bài đọc...</span></div>;
  }

  if (sentences.length === 0) {
    return (
      <div className="empty-state">
        <BookOpen className="empty-state-icon" size={32} />
        <p>Chủ đề này chưa có câu nào để ghép thành bài đọc.</p>
        <button className="btn btn-primary mt-4" onClick={onManage}>Thêm câu</button>
      </div>
    );
  }

  const active = sentences.find((s) => s.id === activeId) || null;
  const wordCount = sentences.reduce((sum, s) => sum + s.text.trim().split(/\s+/).length, 0);
  const minutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
  const activeIndex = active ? sentences.indexOf(active) : -1;

  return (
    <div className="rd-layout">
      <div className="rd-main">
        <div className="rd-toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => (listening ? stop() : listenFrom(Math.max(activeIndex, 0)))}>
            {listening ? <><Pause size={14} /> Dừng</> : <><Play size={14} /> {activeIndex > 0 ? 'Nghe từ câu này' : 'Nghe cả bài'}</>}
          </button>
          <select className="form-input rd-rate" aria-label="Tốc độ đọc" value={rate} onChange={(e) => changeRate(Number(e.target.value))}>
            {[...new Set([...RATES, rate])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}x</option>)}
          </select>
          <button className={`btn btn-secondary btn-sm ${showTranslation ? 'rd-on' : ''}`} aria-pressed={showTranslation} onClick={toggleTranslation}>
            <Languages size={14} /> Song ngữ
          </button>
          <span className="rd-meta">{wordCount} từ · khoảng {minutes} phút đọc</span>
        </div>

        <article className={`rd-article ${showTranslation ? 'parallel' : ''}`} lang="en">
          {sentences.map((s) => (
            <React.Fragment key={s.id}>
              <span
                ref={(el) => { sentenceRefs.current[s.id] = el; }}
                className={`rd-sentence ${s.id === activeId ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => selectSentence(s)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  selectSentence(s);
                }}
              >
                {renderText(s)}
              </span>
              {showTranslation ? (
                <span className="rd-translation" lang="vi">{s.translation || 'Chưa có nghĩa'}</span>
              ) : ' '}
            </React.Fragment>
          ))}
        </article>

        <div className="rd-next">
          <span>Đọc xong rồi? Luyện lại nội dung này:</span>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={onPractice}><Headphones size={14} /> Chép chính tả</button>
            <button className="btn btn-secondary btn-sm" onClick={onGame}><Gamepad2 size={14} /> Chơi game từ vựng</button>
          </div>
        </div>
      </div>

      <aside className="rd-side">
        {active ? (
          <div className="card rd-detail">
            <div className="flex justify-between align-center">
              <b style={{ fontSize: '0.8rem' }}>Câu {activeIndex + 1}/{sentences.length}</b>
              <span className="flex" style={{ gap: 2 }}>
                <button className="icon-btn" title="Nghe lại" onClick={() => selectSentence(active)}><Volume2 size={15} /></button>
                <button className="icon-btn" title="Đóng" onClick={closeDetail}><X size={15} /></button>
              </span>
            </div>
            <p lang="vi" style={{ margin: 0 }}>{active.translation || <span style={{ color: 'var(--text-muted)' }}>Câu này chưa có nghĩa.</span>}</p>
            {active.note && <p className="rd-note">{active.note}</p>}
            {active.vocabularies?.length > 0 && (
              <div className="dc-vocab-list">
                {active.vocabularies.map((v: any) => <span key={v.term} className="dc-vocab-chip"><b>{v.term}</b> {v.meaning}</span>)}
              </div>
            )}
          </div>
        ) : (
          <p className="rd-tip">Chạm vào một câu để nghe và xem nghĩa.</p>
        )}
        {vocabulary.length > 0 && (
          <div className="card rd-vocab">
            <b style={{ fontSize: '0.8rem' }}>Từ vựng ({vocabulary.length})</b>
            <dl>
              {vocabulary.map((v: any) => (
                <div key={v.term}><dt lang="en">{v.term}</dt><dd>{v.meaning}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
};
