import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronRight, Layers, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { BATCH_ACTIVE } from './batchRunner';
import { defaultCaption, defaultTitle } from './lessonSave';
import { CONTENT_TYPES, formatWhen, jobWhen, planDays, type ContentType } from './schedule';
import { WORKER_COMMAND, batchOf, createBatch, jobAction, jobVideoUrl, listJobs, listPages, ownerOf, workerHealth, type CoursePage, type LessonJob, type VideoGenre } from './lessonWorker';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_ROWS = 5;
const MAX_ROWS = 10;
const POLL_MS = 3000;
const MAX_AHEAD_DAYS = 28; // Facebook takes up to 29 days ahead

const STEP_LABEL: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: 'Đang chờ', tone: 'info' },
  PLANNING: { label: 'Claude lập kế hoạch', tone: 'info' },
  PLAN_READY: { label: 'Claude lập kế hoạch', tone: 'info' },
  WRITING: { label: 'Claude soạn bài', tone: 'info' },
  LESSON_READY: { label: 'Đưa lên khoá học', tone: 'info' },
  RENDERING: { label: 'Tạo video', tone: 'info' },
  DONE: { label: 'Có video', tone: 'success' },
  FAILED: { label: 'Lỗi', tone: 'danger' },
  CANCELLED: { label: 'Đã huỷ', tone: 'warning' }
};

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const isScheduled = (job: LessonJob) => (!!job.facebook && job.facebook.status !== 'FAILED') || (!!job.youtube && job.youtube.status !== 'FAILED');

interface BatchGeneratorProps {
  course: { id: string; title: string; level: string };
  onOpenSettings: () => void;
  onManageChannels: () => void;
  onStarted: () => void; // the runner looks again: a new batch, or new posts to link
  onClose: () => void;
}

export const BatchGenerator: React.FC<BatchGeneratorProps> = ({ course, onOpenSettings, onManageChannels, onStarted, onClose }) => {
  const { busy, run } = useBusy();
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [page, setPage] = useState<CoursePage | null>(null);
  const [genres, setGenres] = useState<VideoGenre[]>([]);
  const [jobs, setJobs] = useState<LessonJob[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [rows, setRows] = useState(() => Array.from({ length: DEFAULT_ROWS }, () => ({ topic: '', note: '' })));
  const [form, setForm] = useState({ level: course.level || 'A2', contentType: 'conversation' as ContentType, words: 90, vocabulary: 5, note: '' });
  const [start, setStart] = useState(() => toDateInput(new Date()));
  const [time, setTime] = useState('');

  const load = useCallback(async () => {
    try {
      const [health, pages, list] = await Promise.all([workerHealth(), listPages(), listJobs()]);
      const found = pages.find((p) => p.courseId === course.id) ?? null;
      setGenres(health.genres ?? []);
      setPage(found);
      setTime((current) => current || found?.postTime || '19:30');
      setJobs(list);
      setState('online');
    } catch {
      setState('offline');
    }
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  // The course's batches, newest first; the one on screen is the newest unless another was picked
  const batches = [...new Map(jobs.filter((job) => batchOf(job) && job.meta?.courseId === course.id).map((job) => [batchOf(job)!.id, job])).values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((job) => ({ id: batchOf(job)!.id, createdAt: job.createdAt }));
  const shownId = batchId ?? batches[0]?.id ?? null;
  const batch = jobs.filter((job) => batchOf(job)?.id === shownId).sort((a, b) => batchOf(a)!.index - batchOf(b)!.index);
  const moving = batch.some((job) => BATCH_ACTIVE.includes(job.status));

  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => { listJobs().then(setJobs).catch(() => undefined); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [moving]);

  const genre = genres.find((g) => g.id === page?.genre);
  const pending = batch.filter((job) => job.status === 'DONE' && job.videoPath && !isScheduled(job));
  const owner = batch[0] ? ownerOf(batch[0]) : null;
  const plan = time ? planDays(pending, jobs.filter((job) => owner && ownerOf(job) === owner), start, time) : new Map<string, Date>();
  const tooFar = [...plan.values()].some((at) => at.getTime() - Date.now() > MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000);
  const target = batch[0]?.target;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      const items = rows.map((row) => ({ topic: row.topic.trim(), note: [row.note.trim(), form.note.trim()].filter(Boolean).join('\n') })).filter((row) => row.topic);
      if (!items.length) return alert('Nhập ít nhất một chủ đề');
      try {
        const format = CONTENT_TYPES[form.contentType].format;
        const created = await createBatch(course.id, items, {
          courseTitle: course.title, level: form.level, contentType: form.contentType, format: genre?.formats.includes(format) ? format : genre?.formats[0],
          words: form.words, vocabulary: form.vocabulary, video: true
        });
        setJobs(await listJobs());
        setBatchId(batchOf(created[0])!.id);
        setCreating(false);
        setRows(Array.from({ length: DEFAULT_ROWS }, () => ({ topic: '', note: '' })));
        onStarted();
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : 'Không tạo được các bài');
      }
    });
  };

  const act = (job: LessonJob, action: 'retry' | 'cancel' | 'meta', body: unknown = {}) => run(`${action}-${job.id}`, async () => {
    try {
      await jobAction(job.id, action, body);
      setJobs(await listJobs());
      onStarted();
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Không làm được việc này');
    }
  });

  // Both platforms, every video of the batch, each on its own day: one click after watching them
  const schedule = () => run('schedule', async () => {
    if (!genre) return;
    const failed: string[] = [];
    for (const job of pending) {
      const at = plan.get(job.id);
      if (!at) continue;
      const shared = { title: defaultTitle(job, genre), description: defaultCaption(job, genre), aiGenerated: true, scheduledAt: at.toISOString() };
      try {
        if (job.target?.facebook) await jobAction(job.id, 'facebook', { ...shared, state: 'SCHEDULED' });
        if (job.target?.youtube) await jobAction(job.id, 'youtube', { ...shared, privacy: 'public' });
      } catch (err) {
        failed.push(`${job.lesson?.title ?? job.request.topic}: ${err instanceof Error ? err.message : 'lỗi'}`);
      }
    }
    setJobs(await listJobs());
    onStarted();
    if (failed.length) alert(`Chưa hẹn được:\n${failed.join('\n')}`);
  });

  const askSchedule = () => setConfirm({
    title: `Lên lịch ${plan.size} video?`,
    message: `Mỗi video tự đăng công khai lên ${[target?.facebook && 'Facebook', target?.youtube && 'YouTube'].filter(Boolean).join(' và ')} của ${target?.name ?? ''} vào ngày đã xếp. Muốn huỷ phải vào Facebook hoặc YouTube Studio.`,
    confirmLabel: 'Duyệt và lên lịch',
    action: async () => {
      setConfirm(null);
      await schedule();
    }
  });

  const header = (
    <div className="modal-header">
      <h3 style={{ margin: 0 }}>Tạo nhiều bài: {course.title}</h3>
      <button className="hamburger-btn" title="Đóng" onClick={onClose}><X size={18} /></button>
    </div>
  );
  const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
        {header}
        <div className="modal-body">{body}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );

  if (state === 'loading') return shell(<div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>);
  if (state === 'offline') {
    return shell(
      <><p>Chưa kết nối được công cụ tạo bài trên máy này. Nếu chưa cài, chạy:</p><pre className="lg-command">{WORKER_COMMAND}</pre></>,
      <button className="btn btn-primary" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
    );
  }
  if (!page) {
    return shell(
      <p>Khoá học này chưa cài đặt page. Chọn thể loại, luật riêng, kênh đăng và giờ đăng trước, rồi quay lại tạo bài.</p>,
      <button className="btn btn-primary" onClick={onOpenSettings}><Settings size={16} /> Cài đặt page</button>
    );
  }

  // ---------- form ----------
  if (creating || !batch.length) {
    const filled = rows.filter((row) => row.topic.trim()).length;
    return (
      <div className="modal-overlay">
        <div className="modal-content lg-modal">
          {header}
          <form onSubmit={submit}>
            <div className="modal-body">
              <p className="lg-meta" style={{ marginTop: 0 }}>
                {genre?.label ?? page.genre} · đăng lên {page.channel.name} · bắt đầu từ tập {page.nextEpisode}. Claude tự lập kế hoạch rồi soạn lần lượt từng bài, mỗi bài nối tiếp bài trước; xong thì tự đưa lên khoá học và tạo video. Bạn chỉ cần xem video rồi duyệt một lần.
              </p>
              <div className="form-group">
                <label className="form-label">Chủ đề và yêu cầu của từng bài</label>
                <div className="bg-rows">
                  {rows.map((row, i) => (
                    <div key={i} className="bg-row">
                      <span className="bg-index">{i + 1}</span>
                      <input className="form-input" maxLength={150} placeholder="Chủ đề, VD: Lần đầu gặp đồng nghiệp mới" value={row.topic} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, topic: e.target.value } : r)))} />
                      <input className="form-input" maxLength={500} placeholder="Yêu cầu riêng (không bắt buộc)" value={row.note} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, note: e.target.value } : r)))} />
                      <button type="button" className="icon-btn" title="Bỏ dòng này" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                {rows.length < MAX_ROWS && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { topic: '', note: '' }])}><Plus size={14} /> Thêm bài</button>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Chuyên mục</label>
                  <select className="form-input" value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value as ContentType })}>
                    {(Object.keys(CONTENT_TYPES) as ContentType[]).map((key) => <option key={key} value={key}>{CONTENT_TYPES[key].label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Level</label>
                  <select className="form-input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Độ dài mỗi bài (số từ)</label>
                  <input type="number" required min={30} max={600} step={10} className="form-input" value={form.words} onChange={(e) => setForm({ ...form, words: Number(e.target.value) })} />
                  {form.words > 95 && <p className="lg-meta">Trên khoảng 95 từ, video có thể dài hơn 90 giây và Facebook Reels sẽ không nhận.</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Số từ vựng mỗi bài</label>
                  <input type="number" required min={0} max={40} className="form-input" value={form.vocabulary} onChange={(e) => setForm({ ...form, vocabulary: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Yêu cầu chung cho cả lô</label>
                <textarea rows={2} maxLength={500} className="form-input" style={{ resize: 'none' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              {batch.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Xem lô đang làm</button>}
              <button type="submit" className="btn btn-primary" disabled={!!busy || !filled}><Layers size={16} /> {busy ? 'Đang gửi...' : `Tạo ${filled} bài`}</button>
            </div>
          </form>
        </div>
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      </div>
    );
  }

  // ---------- progress, review, schedule ----------
  const done = batch.filter((job) => job.status === 'DONE').length;
  const live = batch.filter((job) => job.status !== 'CANCELLED');
  const ready = !moving && pending.length > 0;
  return shell(
    <>
      {batches.length > 1 && (
        <select className="form-input" style={{ marginBottom: 12 }} value={shownId ?? ''} onChange={(e) => setBatchId(e.target.value)}>
          {batches.map((b, i) => <option key={b.id} value={b.id}>{i === 0 ? 'Lô mới nhất' : `Lô tạo lúc ${formatWhen(b.createdAt)}`}</option>)}
        </select>
      )}
      <p className="lg-meta" style={{ marginTop: 0 }}>
        {done}/{live.length} bài đã có video · đăng lên {target?.name ?? page.channel.name}
        {moving && ' · trang này cần mở để bài được đưa lên khoá học'}
      </p>
      <div className="bg-jobs">
        {batch.map((job) => {
          const step = STEP_LABEL[job.status];
          const when = jobWhen(job);
          const planned = plan.get(job.id);
          const error = job.status === 'FAILED' ? job.error : job.meta?.saveError ?? job.meta?.linkError ?? job.facebook?.error ?? job.youtube?.error;
          return (
            <div key={job.id} className="bg-job">
              <div className="bg-job-head">
                <button type="button" className="bg-job-toggle" disabled={!job.videoPath} onClick={() => setOpenVideo(openVideo === job.id ? null : job.id)}>
                  {job.videoPath ? (openVideo === job.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
                  <span className="vl-title">{job.episode ? `Tập ${job.episode}: ` : ''}{job.lesson?.title ?? job.request.topic}</span>
                </button>
                <span className={`badge badge-${step.tone}`}>{step.label}</span>
              </div>
              <div className="vl-row-meta">
                {job.request.topic}
                {when && ` · Đã hẹn ${formatWhen(when.toISOString())}`}
                {!when && planned && ` · Sẽ đăng ${formatWhen(planned.toISOString())}`}
              </div>
              {error && <p className="lg-error" style={{ margin: '6px 0 0' }}>{error}</p>}
              <div className="flex gap-2" style={{ marginTop: 6 }}>
                {job.status === 'FAILED' && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'retry')}><RotateCcw size={14} /> Thử lại</button>}
                {job.meta?.saveError && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'meta', { meta: { saveError: null } })}><RotateCcw size={14} /> Lưu lại</button>}
                {job.meta?.linkError && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'meta', { meta: { linkError: null } })}><RotateCcw size={14} /> Gắn link lại</button>}
                {!['DONE', 'CANCELLED'].includes(job.status) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'cancel')}>Huỷ bài này</button>}
              </div>
              {openVideo === job.id && job.videoPath && <video className="lg-video" style={{ marginTop: 8 }} src={jobVideoUrl(job.id)} controls playsInline preload="metadata" />}
            </div>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div className="lg-facebook" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 600, margin: '0 0 10px' }}>Lịch đăng: mỗi ngày một video</p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Từ ngày</label>
              <input type="date" className="form-input" value={start} min={toDateInput(new Date())} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Giờ đăng</label>
              <input type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <p className="lg-meta">Ngày đã có video khác của kênh này được bỏ qua. Tiêu đề và nội dung bài đăng lấy theo mặc định, có danh sách từ vựng.</p>
          {(!target?.facebook || !target?.youtube) && (
            <p className="lg-meta">
              {target?.name} chưa kết nối {[!target?.facebook && 'Facebook', !target?.youtube && 'YouTube'].filter(Boolean).join(' và ')}{target?.facebook || target?.youtube ? ', phần này sẽ bỏ qua.' : '.'}{' '}
              <button type="button" className="lg-link" onClick={onManageChannels}>Quản lý kênh</button>
            </p>
          )}
          {tooFar && <p className="lg-error">Có ngày đăng xa hơn {MAX_AHEAD_DAYS} ngày, Facebook không nhận. Chọn ngày bắt đầu sớm hơn.</p>}
        </div>
      )}
    </>,
    <>
      <button className="btn btn-secondary" onClick={() => setCreating(true)}><Plus size={16} /> Tạo lô mới</button>
      <button className="btn btn-primary" disabled={!!busy || !ready || tooFar || !plan.size || (!target?.facebook && !target?.youtube)} onClick={askSchedule}>
        <CalendarCheck size={16} /> {moving ? `Chờ ${live.length - done} bài nữa` : !target?.facebook && !target?.youtube ? 'Chưa kết nối kênh để đăng' : `Duyệt và lên lịch ${plan.size} video`}
      </button>
    </>
  );
};
