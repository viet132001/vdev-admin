import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Clapperboard, Eye, Loader2, Paintbrush, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { useBusy } from './tasks/agent';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { VideoPublish } from './dictation/VideoPublish';
import {
  COMEDY_GENRE, WORKER_COMMAND, comedyCatalog, createComedy, getJob, isComedyJob, isPublishing, jobAction, jobVideoUrl, listJobs, paintComedySet, previewComedyLine, saveComedyScript,
  type ComedyCatalog, type ComedyLine, type ComedyScript, type LessonJob
} from './dictation/lessonWorker';

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
const CAMERA_LABEL: Record<string, string> = { wide: 'Toàn cảnh', close: 'Cận người nói', insert: 'Cận đồ vật' };

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// One line of the script: who says what, with which face and body, framed how
const LineEditor: React.FC<{
  line: ComedyLine;
  index: number;
  total: number;
  cast: string[];
  spots: { name: string; about: string }[];
  catalog: ComedyCatalog;
  preview: string | null;
  previewing: boolean;
  onChange: (line: ComedyLine) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPreview: () => void;
}> = ({ line, index, total, cast, spots, catalog, preview, previewing, onChange, onMove, onRemove, onPreview }) => {
  const set = (patch: Partial<ComedyLine>) => onChange({ ...line, ...patch });
  const name = (id: string) => catalog.cast.find((c) => c.id === id)?.name ?? id;
  const num = (value: string) => (value === '' ? null : Math.max(0, Math.min(3, Number(value))));
  return (
    <div className="st-line">
      <div className="st-line-head">
        <span className="st-line-no">{index + 1}</span>
        <select className="form-input" value={line.speaker} onChange={(e) => set({ speaker: e.target.value })}>
          {cast.map((id) => <option key={id} value={id}>{name(id)}</option>)}
        </select>
        <input className="form-input st-text" maxLength={90} placeholder="Câu thoại tiếng Anh (để trống nếu là cảnh không lời)" value={line.text} onChange={(e) => set({ text: e.target.value })} />
        <div className="st-line-tools">
          <button className="icon-btn" title="Lên" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
          <button className="icon-btn" title="Xuống" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
          <button className="icon-btn" title="Xoá câu" onClick={onRemove}><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="st-fields">
        <label>Biểu cảm<select className="form-input" value={line.expression} onChange={(e) => set({ expression: e.target.value })}>{catalog.expressions.map((x) => <option key={x.id} value={x.id} title={x.use}>{x.id} · {x.use}</option>)}</select></label>
        <label>Tư thế<select className="form-input" value={line.pose} onChange={(e) => set({ pose: e.target.value })}>{catalog.poses.map((x) => <option key={x.id} value={x.id} title={x.use}>{x.id} · {x.use}</option>)}</select></label>
        <label>Máy quay<select className="form-input" value={line.camera} onChange={(e) => set({ camera: e.target.value as ComedyLine['camera'], spot: e.target.value === 'insert' ? line.spot ?? spots[0]?.name ?? null : null })}>{catalog.cameras.map((c) => <option key={c} value={c}>{CAMERA_LABEL[c] ?? c}</option>)}</select></label>
        {line.camera === 'insert' && (
          <label>Đồ vật<select className="form-input" value={line.spot ?? ''} onChange={(e) => set({ spot: e.target.value })}>{spots.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.about}</option>)}</select></label>
        )}
        <label>Im trước (giây)<input type="number" min={0} max={3} step={0.1} className="form-input" value={line.pause ?? ''} onChange={(e) => set({ pause: num(e.target.value) })} /></label>
        {!line.text.trim() && <label>Giữ hình (giây)<input type="number" min={0.2} max={3} step={0.1} className="form-input" value={line.hold ?? ''} onChange={(e) => set({ hold: num(e.target.value) })} /></label>}
        <label>Hiệu ứng<select className="form-input" value={line.fx ?? ''} onChange={(e) => set({ fx: e.target.value || null })}><option value="">Không</option>{catalog.fx.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <label>Âm thanh<select className="form-input" value={line.sfx ?? ''} onChange={(e) => set({ sfx: e.target.value || null })}><option value="">Không</option>{catalog.sfx.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <label>Người nghe phản ứng
          <select className="form-input" value={line.listener ? line.listener.expression : ''} onChange={(e) => set({ listener: e.target.value ? { expression: e.target.value, pose: line.listener?.pose ?? 'stand' } : null })}>
            <option value="">Giữ nguyên</option>{catalog.expressions.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
          </select>
        </label>
        {line.listener && <label>Tư thế người nghe<select className="form-input" value={line.listener.pose} onChange={(e) => set({ listener: { ...line.listener!, pose: e.target.value } })}>{catalog.poses.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}</select></label>}
      </div>
      <div className="flex align-center gap-2" style={{ marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" disabled={previewing} onClick={onPreview}>{previewing ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} Xem thử</button>
      </div>
      {preview && <img className="st-preview" src={preview} alt={`Câu ${index + 1}`} />}
    </div>
  );
};

export const Studio: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('job');
  const { busy, run } = useBusy();
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [jobs, setJobs] = useState<LessonJob[]>([]);
  const [catalog, setCatalog] = useState<ComedyCatalog | null>(null);
  const [job, setJob] = useState<LessonJob | null>(null);
  const [script, setScript] = useState<ComedyScript | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [idea, setIdea] = useState({ idea: '', note: '' });
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [painting, setPainting] = useState<{ shot: number; id: string; description: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, cat] = await Promise.all([listJobs(), comedyCatalog()]);
      setJobs(list.filter(isComedyJob));
      setCatalog(cat);
      setState('online');
    } catch {
      setState('offline');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The job on screen, and its script as the editor's own copy
  useEffect(() => {
    const found = jobs.find((j) => j.id === selectedId) ?? null;
    setJob(found);
    if (found && !dirty) setScript(found.comedy?.script ? structuredClone(found.comedy.script) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, jobs]);

  const moving = !!job && (MOVING.includes(job.status) || isPublishing(job));
  useEffect(() => {
    if (!job || !moving) return;
    const timer = window.setInterval(() => {
      getJob(job.id).then((next) => setJobs((list) => list.map((j) => (j.id === next.id ? next : j)))).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [job, moving]);

  const select = (id: string | null) => {
    setDirty(false);
    setErrors([]);
    setPreviews({});
    setParams(id ? { job: id } : {});
  };
  const replace = (next: LessonJob) => setJobs((list) => (list.some((j) => j.id === next.id) ? list.map((j) => (j.id === next.id ? next : j)) : [next, ...list]));
  const edit = (next: ComedyScript) => {
    setScript(next);
    setDirty(true);
  };

  const submitIdea = (e: React.FormEvent) => {
    e.preventDefault();
    run('idea', async () => {
      try {
        const created = await createComedy(idea.idea.trim(), idea.note.trim());
        replace(created);
        setIdea({ idea: '', note: '' });
        select(created.id);
      } catch (err) {
        alert(message(err, 'Không gửi được ý tưởng cho Claude'));
      }
    });
  };

  const save = async () => {
    if (!job || !script) return null;
    try {
      const next = await saveComedyScript(job.id, script);
      replace(next);
      setDirty(false);
      setErrors([]);
      return next;
    } catch (err) {
      setErrors(message(err, 'Không lưu được kịch bản').split('; '));
      return null;
    }
  };

  const render = () => run('render', async () => {
    if (!job) return;
    if (dirty && !(await save())) return;
    try {
      replace(await jobAction(job.id, job.status === 'DONE' ? 'rerender' : job.status === 'FAILED' ? 'retry' : 'approve'));
    } catch (err) {
      alert(message(err, 'Không render được'));
    }
  });

  const preview = async (index: number) => {
    if (!job || !script) return;
    setPreviewing(index);
    try {
      const url = await previewComedyLine(job.id, index, script);
      setPreviews((p) => ({ ...p, [index]: url }));
      setErrors([]);
    } catch (err) {
      setErrors(message(err, 'Không xem thử được').split('; '));
    } finally {
      setPreviewing(null);
    }
  };

  const paint = () => run('paint', async () => {
    if (!job || !painting || !script) return;
    try {
      setCatalog(await paintComedySet(job.id, painting.id.trim().toLowerCase(), painting.description.trim()));
      edit({ ...script, shots: script.shots.map((shot, i) => (i === painting.shot ? { ...shot, set: painting.id.trim().toLowerCase() } : shot)) });
      setPainting(null);
    } catch (err) {
      alert(message(err, 'Claude chưa vẽ được bối cảnh'));
    }
  });

  const retry = () => run('retry', async () => {
    if (!job) return;
    try {
      replace(await jobAction(job.id, 'retry'));
    } catch (err) {
      alert(message(err, 'Không thử lại được'));
    }
  });

  const askDelete = () => job && setConfirm({
    title: 'Xoá video hài này?',
    message: 'Kịch bản và file video trên máy bị xoá. Bài đã đăng hoặc đã hẹn trên Facebook / YouTube vẫn còn.',
    confirmLabel: 'Xoá',
    action: async () => {
      setConfirm(null);
      try {
        await jobAction(job.id, job.status === 'PLANNING' || job.status === 'RENDERING' ? 'cancel' : 'delete');
        setJobs((list) => list.filter((j) => j.id !== job.id));
        select(null);
      } catch (err) {
        alert(message(err, 'Không xoá được'));
      }
    }
  });

  if (state === 'loading') return <div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>;
  if (state === 'offline') {
    return (
      <div className="flex flex-col gap-4">
        <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 600 }}>Studio video hài</h1>
        <div className="card">
          <p>Studio chạy bằng công cụ trên máy này, chưa kết nối được. Nếu chưa cài, mở Terminal và chạy:</p>
          <pre className="lg-command">{WORKER_COMMAND}</pre>
          <button className="btn btn-primary mt-4" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
        </div>
      </div>
    );
  }

  const setOf = (id: string) => catalog?.sets.find((s) => s.id === id);
  const status = job ? STATUS[job.status] ?? { label: job.status, tone: 'info' } : null;
  const editable = !!job && !!script && ['PLAN_READY', 'DONE', 'FAILED'].includes(job.status) && !!catalog;
  const posted = !!job && (!!(job.facebook && job.facebook.status !== 'FAILED') || !!(job.youtube && job.youtube.status !== 'FAILED'));
  let lineNo = 0;

  return (
    <div className="st-shell">
      <aside className="st-list">
        <button className={`btn ${selectedId ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }} onClick={() => select(null)}><Plus size={16} /> Ý tưởng mới</button>
        {jobs.length === 0 && <p className="lg-meta">Chưa có video nào.</p>}
        {jobs.map((j) => {
          const s = STATUS[j.status] ?? { label: j.status, tone: 'info' };
          return (
            <button key={j.id} className={`st-item${j.id === selectedId ? ' active' : ''}`} onClick={() => select(j.id)}>
              <span className="vl-title">{j.comedy?.script.title ?? j.request.topic}</span>
              <span className={`badge badge-${s.tone}`}>{s.label}</span>
            </button>
          );
        })}
      </aside>

      <section className="st-main">
        {!job && (
          <form className="card flex flex-col gap-4" onSubmit={submitIdea}>
            <div>
              <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>Studio video hài</h1>
              <p className="lg-meta" style={{ marginTop: 4 }}>Nhập ý tưởng, Claude viết kịch bản khoảng 20 giây, chọn nhân vật, tư thế, góc máy và vẽ bối cảnh nếu cần. Bạn sửa từng câu, xem thử rồi render với giọng ElevenLabs.</p>
            </div>
            <div className="form-group">
              <label className="form-label">Ý tưởng <span className="form-required">*</span></label>
              <textarea autoFocus required rows={3} maxLength={600} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: Khoa gọi lễ tân than cửa sổ không mở, hoá ra là bức tranh" value={idea.idea} onChange={(e) => setIdea({ ...idea, idea: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Yêu cầu thêm</label>
              <textarea rows={2} maxLength={600} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: dùng Bo và Tú, ở văn phòng, câu chốt thật khô" value={idea.note} onChange={(e) => setIdea({ ...idea, note: e.target.value })} />
            </div>
            {catalog && <p className="lg-meta" style={{ margin: 0 }}>Dàn nhân vật: {catalog.cast.map((c) => c.name).join(', ')}. Bối cảnh có sẵn: {catalog.sets.map((s) => s.id).join(', ')}.</p>}
            <div><button type="submit" className="btn btn-primary" disabled={!!busy || !idea.idea.trim()}><Sparkles size={16} /> {busy ? 'Đang gửi...' : 'Gửi cho Claude'}</button></div>
          </form>
        )}

        {job && (
          <div className="flex flex-col gap-4">
            <header className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 600 }}>{script?.title ?? job.request.topic}</h1>
                <p className="lg-meta" style={{ margin: '2px 0 0' }}>{job.request.topic}</p>
              </div>
              <div className="flex align-center gap-2">
                {status && <span className={`badge badge-${status.tone}`}>{status.label}</span>}
                <button className="icon-btn" title="Xoá" onClick={askDelete}><Trash2 size={16} /></button>
              </div>
            </header>

            {job.status === 'PLANNING' && <div className="card flex align-center gap-2"><Loader2 size={16} className="spin" /> Claude đang viết kịch bản và vẽ bối cảnh mới nếu cần. Thường mất 1–3 phút.</div>}
            {job.status === 'RENDERING' && <div className="card flex align-center gap-2"><Loader2 size={16} className="spin" /> Đang lồng giọng ElevenLabs và render video...</div>}
            {job.status === 'FAILED' && (
              <div className="card">
                <p className="lg-error" style={{ marginTop: 0 }}>{job.error}</p>
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={job.failedStage === 'render' ? render : retry}><RotateCcw size={14} /> Thử lại</button>
              </div>
            )}

            {job.status === 'DONE' && job.videoPath && (
              <div className="card">
                <video className="lg-video" src={jobVideoUrl(job.id)} controls playsInline preload="metadata" />
                <p className="lg-meta">Bản trên máy: <code>{job.videoPath}</code></p>
                <VideoPublish key={job.id} job={job} genre={COMEDY_GENRE} onManageChannels={() => alert('Kết nối kênh "Hài ngắn" ở màn Quản lý kênh trong Quản lý page.')} onChange={replace} onLinked={() => undefined} />
              </div>
            )}

            {editable && script && catalog && (
              <div className="card flex flex-col gap-4">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tên tập</label>
                  <input className="form-input" maxLength={80} value={script.title} disabled={posted} onChange={(e) => edit({ ...script, title: e.target.value })} />
                </div>
                {posted && <p className="lg-meta" style={{ margin: 0 }}>Video đã đăng hoặc đã hẹn, không sửa kịch bản được nữa.</p>}
                {script.shots.map((shot, s) => {
                  const set = setOf(shot.set);
                  const cast = shot.blocking.map((b) => b.cast);
                  const setShot = (patch: Partial<typeof shot>) => edit({ ...script, shots: script.shots.map((x, i) => (i === s ? { ...x, ...patch } : x)) });
                  return (
                    <div key={s} className="st-shot">
                      <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
                        <b>Cảnh {s + 1}</b>
                        <select className="form-input" style={{ maxWidth: 260 }} value={shot.set} onChange={(e) => setShot({ set: e.target.value })}>
                          {catalog.sets.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={() => setPainting({ shot: s, id: '', description: '' })}><Paintbrush size={14} /> Vẽ bối cảnh mới</button>
                      </div>
                      {set && <p className="lg-meta" style={{ margin: '4px 0 0' }}>{set.description}</p>}
                      {painting?.shot === s && (
                        <div className="st-paint">
                          <input className="form-input" maxLength={40} placeholder="id, VD: office-night" value={painting.id} onChange={(e) => setPainting({ ...painting, id: e.target.value })} />
                          <textarea rows={3} maxLength={1200} className="form-input" placeholder="Mô tả: đồ vật, ai đứng hay ngồi ở đâu, vật nào cần cận cảnh" value={painting.description} onChange={(e) => setPainting({ ...painting, description: e.target.value })} />
                          <div className="flex gap-2">
                            <button className="btn btn-secondary btn-sm" onClick={() => setPainting(null)}>Huỷ</button>
                            <button className="btn btn-primary btn-sm" disabled={!!busy || !/^[a-z][a-z0-9-]{2,40}$/.test(painting.id.trim().toLowerCase()) || !painting.description.trim()} onClick={paint}>{busy === 'paint' ? <Loader2 size={14} className="spin" /> : <Paintbrush size={14} />} Claude vẽ</button>
                          </div>
                        </div>
                      )}
                      <div className="st-blocking">
                        {shot.blocking.map((b, i) => (
                          <div key={i} className="flex align-center gap-2">
                            <select className="form-input" value={b.cast} onChange={(e) => setShot({ blocking: shot.blocking.map((x, j) => (j === i ? { ...x, cast: e.target.value } : x)) })}>
                              {catalog.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select className="form-input" value={b.mark} onChange={(e) => setShot({ blocking: shot.blocking.map((x, j) => (j === i ? { ...x, mark: e.target.value } : x)) })}>
                              {(set?.marks ?? []).map((m) => <option key={m.name} value={m.name}>{m.name} ({m.stance === 'sit' ? 'ngồi' : 'đứng'})</option>)}
                            </select>
                            <button className="btn btn-secondary btn-sm" title="Đổi hướng nhìn" onClick={() => setShot({ blocking: shot.blocking.map((x, j) => (j === i ? { ...x, facing: x.facing === 1 ? -1 : 1 } : x)) })}>{b.facing === 1 ? 'Nhìn sang phải →' : '← Nhìn sang trái'}</button>
                            {shot.blocking.length > 1 && <button className="icon-btn" title="Bỏ người này" onClick={() => setShot({ blocking: shot.blocking.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                          </div>
                        ))}
                        {set && shot.blocking.length < set.marks.length && (
                          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
                            const free = set.marks.find((m) => !shot.blocking.some((b) => b.mark === m.name));
                            const who = catalog.cast.find((c) => !cast.includes(c.id));
                            if (free && who) setShot({ blocking: [...shot.blocking, { cast: who.id, mark: free.name, facing: -1 }] });
                          }}><Plus size={14} /> Thêm người</button>
                        )}
                      </div>
                      {shot.lines.map((line, l) => {
                        const index = lineNo++;
                        const setLines = (lines: ComedyLine[]) => setShot({ lines });
                        return (
                          <LineEditor
                            key={l}
                            line={line}
                            index={l}
                            total={shot.lines.length}
                            cast={cast}
                            spots={set?.spots ?? []}
                            catalog={catalog}
                            preview={previews[index] ?? null}
                            previewing={previewing === index}
                            onChange={(next) => setLines(shot.lines.map((x, i) => (i === l ? next : x)))}
                            onMove={(dir) => {
                              const lines = [...shot.lines];
                              [lines[l], lines[l + dir]] = [lines[l + dir], lines[l]];
                              setLines(lines);
                            }}
                            onRemove={() => setLines(shot.lines.filter((_, i) => i !== l))}
                            onPreview={() => preview(index)}
                          />
                        );
                      })}
                      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShot({ lines: [...shot.lines, { speaker: cast[0], text: '', expression: 'neutral', pose: 'stand', camera: 'close', spot: null, pause: null, hold: 0.6, fx: null, sfx: null, listener: null }] })}><Plus size={14} /> Thêm câu</button>
                    </div>
                  );
                })}
                {errors.length > 0 && <ul className="lg-error" style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                <div className="flex gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" disabled={!!busy || !dirty || posted} onClick={() => run('save', async () => { await save(); })}><Save size={16} /> Lưu kịch bản</button>
                  <button className="btn btn-primary" disabled={!!busy || posted} onClick={render}><Clapperboard size={16} /> {job.status === 'DONE' ? 'Render lại' : 'Duyệt và render'}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
