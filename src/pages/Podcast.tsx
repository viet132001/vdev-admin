// One place to make podcast lessons: a topic goes in, the episode and its vocabulary reels come out, and they are
// watched and posted from the same card. The worker makes the videos; this page saves the lesson to its course.
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronDown, ChevronRight, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { useBusy } from './tasks/agent';
import { ChannelManager } from './dictation/ChannelManager';
import { VideoPublish } from './dictation/VideoPublish';
import { VocabClips } from './dictation/VocabClips';
import { batchBusy, useBatchRunner } from './dictation/batchRunner';
import { scheduleVideos } from './dictation/lessonSave';
import { formatWhen, jobWhen, planDays, toLocalInput } from './dictation/schedule';
import { WORKER_COMMAND, createJob, facebookTaken, genreIdOf, jobAction, jobVideoUrl, listJobs, listPages, ownerOf, workerHealth, type CoursePage, type LessonJob, type VideoGenre } from './dictation/lessonWorker';

const GENRE_ID = 'podcast';
const NEW_COURSE = '__new';
const NEW_COURSE_TITLE = 'Easy English Podcast';
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const MAX_REELS = 5;
const POLL_MS = 3000;
// Facebook takes posts up to 29 days ahead
const MAX_AHEAD_MS = 28 * 24 * 60 * 60 * 1000;

const isEpisode = (job: LessonJob) => genreIdOf(job.request) === GENRE_ID && !job.meta?.clipOf;
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const isPosted = (job: LessonJob) => (!!job.facebook && job.facebook.status !== 'FAILED') || (!!job.youtube && job.youtube.status !== 'FAILED');

const stepLabel = (job: LessonJob, clips: LessonJob[]) => {
  if (job.status === 'FAILED' || clips.some((clip) => clip.status === 'FAILED')) return { text: 'Lỗi', tone: 'danger' };
  if (job.meta?.saveError) return { text: 'Chưa lưu được lên khoá học', tone: 'danger' };
  if (job.status === 'PLANNING' || job.status === 'PLAN_READY' || job.status === 'QUEUED') return { text: 'Claude lập kế hoạch', tone: 'info' };
  if (job.status === 'WRITING') return { text: 'Claude soạn bài', tone: 'info' };
  if (job.status === 'LESSON_READY') return { text: 'Đang lưu lên khoá học', tone: 'info' };
  if (job.status === 'RENDERING') return { text: `Tạo video podcast${job.progress != null ? ` ${job.progress}%` : ''}`, tone: 'info' };
  if (job.status === 'CANCELLED') return { text: 'Đã huỷ', tone: 'warning' };
  const waiting = clips.filter((clip) => clip.status === 'RENDERING').length;
  if (waiting) return { text: `Tạo video từ vựng, còn ${waiting}`, tone: 'info' };
  return { text: `Xong: 1 podcast + ${clips.length} reel`, tone: 'success' };
};

interface EpisodeProps {
  job: LessonJob;
  clips: LessonJob[];
  jobs: LessonJob[];
  genre: VideoGenre;
  open: boolean;
  onToggle: () => void;
  onChange: () => void;
  onManageChannels: () => void;
  onConfirm: (state: ConfirmState | null) => void;
}

const Episode: React.FC<EpisodeProps> = ({ job, clips, jobs, genre, open, onToggle, onChange, onManageChannels, onConfirm }) => {
  const { busy, run } = useBusy();
  const [onPage, setOnPage] = useState<Date[]>([]);
  const [round, setRound] = useState(0);
  const step = stepLabel(job, clips);
  const videos = [job, ...clips];
  const finished = videos.every((video) => video.status === 'DONE' && video.videoPath);
  const pending = finished ? videos.filter((video) => !isPosted(video)) : [];
  const owner = ownerOf(job);
  const connected = !!(job.target?.facebook || job.target?.youtube);

  useEffect(() => {
    if (!open || !pending.length) return;
    let stale = false;
    facebookTaken(owner).then((days) => { if (!stale) setOnPage(days); });
    return () => { stale = true; };
  }, [open, owner, pending.length]);

  // The episode takes its slot first and its reels start that same day: they send people to an episode that is out
  const plan = new Map<string, Date>();
  if (open && pending.length) {
    const others = jobs.filter((other) => ownerOf(other) === owner);
    const today = toLocalInput(new Date()).slice(0, 10);
    const head = pending.includes(job) ? planDays([job], others, today, '19:30', new Date(), onPage) : new Map<string, Date>();
    const first = head.get(job.id) ?? jobWhen(job);
    const from = first ? toLocalInput(first).slice(0, 10) : today;
    const rest = planDays(pending.filter((video) => video !== job), others, from, '19:30', new Date(), onPage);
    for (const [id, at] of [...head, ...rest]) plan.set(id, at);
  }
  const tooFar = [...plan.values()].some((at) => at.getTime() - Date.now() > MAX_AHEAD_MS);

  const schedule = () => onConfirm({
    title: `Hẹn đăng ${plan.size} video?`,
    message: `Mỗi video tự đăng công khai lên ${[job.target?.facebook && 'Facebook', job.target?.youtube && 'YouTube'].filter(Boolean).join(' và ')} của ${job.target?.name ?? ''} vào giờ ghi trên trang. Muốn huỷ phải vào Facebook hoặc YouTube Studio.`,
    confirmLabel: 'Hẹn đăng',
    action: async () => {
      onConfirm(null);
      await run('schedule', async () => {
        const failed = await scheduleVideos(pending, plan, genre);
        setRound((n) => n + 1);
        onChange();
        if (failed.length) alert(`Chưa hẹn được:\n${failed.join('\n')}`);
      });
    }
  });

  const act = (action: 'retry' | 'cancel' | 'delete' | 'meta', target: LessonJob, body: unknown = {}) => run(`${action}-${target.id}`, async () => {
    try {
      await jobAction(target.id, action, body);
      onChange();
    } catch (err) {
      alert(message(err, 'Không làm được việc này'));
    }
  });

  const remove = () => onConfirm({
    title: 'Xoá tập này khỏi máy?',
    message: 'Xoá video podcast và các reel của nó trên máy này. Bài học trên khoá học và bài đã đăng vẫn còn.',
    confirmLabel: 'Xoá',
    action: async () => {
      onConfirm(null);
      await run('delete', async () => {
        try {
          for (const video of [...clips, job]) await jobAction(video.id, 'delete');
        } catch (err) {
          alert(message(err, 'Không xoá được'));
        }
        onChange();
      });
    }
  });

  const error = job.status === 'FAILED' ? job.error : job.meta?.saveError;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button type="button" className="vl-row-open" onClick={onToggle} style={{ padding: 0, cursor: 'pointer' }} aria-expanded={open}>
        <span className="vl-row-main">
          <span className="flex align-center gap-2" style={{ minWidth: 0 }}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="vl-title">{job.episode ? `Tập ${job.episode}: ` : ''}{job.lesson?.title ?? job.request.topic}</span>
          </span>
          <span className={`badge badge-${step.tone}`}>{step.text}</span>
        </span>
        <span className="lg-meta" style={{ display: 'block' }}>
          {job.request.courseTitle} · {job.request.level} · {job.request.aspect === '16:9' ? 'ngang 16:9' : 'dọc 9:16'} · {formatWhen(job.createdAt)}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {error && <p className="lg-error">{error}</p>}
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {job.status === 'FAILED' && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('retry', job)}><RotateCcw size={14} /> Thử lại</button>}
            {job.meta?.saveError && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('meta', job, { meta: { saveError: null } })}><RotateCcw size={14} /> Lưu lại</button>}
            {!['DONE', 'CANCELLED', 'FAILED'].includes(job.status) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('cancel', job)}>Huỷ</button>}
            {['DONE', 'CANCELLED', 'FAILED'].includes(job.status) && !clips.some((clip) => clip.status === 'RENDERING') && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={remove}><Trash2 size={14} /> Xoá</button>}
          </div>

          {pending.length > 0 && (
            <div className="lg-facebook">
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Đăng cả tập một lần</p>
              {pending.map((video) => (
                <p key={video.id} className="lg-meta">{plan.get(video.id) ? formatWhen(plan.get(video.id)!.toISOString()) : 'Chưa có giờ'} · {video === job ? 'Podcast' : video.lesson?.title}</p>
              ))}
              {tooFar && <p className="lg-error">Có video rơi xa hơn 28 ngày, Facebook không nhận. Đợi lịch bớt dày rồi hẹn.</p>}
              {!connected && <p className="lg-meta">Kênh chưa kết nối. <button type="button" className="lg-link" onClick={onManageChannels}>Quản lý kênh</button></p>}
              <div className="lg-facebook-actions">
                <button className="btn btn-primary btn-sm" disabled={!!busy || !connected || tooFar || !plan.size} onClick={schedule}><CalendarCheck size={14} /> Hẹn đăng {plan.size} video</button>
              </div>
            </div>
          )}

          {job.status === 'DONE' && job.videoPath && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Video podcast</p>
              <video className="lg-video" src={jobVideoUrl(job.id)} controls playsInline preload="none" />
              <VideoPublish key={`${job.id}-${round}`} job={job} genre={genre} onManageChannels={onManageChannels} onChange={onChange} onLinked={onChange} />
            </div>
          )}
          <VocabClips key={`${job.id}-${round}-${clips.length}`} parentId={job.id} genre={genre} onManageChannels={onManageChannels} onLinked={onChange} />
        </div>
      )}
    </div>
  );
};

export const Podcast: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { busy, run } = useBusy();
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [genre, setGenre] = useState<VideoGenre | null>(null);
  const [pages, setPages] = useState<CoursePage[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [jobs, setJobs] = useState<LessonJob[]>([]);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [form, setForm] = useState({ topic: '', courseId: '', courseTitle: NEW_COURSE_TITLE, level: 'A2', aspect: '9:16', words: 750, reels: 0, note: '' });
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    try {
      const [health, pageList, jobList] = await Promise.all([workerHealth(), listPages(), listJobs()]);
      const found: VideoGenre | null = (health.genres ?? []).find((g: VideoGenre) => g.id === GENRE_ID) ?? null;
      setGenre(found);
      setPages(pageList);
      setJobs(jobList);
      setState('online');
    } catch {
      setState('offline');
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.get('/api/dictation/sessions', { noCache: true });
      setSessions(Array.isArray(list) ? list : []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được khoá học'));
    }
  }, []);

  useEffect(() => { load(); loadSessions(); }, [load, loadSessions]);

  const kick = useBatchRunner(state === 'online', load, isEpisode);

  const episodes = jobs.filter((job) => isEpisode(job) && job.status !== 'CANCELLED');
  const clipsOf = (id: string) => jobs.filter((job) => job.meta?.clipOf === id);
  const moving = episodes.some(batchBusy) || jobs.some((job) => job.meta?.clipOf && job.status === 'RENDERING');
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => { listJobs().then(setJobs).catch(() => undefined); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [moving]);

  // A course set up as a page of another genre would turn the lesson into that genre
  const courses = sessions.filter((s) => (pages.find((p) => p.courseId === s.id)?.genre ?? GENRE_ID) === GENRE_ID);
  const defaultCourse = (courses.find((s) => pages.some((p) => p.courseId === s.id)) ?? courses.find((s) => s.title === NEW_COURSE_TITLE))?.id ?? NEW_COURSE;
  const courseId = form.courseId || defaultCourse;
  const limits = genre?.words ?? { min: 600, max: 1000 };
  const perReel = genre?.vocabPerVideo ?? 5;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const course = courseId === NEW_COURSE
          ? await api.post('/api/dictation/sessions', { title: form.courseTitle.trim(), description: null, level: form.level })
          : sessions.find((s) => s.id === courseId);
        if (courseId === NEW_COURSE) await loadSessions();
        const created = await createJob({
          topic: form.topic.trim(), courseTitle: course.title, courseId: course.id, level: form.level, contentType: 'conversation', format: 'dialogue',
          words: form.words, vocabulary: (form.reels || 3) * perReel, ...(form.reels ? {} : { vocabularyAuto: true }),
          video: true, aspect: form.aspect, videoStyle: GENRE_ID, genre: GENRE_ID, note: form.note.trim(), autoApprove: true
        });
        await jobAction(created.id, 'meta', { meta: { courseId: course.id } });
        update({ topic: '', note: '', courseId: course.id });
        setParams({ episode: created.id });
        await load();
        kick();
      } catch (err) {
        alert(message(err, 'Không gửi được yêu cầu'));
      }
    });
  };

  const changed = useCallback(() => { load(); kick(); }, [load, kick]);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: '1.4rem', margin: '0 0 4px' }}>Podcast</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>Nhập một chủ đề, nhận một tập podcast và các reel từ vựng của tập đó.</p>

      {state === 'loading' && <div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>}
      {state === 'offline' && (
        <div className="card">
          <p>Chưa kết nối được công cụ tạo bài trên máy này. Nếu chưa cài, mở Terminal và chạy:</p>
          <pre className="lg-command">{WORKER_COMMAND}</pre>
          <button className="btn btn-primary" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
        </div>
      )}
      {state === 'online' && !genre && <div className="card"><p style={{ margin: 0 }}>Công cụ tạo bài đang chạy bản cũ, chưa có Podcast. Cập nhật vdev-video rồi khởi động lại.</p></div>}

      {state === 'online' && genre && (
        <>
          <form className="card" onSubmit={submit} style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label className="form-label">Chủ đề <span className="form-required">*</span></label>
              <input required maxLength={150} className="form-input" placeholder="VD: Thói quen buổi sáng" value={form.topic} onChange={(e) => update({ topic: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Khoá học</label>
                <select className="form-input" value={courseId} onChange={(e) => update({ courseId: e.target.value })}>
                  {courses.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  <option value={NEW_COURSE}>Khoá học mới...</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Level</label>
                <select className="form-input" value={form.level} onChange={(e) => update({ level: e.target.value })}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Khung video podcast</label>
                <select className="form-input" value={form.aspect} onChange={(e) => update({ aspect: e.target.value })}>
                  <option value="9:16">Dọc 9:16 (bài sáng)</option>
                  <option value="16:9">Ngang 16:9 (bài tối)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reel từ vựng</label>
                <select className="form-input" value={form.reels} onChange={(e) => update({ reels: Number(e.target.value) })}>
                  <option value={0}>Tự động theo bài</option>
                  {Array.from({ length: MAX_REELS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} reel ({n * perReel} từ)</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Độ dài podcast (số từ)</label>
                <input type="number" required min={limits.min} max={limits.max} step={10} className="form-input" value={form.words} onChange={(e) => update({ words: Number(e.target.value) })} />
              </div>
            </div>
            {courseId === NEW_COURSE && (
              <div className="form-group">
                <label className="form-label">Tên khoá học mới <span className="form-required">*</span></label>
                <input required maxLength={200} className="form-input" value={form.courseTitle} onChange={(e) => update({ courseTitle: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Yêu cầu thêm</label>
              <textarea rows={2} maxLength={1000} className="form-input" style={{ resize: 'none' }} value={form.note} onChange={(e) => update({ note: e.target.value })} />
            </div>
            <p className="lg-meta" style={{ margin: '0 0 12px' }}>
              {form.reels ? `Mỗi reel khoảng 1 phút, ${perReel} từ.` : `Bài có nhiều cụm đáng học thì nhiều reel hơn, từ 1 đến ${MAX_REELS} reel, mỗi reel tối đa ${perReel} từ.`} Giữ trang này mở đến khi bài được lưu lên khoá học.
            </p>
            <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} {busy ? 'Đang gửi...' : 'Tạo podcast và reel'}</button>
          </form>

          {episodes.length === 0 && <p className="lg-meta">Chưa có tập nào.</p>}
          {episodes.map((job) => (
            <Episode key={job.id} job={job} clips={clipsOf(job.id)} jobs={jobs} genre={genre} open={params.get('episode') === job.id}
              onToggle={() => setParams(params.get('episode') === job.id ? {} : { episode: job.id })}
              onChange={changed} onManageChannels={() => setChannelsOpen(true)} onConfirm={setConfirm} />
          ))}
        </>
      )}

      {channelsOpen && <ChannelManager onClose={() => { setChannelsOpen(false); load(); }} />}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
