import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { VideoPublish } from '../dictation/VideoPublish';
import { ANIMATION_GENRE, WORKER_COMMAND, getJob, isPublishing, jobAction, jobVideoUrl, listJobs, type LessonJob } from '../dictation/lessonWorker';
import {
  NARRATOR, animationCatalog, createAnimationJob, getAssetSeries, isAnimation, listAssetSeries, normalizeShot, previewAnimationShot, saveAnimationScript,
  type AnimationCatalog, type AnimationJob, type AnimationScript, type AssetSeries, type AssetSummary, type ScriptShot
} from './animationWorker';
import { ShotEditor } from './ShotEditor';
import { VoicePanel } from './VoicePanel';

const POLL_MS = 2500;
const MOVING = ['PLANNING', 'RENDERING'];
const STATUS: Record<string, { label: string; tone: string }> = {
  PLANNING: { label: 'Claude đang viết', tone: 'info' },
  PLAN_READY: { label: 'Chờ duyệt', tone: 'warning' },
  RENDERING: { label: 'Đang render', tone: 'info' },
  DONE: { label: 'Có video', tone: 'success' },
  FAILED: { label: 'Lỗi', tone: 'danger' },
  CANCELLED: { label: 'Đã huỷ', tone: 'warning' }
};
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const titleOf = (job: AnimationJob) => job.animation?.script.title || job.request.topic;

// A new shot starts like the last one: same room, people where they ended up, same air; nobody talking yet
const blankShot = (after: ScriptShot | undefined, background: string): ScriptShot => ({
  background: after?.background ?? background, camera: 'wide', subject: null, move: 'hold', transition: 'cut',
  cast: after ? structuredClone(after.cast).map((m) => ({ ...m, x: m.toX ?? m.x, toX: null })) : [], props: [], speaker: null, text: '', expression: 'neutral', reactions: [], action: 'none',
  effects: after ? [...after.effects] : [], tone: after?.tone ?? 'none', light: after?.light ? { ...after.light } : null
});

export const Videos: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('video');
  const { busy, run } = useBusy();
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [jobs, setJobs] = useState<AnimationJob[]>([]);
  const [seriesList, setSeriesList] = useState<AssetSummary[]>([]);
  const [catalog, setCatalog] = useState<AnimationCatalog | null>(null);
  const [series, setSeries] = useState<AssetSeries | null>(null); // for its voices
  const [script, setScript] = useState<AnimationScript | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState({ seriesId: '', idea: '', note: '' });
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, series] = await Promise.all([listJobs(), listAssetSeries()]);
      setJobs(list.filter(isAnimation));
      setSeriesList(series);
      setForm((f) => ({ ...f, seriesId: f.seriesId || series[0]?.id || '' }));
      setState('online');
    } catch {
      setState('offline');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const job = jobs.find((j) => j.id === selectedId) ?? null;
  // The editor works on its own copy of the script until it is saved
  useEffect(() => {
    if (job && !dirty) setScript(job.animation?.script.shots.length ? { ...structuredClone(job.animation.script), shots: job.animation.script.shots.map(normalizeShot) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, jobs]);
  useEffect(() => {
    setCatalog(null);
    setPreviews({});
    setErrors([]);
    setDirty(false);
    if (selectedId) animationCatalog(selectedId).then(setCatalog).catch(() => undefined);
  }, [selectedId]);
  const seriesId = jobs.find((j) => j.id === selectedId)?.animation?.seriesId ?? null;
  useEffect(() => {
    setSeries(null);
    if (seriesId) getAssetSeries(seriesId).then(setSeries).catch(() => undefined);
  }, [seriesId]);

  const moving = !!job && (MOVING.includes(job.status) || isPublishing(job as LessonJob));
  useEffect(() => {
    if (!job || !moving) return;
    const timer = window.setInterval(() => {
      getJob(job.id).then((next) => setJobs((list) => list.map((j) => (j.id === next.id ? (next as AnimationJob) : j)))).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [job, moving]);

  const select = (id: string | null) => setParams(id ? { tab: 'video', video: id } : { tab: 'video' });
  const replace = (next: LessonJob | AnimationJob) => setJobs((list) => (list.some((j) => j.id === next.id) ? list.map((j) => (j.id === next.id ? (next as AnimationJob) : j)) : [next as AnimationJob, ...list]));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const next = await createAnimationJob(form.seriesId, form.idea, form.note);
        replace(next);
        setForm((f) => ({ ...f, idea: '', note: '' }));
        select(next.id);
      } catch (err) {
        alert(message(err, 'Không tạo được video'));
      }
    });
  };

  const edit = (next: AnimationScript) => { setScript(next); setDirty(true); setErrors([]); setPreviews({}); };
  const patchShot = (i: number, shot: ScriptShot) => script && edit({ ...script, shots: script.shots.map((s, n) => (n === i ? shot : s)) });
  const moveShot = (i: number, d: -1 | 1) => {
    if (!script) return;
    const shots = [...script.shots];
    [shots[i], shots[i + d]] = [shots[i + d], shots[i]];
    edit({ ...script, shots });
  };

  // Saves what the worker accepts; its checks come back as a list to fix
  const save = async (): Promise<boolean> => {
    if (!job || !script) return false;
    try {
      replace(await saveAnimationScript(job.id, script));
      setDirty(false);
      setErrors([]);
      return true;
    } catch (err) {
      setErrors(message(err, 'Không lưu được kịch bản').split('; '));
      return false;
    }
  };

  const render = () => run('render', async () => {
    if (!job) return;
    if (dirty && !(await save())) return;
    try {
      replace(await jobAction(job.id, job.status === 'DONE' ? 'rerender' : job.status === 'FAILED' ? 'retry' : 'approve'));
    } catch (err) {
      alert(message(err, 'Không bắt đầu render được'));
    }
  });
  const retry = () => run('retry', async () => {
    if (!job) return;
    try { replace(await jobAction(job.id, 'retry')); } catch (err) { alert(message(err, 'Không thử lại được')); }
  });
  const preview = async (i: number) => {
    if (!job || !script) return;
    setPreviewing(i);
    try {
      const url = await previewAnimationShot(job.id, i, script);
      setPreviews((p) => ({ ...p, [i]: url }));
      setErrors([]);
    } catch (err) {
      setErrors(message(err, 'Không xem thử được').split('; '));
    } finally {
      setPreviewing(null);
    }
  };
  const askDelete = () => job && setConfirm({
    title: 'Xoá video', message: `Xoá "${titleOf(job)}" khỏi máy? Video đã đăng vẫn ở trên kênh.`, confirmLabel: 'Xoá',
    action: async () => { setConfirm(null); try { await jobAction(job.id, 'delete'); setJobs((l) => l.filter((j) => j.id !== job.id)); select(null); } catch (err) { alert(message(err, 'Không xoá được video')); } }
  });

  if (state === 'loading') return <div className="loading-container"><div className="spinner" /></div>;
  if (state === 'offline') {
    return (
      <div className="card flex flex-col gap-3">
        <p>Không kết nối được worker trên máy. Chạy lệnh sau một lần rồi thử lại:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <div><button className="btn btn-primary" onClick={() => { setState('loading'); load(); }}><RotateCcw size={16} /> Kết nối lại</button></div>
      </div>
    );
  }

  const status = job ? STATUS[job.status] ?? { label: job.status, tone: 'info' } : null;
  const posted = !!job && (!!(job.facebook && job.facebook.status !== 'FAILED') || !!(job.youtube && job.youtube.status !== 'FAILED'));
  const editable = !!job && !!script && !!catalog && ['PLAN_READY', 'DONE', 'FAILED'].includes(job.status) && !(job.status === 'FAILED' && job.failedStage !== 'render');
  const readySeries = seriesList.filter((s) => s.ready > 0);
  // Who speaks in this script, and the first line of each: what the voices are tried on before the render
  const lines: Record<string, string> = {};
  for (const shot of script?.shots ?? []) if (shot.speaker && shot.text.trim() && !lines[shot.speaker]) lines[shot.speaker] = shot.text.trim();
  const speakers = Object.keys(lines).sort((a, b) => (a === NARRATOR ? -1 : b === NARRATOR ? 1 : 0));

  return (
    <div className="st-shell">
      <aside className="st-list">
        <button className={`btn ${selectedId ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }} onClick={() => select(null)}><Plus size={16} /> Video mới</button>
        {jobs.length === 0 && <p className="lg-meta">Chưa có video nào.</p>}
        {jobs.map((j) => {
          const s = STATUS[j.status] ?? { label: j.status, tone: 'info' };
          return (
            <button key={j.id} className={`st-item${j.id === selectedId ? ' active' : ''}`} onClick={() => select(j.id)}>
              <span className="vl-title">{titleOf(j)}</span>
              <span className={`badge badge-${s.tone}`}>{s.label}</span>
            </button>
          );
        })}
      </aside>

      <section className="st-main flex flex-col gap-4">
        {!job && (
          <form className="card flex flex-col gap-4" onSubmit={create}>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Video mới</h2>
              <p className="lg-meta" style={{ margin: '4px 0 0' }}>Chọn series, nhập ý tưởng: Claude viết kịch bản phim kể chuyện 16:9 (người kể dẫn truyện, nhân vật đối thoại, tư thế, cử chỉ, máy quay, ánh sáng, không khí) chỉ từ asset series đã có ảnh. Bạn sửa từng shot, xem thử rồi render bằng giọng ElevenLabs đã chọn cho series.</p>
            </div>
            {readySeries.length === 0 ? (
              <p className="lg-meta" style={{ margin: 0 }}>Chưa series nào có ảnh. Qua tab Asset, tải ít nhất một nhân vật và một bối cảnh.</p>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Series</label>
                  <select className="form-input" value={form.seriesId} onChange={(e) => setForm({ ...form, seriesId: e.target.value })}>
                    {readySeries.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.ready}/{s.total} ảnh)</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ý tưởng <span className="form-required">*</span></label>
                  <textarea className="form-input" rows={3} value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })} placeholder="Ví dụ: Bo nhặt được một ngôi sao rơi và phải đưa nó về bầu trời" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ghi chú thêm</label>
                  <input className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Độ dài (mặc định 2–4 phút, tối đa 20), giọng điệu, kết thúc mong muốn…" />
                </div>
                <div><button className="btn btn-primary" type="submit" disabled={!!busy || !form.idea.trim() || !form.seriesId}>{busy === 'create' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} Claude viết kịch bản</button></div>
              </>
            )}
          </form>
        )}

        {job && (
          <>
            <header className="flex align-center gap-3" style={{ justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>{titleOf(job)}</h2>
                <p className="lg-meta" style={{ margin: 0 }}>{job.request.topic}</p>
              </div>
              <div className="flex align-center gap-2">
                {status && <span className={`badge badge-${status.tone}`}>{status.label}</span>}
                <button className="icon-btn" title="Xoá" onClick={askDelete}><Trash2 size={16} /></button>
              </div>
            </header>

            {job.status === 'PLANNING' && <div className="card flex align-center gap-2"><Loader2 size={16} className="spin" /> Claude đang viết kịch bản từ asset của series. Thường mất 1–3 phút.</div>}
            {job.status === 'RENDERING' && <div className="card flex align-center gap-2"><Loader2 size={16} className="spin" /> Đang lồng giọng và render video...</div>}
            {job.status === 'FAILED' && (
              <div className="card">
                <p className="lg-error" style={{ marginTop: 0 }}>{job.error}</p>
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={job.failedStage === 'render' ? render : retry}><RotateCcw size={14} /> Thử lại</button>
              </div>
            )}

            {job.status === 'DONE' && job.videoPath && (
              <div className="card">
                <video className="lg-video" src={jobVideoUrl(job.id)} controls playsInline preload="metadata" style={{ maxHeight: 560 }} />
                <p className="lg-meta">Bản trên máy: <code>{job.videoPath}</code></p>
                <VideoPublish key={job.id} job={job as LessonJob} genre={ANIMATION_GENRE} onManageChannels={() => alert('Kết nối kênh "Hoạt hình" ở màn Quản lý kênh trong Quản lý page.')} onChange={replace} onLinked={() => undefined} />
              </div>
            )}

            {editable && script && catalog && (
              <div className="card flex flex-col gap-4">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tên video</label>
                  <input className="form-input" maxLength={80} value={script.title} disabled={posted} onChange={(e) => edit({ ...script, title: e.target.value })} />
                </div>
                {posted && <p className="lg-meta" style={{ margin: 0 }}>Video đã đăng hoặc đã hẹn, không sửa kịch bản được nữa.</p>}
                {script.shots.map((shot, i) => (
                  <ShotEditor key={i} index={i} shot={shot} catalog={catalog} disabled={posted} first={i === 0} last={i === script.shots.length - 1}
                    preview={previews[i]} previewing={previewing === i}
                    onChange={(next) => patchShot(i, next)} onMove={(d) => moveShot(i, d)}
                    onDuplicate={() => edit({ ...script, shots: [...script.shots.slice(0, i + 1), structuredClone(shot), ...script.shots.slice(i + 1)] })}
                    onDelete={() => edit({ ...script, shots: script.shots.filter((_, n) => n !== i) })}
                    onPreview={() => preview(i)} />
                ))}
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" disabled={posted} onClick={() => edit({ ...script, shots: [...script.shots, blankShot(script.shots[script.shots.length - 1], catalog.backgrounds[0]?.id ?? '')] })}><Plus size={14} /> Thêm shot</button>
                </div>
                {errors.length > 0 && <ul className="lg-error" style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                {!posted && series && speakers.length > 0 && <VoicePanel series={series} onChange={setSeries} only={speakers} lines={lines} startOpen={job.status === 'PLAN_READY'} />}
                {!posted && (
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" disabled={!!busy || !dirty} onClick={() => run('save', async () => { await save(); })}><Save size={16} /> Lưu kịch bản</button>
                    <button className="btn btn-primary" disabled={!!busy} onClick={render}>{busy === 'render' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} {job.status === 'DONE' ? 'Render lại' : 'Duyệt và render'}</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
