import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, Save, Undo2, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { getShots, jobAction, previewShot, saveShots, tryShots, type LessonJob, type ShotEdit, type ShotEdits, type StudioShot, type StudioView } from './lessonWorker';

const DRY_RUN_MS = 300;
const STILL_MS = 450;

const isPosted = (job: LessonJob) => (!!job.facebook && job.facebook.status !== 'FAILED') || (!!job.youtube && job.youtube.status !== 'FAILED');

// An edit with nothing left in it is no edit: the shot goes back to what the lesson planned
const tidy = (edit: ShotEdit): ShotEdit | null => {
  const actors = Object.fromEntries(Object.entries(edit.actors ?? {}).filter(([, change]) => change && Object.keys(change).length));
  const next: ShotEdit = { ...edit, ...(Object.keys(actors).length ? { actors } : {}) };
  if (!Object.keys(actors).length) delete next.actors;
  return Object.keys(next).length ? next : null;
};

const firstLine = (view: StudioView) => (view.shots.find((s) => s.kind === 'sentence') ?? view.shots[0])?.key ?? null;

interface ShotEditorProps {
  job: LessonJob;
  onClose: () => void;
  onRendering: (job: LessonJob) => void;
}

export const ShotEditor: React.FC<ShotEditorProps> = ({ job, onClose, onRendering }) => {
  const { busy, run } = useBusy();
  const [view, setView] = useState<StudioView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ShotEdits>({});
  const [draft, setDraft] = useState<ShotEdits>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'still' | 'clip' } | null>(null);
  const [previewing, setPreviewing] = useState<'still' | 'clip' | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const readOnly = isPosted(job);
  const canRender = job.status === 'DONE' || (job.status === 'FAILED' && job.failedStage === 'render');
  // Answers can come back out of order; only the newest one may land
  const dryRun = useRef(0);
  const stillRun = useRef(0);

  useEffect(() => {
    getShots(job.id)
      .then((loaded) => {
        setView(loaded);
        setSaved(loaded.edits);
        setDraft(loaded.edits);
        setSelected(firstLine(loaded));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Không tải được danh sách cảnh'));
  }, [job.id]);

  const draftKey = JSON.stringify(draft);
  const dirty = draftKey !== JSON.stringify(saved);
  const loaded = !!view;
  // The worker works out what an edit leads to (who stays down, which sounds play), so the page asks instead of guessing
  useEffect(() => {
    if (!loaded) return;
    const ticket = ++dryRun.current;
    const timer = window.setTimeout(() => {
      tryShots(job.id, JSON.parse(draftKey))
        .then((next) => { if (ticket === dryRun.current) setView(next); })
        .catch(() => undefined);
    }, DRY_RUN_MS);
    return () => window.clearTimeout(timer);
  }, [job.id, draftKey, loaded]);

  const shot: StudioShot | undefined = view?.shots.find((s) => s.key === selected);
  const blocked = !!view?.added?.length;
  const planKey = view ? JSON.stringify(view.shots.find((s) => s.key === selected) ?? null) : '';

  // A still follows every change; the clip with sound only on request, since it takes a while
  useEffect(() => {
    if (!selected || !planKey || blocked) return;
    const ticket = ++stillRun.current;
    const timer = window.setTimeout(() => {
      setPreviewing('still');
      setPreviewError(null);
      previewShot(job.id, { key: selected, kind: 'still', edits: JSON.parse(draftKey), ...(at !== null ? { at } : {}) })
        .then((url) => { if (ticket === stillRun.current) setPreview({ url, kind: 'still' }); })
        .catch((err) => { if (ticket === stillRun.current) setPreviewError(err instanceof Error ? err.message : 'Không xem thử được'); })
        .finally(() => { if (ticket === stillRun.current) setPreviewing(null); });
    }, STILL_MS);
    return () => window.clearTimeout(timer);
  }, [job.id, selected, planKey, draftKey, at, blocked]);

  const playClip = () => {
    if (!selected) return;
    const ticket = ++stillRun.current;
    setPreviewing('clip');
    setPreviewError(null);
    previewShot(job.id, { key: selected, kind: 'clip', edits: draft })
      .then((url) => { if (ticket === stillRun.current) setPreview({ url, kind: 'clip' }); })
      .catch((err) => { if (ticket === stillRun.current) setPreviewError(err instanceof Error ? err.message : 'Không xem thử được'); })
      .finally(() => { if (ticket === stillRun.current) setPreviewing(null); });
  };

  const select = (key: string) => {
    setSelected(key);
    setAt(null);
  };

  const change = (key: string, patch: (edit: ShotEdit) => ShotEdit) =>
    setDraft((current) => {
      const next = { ...current };
      const edit = tidy(patch({ ...current[key], actors: { ...current[key]?.actors } }));
      if (edit) next[key] = edit;
      else delete next[key];
      return next;
    });
  const changeActor = (key: string, id: string, field: 'expression' | 'action', value: string | null) =>
    change(key, (edit) => ({ ...edit, actors: { ...edit.actors, [id]: { ...edit.actors?.[id], [field]: value } } }));
  const reset = (key: string) => setDraft((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });

  const save = (then?: 'render') => run(then ?? 'save', async () => {
    try {
      const kept = await saveShots(job.id, draft);
      setSaved(kept.edits);
      setDraft(kept.edits);
      setView(kept);
      if (then === 'render') onRendering(await jobAction(job.id, job.status === 'FAILED' ? 'retry' : 'rerender'));
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Không lưu được chỉnh sửa');
    }
  });

  const close = () => {
    if (!dirty) return onClose();
    setConfirm({ title: 'Bỏ chỉnh sửa chưa lưu?', message: 'Các thay đổi chưa lưu ở màn chỉnh cảnh sẽ mất.', confirmLabel: 'Đóng không lưu', action: onClose });
  };

  const header = (
    <div className="modal-header">
      <h3 style={{ margin: 0 }}>Chỉnh cảnh</h3>
      <button className="hamburger-btn" title="Đóng" onClick={close}><X size={18} /></button>
    </div>
  );

  if (!view) {
    return (
      <div className="modal-overlay">
        <div className="modal-content se-modal">
          {header}
          <div className="modal-body">
            {loadError ? <p className="lg-error">{loadError}</p> : <div className="loading-container"><span className="spinner"></span><span>Đang dựng danh sách cảnh...</span></div>}
          </div>
        </div>
      </div>
    );
  }

  const edit = shot ? draft[shot.key] : undefined;
  const name = (id: string) => view.options.cast.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="modal-overlay">
      <div className="modal-content se-modal">
        {header}
        <div className="modal-body">
          <p className="lg-meta" style={{ marginTop: 0 }}>
            Đổi bối cảnh, zoom, biểu cảm và hành động của từng cảnh. Giọng đọc giữ nguyên, nên xem thử không tốn credit; cần tạo lại video để áp dụng.
          </p>
          {readOnly && <p className="lg-error">Video đã đăng lên kênh, không chỉnh cảnh được nữa.</p>}
          {view.errors.length > 0 && (
            <div className="lg-error">
              {view.errors.map((error) => <div key={error}>{error}</div>)}
            </div>
          )}

          <div className="se-layout">
            <ol className="se-shots">
              {view.shots.map((item) => (
                <li key={item.key}>
                  <button className={`se-shot${item.key === selected ? ' active' : ''}`} onClick={() => select(item.key)}>
                    <span className="se-shot-title">
                      <span>{item.label}</span>
                      <span className="se-shot-time">{(item.frames / view.fps).toFixed(1)}s</span>
                    </span>
                    {item.text && <span className="se-shot-text">{item.text}</span>}
                    {(draft[item.key] || item.fall || item.shock) && (
                      <span className="se-shot-tags">
                        {draft[item.key] && <span className="badge badge-info">Đã chỉnh</span>}
                        {item.fall && <span className="badge">Ngã</span>}
                        {item.shock && <span className="badge">Sốc</span>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>

            <div className="se-stage">
              <div className="se-frame">
                {preview?.kind === 'clip'
                  ? <video key={preview.url} src={preview.url} controls autoPlay playsInline />
                  : preview && <img src={preview.url} alt={shot?.label ?? 'Xem thử'} />}
                {previewing && <span className="se-frame-busy"><Loader2 size={16} className="spin" /> {previewing === 'clip' ? 'Đang dựng đoạn có tiếng...' : 'Đang dựng ảnh...'}</span>}
              </div>
              {previewError && <p className="lg-error" style={{ marginTop: 8 }}>{previewError}</p>}
              {blocked && <p className="lg-error" style={{ marginTop: 8 }}>Sửa lỗi ở trên trước khi xem thử.</p>}
              {shot && (
                <div className="se-stage-controls">
                  <input
                    type="range" min={0} max={shot.frames - 1} value={at ?? Math.floor(shot.frames / 2)} aria-label="Vị trí trong cảnh"
                    onChange={(e) => setAt(Number(e.target.value))}
                  />
                  <button className="btn btn-secondary btn-sm" disabled={!!previewing || blocked} onClick={playClip}><Play size={14} /> Xem có tiếng</button>
                </div>
              )}
            </div>

            {shot && (
              <div className="se-panel">
                <div className="se-panel-head">
                  <span>{shot.label}</span>
                  {edit && !readOnly && <button className="btn btn-secondary btn-sm" onClick={() => reset(shot.key)}><Undo2 size={14} /> Bỏ chỉnh</button>}
                </div>
                <div className="form-group">
                  <label className="form-label">Bối cảnh</label>
                  <select className="form-input" disabled={readOnly} value={shot.backdrop} onChange={(e) => change(shot.key, (current) => ({ ...current, backdrop: e.target.value }))}>
                    {view.options.backdrops.map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}
                  </select>
                </div>
                <div className="se-row">
                  <div className="form-group">
                    <label className="form-label">Zoom</label>
                    <select className="form-input" disabled={readOnly} value={shot.zoom} onChange={(e) => change(shot.key, (current) => ({ ...current, zoom: Number(e.target.value) }))}>
                      {[...new Set([...view.options.zooms, shot.zoom])].sort().map((z) => <option key={z} value={z}>{z === 1 ? 'Toàn cảnh' : `×${z}`}</option>)}
                    </select>
                  </div>
                  <label className="se-check">
                    <input type="checkbox" disabled={readOnly} checked={shot.night} onChange={(e) => change(shot.key, (current) => ({ ...current, night: e.target.checked }))} />
                    Ban đêm
                  </label>
                </div>
                {shot.camera && view.options.cameraMoves && (
                <div className="se-row">
                  <div className="form-group">
                    <label className="form-label">Máy quay</label>
                    <select className="form-input" disabled={readOnly} value={shot.camera.move} onChange={(e) => change(shot.key, (current) => ({ ...current, camera: { ...current.camera, move: e.target.value } }))}>
                      {view.options.cameraMoves.map((m) => <option key={m.move} value={m.move}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nhìn vào</label>
                    <select className="form-input" disabled={readOnly} value={shot.camera.target} onChange={(e) => change(shot.key, (current) => ({ ...current, camera: { ...current.camera, target: e.target.value } }))}>
                      {view.options.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value="group">Cả nhóm</option>
                    </select>
                  </div>
                </div>
                )}
                {shot.actors.map((actor) => (
                  <div key={actor.id} className="se-actor">
                    <div className="se-actor-name">{name(actor.id)}{actor.falls && <span className="lg-meta" style={{ margin: 0 }}> · ngã khi nói xong</span>}</div>
                    <div className="se-row">
                      <select className="form-input" aria-label={`Biểu cảm của ${name(actor.id)}`} disabled={readOnly} value={actor.expression} onChange={(e) => changeActor(shot.key, actor.id, 'expression', e.target.value)}>
                        {view.options.expressions.map((x) => <option key={x.code} value={x.code} title={x.use}>{x.code} · {x.name}</option>)}
                      </select>
                      <select className="form-input" aria-label={`Hành động của ${name(actor.id)}`} disabled={readOnly} value={actor.action ?? ''} onChange={(e) => changeActor(shot.key, actor.id, 'action', e.target.value || null)}>
                        <option value="">Không hành động</option>
                        {view.options.actions.map((a) => <option key={a.action} value={a.action} title={a.use}>{a.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          {dirty && !readOnly && <button className="btn btn-secondary" disabled={!!busy} onClick={() => setDraft(saved)}><RotateCcw size={16} /> Hoàn tác</button>}
          {!readOnly && <button className="btn btn-secondary" disabled={!!busy || !dirty || blocked} onClick={() => save()}><Save size={16} /> Lưu</button>}
          {!readOnly && canRender && (
            <button className="btn btn-primary" disabled={!!busy || blocked || (!dirty && !Object.keys(saved).length)} onClick={() => save('render')}>
              {busy === 'render' ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} Lưu và tạo lại video
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
