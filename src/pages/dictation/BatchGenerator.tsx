import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronRight, Layers, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { BATCH_ACTIVE } from './batchRunner';
import { defaultCaption, defaultTitle } from './lessonSave';
import { CONTENT_TYPES, formatWhen, jobWhen, planDays, type ContentType } from './schedule';
import { WORKER_COMMAND, batchOf, createBatch, facebookTaken, jobAction, jobVideoUrl, listJobs, listPages, ownerOf, workerHealth, type CoursePage, type LessonJob, type VideoGenre } from './lessonWorker';

// B1+ only exists for the worker's prompts (the roadmap); the BE level enum has no such value, and no session is created here
const LEVELS = ['A1', 'A2', 'B1', 'B1+', 'B2', 'C1', 'C2'];

// English4ME roadmap: stages in order, each with a ready note and a pool of topics (the first N are used)
const ROADMAP = [
  { level: 'A2', note: 'Chặng A2: câu 5 đến 8 từ, thì đơn và quá khứ đơn, chunk đời thường (stuck in traffic...). Khung Point và Example.',
    topics: ['Buổi sáng của tôi', 'Đi chợ cuối tuần', 'Kẹt xe giờ tan tầm', 'Gọi món ở quán cà phê', 'Hỏi đường', 'Làm quen hàng xóm', 'Một ngày ở văn phòng', 'Nấu bữa tối', 'Đi khám bệnh', 'Kế hoạch cuối tuần'] },
  { level: 'B1', note: 'Chặng B1: câu 7 đến 11 từ, có because / but / so, hiện tại hoàn thành, cụm động từ (figure out, make a decision). Bắt đầu khung PREP.',
    topics: ['Học cách quản lý thời gian', 'Một quyết định khó', 'Thói quen mới tôi đang tập', 'Chuyến đi đáng nhớ', 'Làm việc từ xa', 'Học một kỹ năng mới', 'Khi kế hoạch thay đổi', 'Bạn bè thay đổi theo thời gian', 'Tiền và những lựa chọn hằng ngày', 'Sức khoẻ và giấc ngủ'] },
  { level: 'B1+', note: 'Chặng B1+: câu 8 đến 12 từ, có mệnh đề phụ, câu điều kiện, bị động nhẹ, collocation. PREP đầy đủ, 1 đến 2 từ đệm (Well, let me think...).',
    topics: ['Nếu tôi có thể làm lại', 'Áp lực công việc', 'Mạng xã hội và thời gian', 'Học từ sai lầm', 'Thay đổi nghề nghiệp', 'Sống một mình hay cùng gia đình', 'Điều tôi mong ở tương lai', 'Giao tiếp với đồng nghiệp khó tính', 'Du lịch một mình', 'Khi nào nên nói không'] },
  { level: 'B2', note: 'Chặng B2: câu 9 đến 14 từ, ý trừu tượng, nêu quan điểm và nhượng bộ (To be honest, That said, What matters is). Từ đệm tự nhiên, có diễn đạt vòng khi quên từ.',
    topics: ['Thành công là gì', 'Công nghệ và các mối quan hệ', 'Cân bằng công việc và cuộc sống', 'Học cả đời', 'Áp lực phải hoàn hảo', 'Tiền có mua được hạnh phúc không', 'Văn hoá và định kiến', 'Trí tuệ nhân tạo và việc làm', 'Sống chậm trong thế giới nhanh', 'Điều thật sự quan trọng'] }
];
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
  const [roadmap, setRoadmap] = useState(false);
  const [counts, setCounts] = useState<number[]>(() => ROADMAP.map(() => 3));
  const [start, setStart] = useState(() => toDateInput(new Date()));
  const [time, setTime] = useState('');
  const [dailyTimes, setDailyTimes] = useState<Record<string, string>>({});
  const [onPage, setOnPage] = useState<Date[]>([]);

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
  const wordLimits = genre?.words ?? { min: 30, max: 600 };
  const genreWords = genre?.words?.default;
  useEffect(() => { if (genreWords) setForm((f) => ({ ...f, words: genreWords })); }, [genreWords]);
  const pending = batch.filter((job) => job.status === 'DONE' && job.videoPath && !isScheduled(job));
  const owner = batch[0] ? ownerOf(batch[0]) : null;
  // The batch takes no day the Page already posts on, booked by VDEV or by hand in Meta Business Suite
  useEffect(() => {
    if (!owner) return;
    let stale = false;
    facebookTaken(owner).then((days) => { if (!stale) setOnPage(days); });
    return () => { stale = true; };
  }, [owner]);
  const plan = time ? planDays(pending, jobs.filter((job) => owner && ownerOf(job) === owner), start, time, new Date(), onPage, dailyTimes) : new Map<string, Date>();
  // The hours of a genre that posts more than once a day, with the shape that goes out at each
  const daily = [...new Map(pending.filter((job) => job.request?.dailyTime).map((job) => [job.request.dailyTime as string, job.request.aspect as string])).entries()].sort(([x], [y]) => x.localeCompare(y));
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

  // Roadmap topics already made for this course (any batch, cancelled ones excepted) are skipped, so a new roadmap batch carries on
  const usedTopics = new Set(jobs.filter((job) => job.meta?.courseId === course.id && job.status !== 'CANCELLED').map((job) => `${job.request.level}|${job.request.topic}`));
  const freshTopics = ROADMAP.map((stage) => stage.topics.filter((topic) => !usedTopics.has(`${stage.level}|${topic}`)));
  const roadmapTotal = counts.reduce((sum, n, i) => sum + Math.min(n, freshTopics[i].length), 0);
  const submitRoadmap = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      const items = ROADMAP.flatMap((stage, i) => freshTopics[i].slice(0, counts[i]).map((topic) => ({ topic, level: stage.level, note: [stage.note, form.note.trim()].filter(Boolean).join('\n') })));
      if (!items.length) return alert('Chọn ít nhất một bài');
      try {
        const format = CONTENT_TYPES[form.contentType].format;
        const created = await createBatch(course.id, items, {
          courseTitle: course.title, level: ROADMAP[0].level, contentType: form.contentType, format: genre?.formats.includes(format) ? format : genre?.formats[0],
          words: form.words, vocabulary: form.vocabulary, video: true
        });
        setJobs(await listJobs());
        setBatchId(batchOf(created[0])!.id);
        setCreating(false);
        setRoadmap(false);
        onStarted();
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : 'Không tạo được các bài');
      }
    });
  };

  const act = (job: LessonJob, action: 'retry' | 'cancel' | 'meta' | 'resume' | 'rerender', body: unknown = {}) => run(`${action}-${job.id}`, async () => {
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

  // ---------- roadmap form ----------
  if (roadmap && (creating || !batch.length)) {
    return (
      <div className="modal-overlay">
        <div className="modal-content lg-modal">
          {header}
          <form onSubmit={submitRoadmap}>
            <div className="modal-body">
              <p className="lg-meta" style={{ marginTop: 0 }}>
                Một lô đi từ A2 đến B2, Claude soạn lần lượt từng bài theo thứ tự chặng. Mỗi chặng có chủ đề và yêu cầu gợi ý sẵn theo lộ trình của series; số bài là 0 thì bỏ chặng đó.
              </p>
              {ROADMAP.map((stage, i) => (
                <div key={stage.level} className="form-group">
                  <label className="form-label">{stage.level} · số bài</label>
                  <input type="number" min={0} max={freshTopics[i].length} className="form-input" value={Math.min(counts[i], freshTopics[i].length)} onChange={(e) => setCounts(counts.map((n, j) => (j === i ? Math.max(0, Math.min(freshTopics[i].length, Number(e.target.value) || 0)) : n)))} />
                  <p className="lg-meta">{stage.note}</p>
                  {freshTopics[i].length === 0
                    ? <p className="lg-meta">Đã dùng hết chủ đề gợi ý của chặng này, tạo lô thường để tự nhập thêm.</p>
                    : counts[i] > 0 && <p className="lg-meta">Chủ đề: {freshTopics[i].slice(0, counts[i]).join(' · ')}</p>}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Độ dài mỗi bài (số từ)</label>
                  <input type="number" required min={wordLimits.min} max={wordLimits.max} step={10} className="form-input" value={form.words} onChange={(e) => setForm({ ...form, words: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Yêu cầu chung thêm cho cả lô</label>
                <textarea rows={2} maxLength={300} className="form-input" style={{ resize: 'none' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRoadmap(false)}>Tạo lô thường</button>
              <button type="submit" className="btn btn-primary" disabled={!!busy || !roadmapTotal || roadmapTotal > 40}><Layers size={16} /> {busy ? 'Đang gửi...' : `Tạo ${roadmapTotal} bài theo lộ trình`}</button>
            </div>
          </form>
        </div>
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      </div>
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
                  <input type="number" required min={wordLimits.min} max={wordLimits.max} step={10} className="form-input" value={form.words} onChange={(e) => setForm({ ...form, words: Number(e.target.value) })} />
                  {genre?.words
                    ? <p className="lg-meta">Từ {wordLimits.min} đến {wordLimits.max} từ, video khoảng 5–10 phút.</p>
                    : form.words > 95 && <p className="lg-meta">Trên khoảng 95 từ, video có thể dài hơn 90 giây: Facebook sẽ đăng thành video thường thay vì Reels.</p>}
                </div>
                {!genre?.noVocabulary && (
                  <div className="form-group">
                    <label className="form-label">Số từ vựng mỗi bài</label>
                    <input type="number" required min={0} max={40} className="form-input" value={form.vocabulary} onChange={(e) => setForm({ ...form, vocabulary: Number(e.target.value) })} />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Yêu cầu chung cho cả lô</label>
                <textarea rows={2} maxLength={500} className="form-input" style={{ resize: 'none' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              {batch.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Xem lô đang làm</button>}
              <button type="button" className="btn btn-secondary" onClick={() => setRoadmap(true)}>Tạo theo lộ trình</button>
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
                <span className={`badge badge-${step.tone}`}>{step.label}{job.status === 'RENDERING' && job.progress != null ? ` ${job.progress}%` : ''}</span>
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
                {job.status === 'DONE' && job.videoPath && !isScheduled(job) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'rerender')}><RotateCcw size={14} /> Tạo lại video</button>}
                {job.status === 'CANCELLED' && job.lesson && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'resume')}><RotateCcw size={14} /> Tạo video lại</button>}
                {!['DONE', 'CANCELLED'].includes(job.status) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act(job, 'cancel')}>Huỷ bài này</button>}
              </div>
              {openVideo === job.id && job.videoPath && <video className="lg-video" style={{ marginTop: 8 }} src={jobVideoUrl(job.id)} controls playsInline preload="metadata" />}
            </div>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div className="lg-facebook" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 600, margin: '0 0 10px' }}>Lịch đăng: {daily.length ? 'mỗi ngày một bản dọc và một bản ngang' : 'mỗi ngày một video'}</p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Từ ngày</label>
              <input type="date" className="form-input" value={start} min={toDateInput(new Date())} onChange={(e) => setStart(e.target.value)} />
            </div>
            {daily.length ? daily.map(([own, aspect]) => (
              <div key={own} className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Giờ đăng bản {aspect === '9:16' ? 'dọc' : 'ngang'}</label>
                <input type="time" className="form-input" value={dailyTimes[own] ?? own} onChange={(e) => setDailyTimes({ ...dailyTimes, [own]: e.target.value })} />
              </div>
            )) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Giờ đăng</label>
                <input type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            )}
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
