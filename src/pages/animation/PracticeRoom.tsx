import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { WORKER_COMMAND, WORKER_URL } from '../dictation/lessonWorker';
import {
  getAssetSeries, listAssetSeries, practiceStatus, setPracticeMark, startPractice,
  type AssetSeries, type AssetSummary, type PracticeState
} from './animationWorker';

const POLL_MS = 2000;
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// Only a character with its body and heads sheets can move
const riggedOf = (series: AssetSeries) =>
  series.bible.characters.filter((c) => ['body', 'heads'].every((kind) => series.items.some((item) => item.kind === kind && item.of === c.id && item.parts.length)));

const Stage: React.FC<{ seriesId: string; character: string }> = ({ seriesId, character }) => {
  const [state, setState] = useState<PracticeState | null>(null);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const { busy, run } = useBusy();

  const load = useCallback(() => {
    practiceStatus(seriesId, character).then((next) => { setState(next); setError(''); }).catch((err) => setError(message(err, 'Không đọc được phòng tập')));
  }, [seriesId, character]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (state?.status !== 'rendering') return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [state?.status, load]);

  if (error) return <div className="card"><p className="lg-error" style={{ margin: 0 }}>{error}</p></div>;
  if (!state) return <div className="loading-container"><div className="spinner" /></div>;

  const render = () => run('render', async () => {
    try { setState(await startPractice(seriesId, character)); } catch (err) { alert(message(err, 'Không dựng được video')); }
  });
  const watch = (start: number) => {
    if (!video.current) return;
    video.current.currentTime = start;
    video.current.play().catch(() => undefined);
  };
  const mark = (motion: string, value: 'ok' | 'bad') => run(`mark-${motion}`, async () => {
    try {
      const series = await setPracticeMark(seriesId, character, motion, state.marks[motion] === value ? null : value);
      setState((s) => s && { ...s, marks: series.practice?.[character] ?? {} });
    } catch (err) {
      alert(message(err, 'Không lưu được đánh giá'));
    }
  });
  const count = (value: 'ok' | 'bad') => state.motions.filter((m) => state.marks[m.id] === value).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-3">
        <div className="flex align-center gap-3" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!!busy || state.status === 'rendering'} onClick={render}>
            {state.status === 'rendering' ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} {state.status === 'rendering' ? `Đang dựng... ${state.progress}%` : state.url ? 'Dựng lại' : 'Dựng video phòng tập'}
          </button>
          <span className="lg-meta">{count('ok')} đạt · {count('bad')} chưa đạt · {state.motions.length} động tác</span>
        </div>
        {state.status === 'failed' && <p className="lg-error" style={{ margin: 0 }}>{state.error}</p>}
        {state.status === 'done' && state.url && <video ref={video} src={`${WORKER_URL}${state.url}`} controls style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />}
      </div>
      <div className="card flex flex-col gap-2">
        {state.motions.map((motion) => (
          <div key={motion.id} className="flex align-center gap-2" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-ghost btn-sm" disabled={state.status !== 'done'} onClick={() => watch(motion.start)}><Play size={14} /> {motion.label}</button>
            <div className="flex gap-2">
              <button className={`btn btn-sm ${state.marks[motion.id] === 'ok' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={state.marks[motion.id] === 'ok'} disabled={!!busy} onClick={() => mark(motion.id, 'ok')}><Check size={14} /> Đạt</button>
              <button className={`btn btn-sm ${state.marks[motion.id] === 'bad' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={state.marks[motion.id] === 'bad'} disabled={!!busy} onClick={() => mark(motion.id, 'bad')}><X size={14} /> Chưa đạt</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// One character doing every movement the engine knows, to judge the drawings and the motion
export const PracticeRoom: React.FC = () => {
  const [list, setList] = useState<AssetSummary[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [seriesId, setSeriesId] = useState('');
  const [series, setSeries] = useState<AssetSeries | null>(null);
  const [character, setCharacter] = useState('');

  const load = useCallback(() => {
    listAssetSeries().then((next) => { setList(next); setOffline(false); setSeriesId((id) => id || next[0]?.id || ''); }).catch(() => setOffline(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSeries(null);
    if (seriesId) getAssetSeries(seriesId).then((next) => { setSeries(next); setCharacter(riggedOf(next)[0]?.id ?? ''); }).catch(() => setOffline(true));
  }, [seriesId]);

  if (offline) {
    return (
      <div className="card flex flex-col gap-3">
        <p>Không kết nối được worker trên máy. Chạy lệnh sau một lần rồi thử lại:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <div><button className="btn btn-primary" onClick={load}><RotateCcw size={16} /> Thử lại</button></div>
      </div>
    );
  }
  if (!list) return <div className="loading-container"><div className="spinner" /></div>;

  const characters = series ? riggedOf(series) : [];
  return (
    <div className="flex flex-col gap-3">
      <p className="lg-meta" style={{ margin: 0 }}>Video không tiếng cho một nhân vật làm lần lượt từng động tác. Xem rồi đánh dấu đạt / chưa đạt; video thật dùng đúng những chuyển động này.</p>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 'auto' }} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} aria-label="Series">
          {list.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={character} onChange={(e) => setCharacter(e.target.value)} aria-label="Nhân vật">
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {series && !characters.length && <div className="card"><p className="lg-meta" style={{ margin: 0 }}>Series này chưa có nhân vật nào đủ bảng bộ phận và bảng đầu.</p></div>}
      {series && character && characters.some((c) => c.id === character) && <Stage key={`${series.id}/${character}`} seriesId={series.id} character={character} />}
    </div>
  );
};
