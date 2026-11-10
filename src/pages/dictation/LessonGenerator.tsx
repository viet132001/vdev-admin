import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Clapperboard, Loader2, RotateCcw, Sparkles, Video, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { TASK_PROJECT_NAME, lessonProjectId, saveLessonToCourse, setTaskStatus } from './lessonSave';
import { useBusy } from '../tasks/agent';
import { Markdown } from '../tasks/PlanPanel';
import { CONTENT_TYPES, type ContentType } from './schedule';
import { ShotEditor } from './ShotEditor';
import { VideoPublish } from './VideoPublish';
import { DEFAULT_GENRE, WORKER_COMMAND, batchOf, createJob, isComedyJob, genreIdOf, getJob, isPublishing, jobAction, jobVideoUrl, listJobs, listPages, workerHealth, type CoursePage, type LessonJob, type VideoGenre } from './lessonWorker';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const NEW_COURSE = '__new';
const POLL_MS = 2000;
const WORDS = { min: 30, max: 600 };
const REELS_SAFE_WORDS = 110;
const VOCABULARY = { min: 0, max: 40 };
const FINISHED = ['DONE', 'CANCELLED'];
const RECENT_VIDEOS = 5;

const shortError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

interface LessonGeneratorProps {
  sessions: any[];
  initialSessionId: string | null;
  channelsVersion: number;
  onManageChannels: () => void;
  onClose: () => void;
  onCreated: () => void;
  onOpenLesson: (sessionId: string, lessonId: string) => void;
}

export const LessonGenerator: React.FC<LessonGeneratorProps> = ({ sessions, initialSessionId, channelsVersion, onManageChannels, onClose, onCreated, onOpenLesson }) => {
  const { busy, run } = useBusy();
  const initial = sessions.find((s) => s.id === initialSessionId) ?? sessions[0] ?? null;
  const [workerState, setWorkerState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [voices, setVoices] = useState('');
  const [genres, setGenres] = useState<VideoGenre[]>([]);
  const [pages, setPages] = useState<CoursePage[]>([]);
  const [recent, setRecent] = useState<LessonJob[]>([]);
  const [job, setJob] = useState<LessonJob | null>(null);
  const [feedback, setFeedback] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [editingShots, setEditingShots] = useState(false);
  const [form, setForm] = useState({
    courseId: initial?.id ?? NEW_COURSE,
    courseTitle: '',
    topic: '',
    level: initial?.level ?? 'A2',
    contentType: 'conversation' as ContentType,
    format: 'dialogue' as 'dialogue' | 'reading',
    words: 100,
    vocabulary: 10,
    video: true,
    aspect: '9:16' as '9:16' | '16:9',
    genre: DEFAULT_GENRE,
    videoStyle: 'scene',
    note: ''
  });
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // The publish effect below can re-fire while a save is running; one lesson must not be created twice
  const publishing = useRef(false);

  const connect = useCallback(async () => {
    setWorkerState('checking');
    try {
      const health = await workerHealth();
      setVoices(health.voices);
      setGenres(health.genres ?? []);
      setPages(await listPages().catch(() => []));
      const jobs = await listJobs();
      // Pick up work still in progress after the dialog or the page was closed. A batch has its own screen.
      setJob(jobs.find((j) => !batchOf(j) && !isComedyJob(j) && (!FINISHED.includes(j.status) || isPublishing(j))) ?? null);
      setRecent(jobs.filter((j) => j.status === 'DONE' && j.videoPath && !isComedyJob(j)).slice(0, RECENT_VIDEOS));
      setWorkerState('online');
    } catch {
      setWorkerState('offline');
    }
  }, []);

  useEffect(() => { connect(); }, [connect]);

  // Only the readiness changes after a token is saved: reconnecting here would drop the job on screen
  useEffect(() => {
    if (channelsVersion) workerHealth().then((health) => setGenres(health.genres ?? [])).catch(() => undefined);
  }, [channelsVersion]);

  const jobId = job?.id;
  const jobStatus = job?.status;
  const publishingNow = !!job && isPublishing(job);
  useEffect(() => {
    if (!jobId) return;
    if (!publishingNow && (jobStatus === 'DONE' || jobStatus === 'CANCELLED' || jobStatus === 'FAILED' || jobStatus === 'PLAN_READY')) return;
    const timer = window.setInterval(() => {
      getJob(jobId).then(setJob).catch(() => setWorkerState('offline'));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [jobId, jobStatus, publishingNow]);

  // The lesson goes to VDEV from here, on the user's own login; the worker never sees a token
  const publish = useCallback(async (current: LessonJob) => {
    if (publishing.current) return;
    publishing.current = true;
    setPublishError(null);
    try {
      setJob(await saveLessonToCourse(current));
      onCreated();
    } catch (err) {
      setPublishError(getErrorMessage(err, 'Không lưu được bài lên VDEV'));
    } finally {
      publishing.current = false;
    }
  }, [onCreated]);

  useEffect(() => {
    if (job?.status === 'LESSON_READY') publish(job);
  }, [job, publish]);

  const videoTaskId = job?.meta?.videoTaskId;
  useEffect(() => {
    if (jobStatus === 'DONE' && videoTaskId) setTaskStatus(videoTaskId, 'IN_REVIEW').catch(() => undefined);
  }, [jobStatus, videoTaskId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const isNew = form.courseId === NEW_COURSE;
        const course = isNew
          ? await api.post('/api/dictation/sessions', { title: form.courseTitle.trim(), description: null, level: form.level })
          : sessions.find((s) => s.id === form.courseId);
        if (isNew) onCreated();
        const created = await createJob({
          topic: form.topic.trim(), courseTitle: course.title, level: form.level, contentType: form.contentType, format: form.format,
          words: form.words, vocabulary: form.vocabulary, video: form.video, aspect: currentStyle?.aspects.includes(form.aspect) ? form.aspect : currentStyle?.aspects[0], videoStyle: form.videoStyle, genre: form.genre, note: form.note.trim(),
          courseId: course.id
        });
        setJob(await jobAction(created.id, 'meta', { meta: { courseId: course.id } }));
      } catch (err) {
        alert(shortError(err, 'Không gửi được yêu cầu cho Claude'));
      }
    });
  };

  const sendFeedback = () => run('feedback', async () => {
    if (!job || !feedback.trim()) return;
    try {
      setJob(await jobAction(job.id, 'feedback', { feedback: feedback.trim() }));
      setFeedback('');
    } catch (err) {
      alert(shortError(err, 'Không gửi được góp ý'));
    }
  });

  const approve = () => run('approve', async () => {
    if (!job) return;
    try {
      const projectId = await lessonProjectId();
      const { topic, video } = job.request;
      const writeTask = await api.post('/api/tasks', { title: `Soạn bài: ${topic}`, description: job.plan, projectId, status: 'IN_PROGRESS' });
      const videoTask = video ? await api.post('/api/tasks', { title: `Tạo video: ${topic}`, projectId, status: 'PENDING' }) : null;
      setJob(await jobAction(job.id, 'approve', { meta: { writeTaskId: writeTask.id, videoTaskId: videoTask?.id } }));
    } catch (err) {
      alert(getErrorMessage(err, 'Không tạo được task'));
    }
  });

  // The plan needs no review: it goes on to writing as soon as it is ready. Not in a batch, whose worker does it.
  const autoApproved = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.status !== 'PLAN_READY' || autoApproved.current === job.id) return;
    autoApproved.current = job.id;
    approve();
  });

  const retry = () => run('retry', async () => {
    if (!job) return;
    try {
      setJob(await jobAction(job.id, 'retry'));
    } catch (err) {
      alert(shortError(err, 'Không thử lại được'));
    }
  });

  const cancel = () => run('cancel', async () => {
    if (!job) return;
    try {
      await jobAction(job.id, 'cancel');
      setJob(null);
    } catch (err) {
      alert(shortError(err, 'Không hủy được'));
    }
  });

  const currentGenre = genres.find((g) => g.id === form.genre);
  const currentStyle = currentGenre?.styles.find((s) => s.id === form.videoStyle);
  const genreOfJob = job ? genres.find((g) => g.id === genreIdOf(job.request)) : undefined;

  // The genre decides which formats and styles exist, so a choice from another genre can't carry over
  const changeGenre = (id: string) => {
    const next = genres.find((g) => g.id === id);
    if (!next) return;
    update({ genre: id, videoStyle: next.styles[0].id, format: next.formats.includes(form.format) ? form.format : next.formats[0] });
  };

  // A course set up as a page decides the genre and the style of its videos
  const pageOf = (courseId: string) => pages.find((p) => p.courseId === courseId);
  const changeCourse = (courseId: string) => {
    const course = sessions.find((s) => s.id === courseId);
    const page = pageOf(courseId);
    update({ courseId, ...(course ? { level: course.level } : {}), ...(page ? { genre: page.genre, videoStyle: page.videoStyle } : {}) });
  };
  const coursePage = pageOf(form.courseId);
  const pagesLoaded = pages.length;
  const initialCourse = initial?.id;
  useEffect(() => {
    const page = pages.find((p) => p.courseId === initialCourse);
    if (page) setForm((f) => (f.courseId === page.courseId ? { ...f, genre: page.genre, videoStyle: page.videoStyle } : f));
  }, [pagesLoaded, pages, initialCourse]);

  const header = (
    <div className="modal-header">
      <h3 style={{ margin: 0 }}>Tạo bài bằng Claude</h3>
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
    </div>
  );

  if (workerState === 'checking') return shell(<div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>);

  if (workerState === 'offline') {
    return shell(
      <>
        <p>Chưa kết nối được công cụ tạo bài trên máy này. Nếu chưa cài, mở Terminal và chạy:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>Chỉ cần chạy một lần: từ đó công cụ tự bật khi cần và tự tắt khi rảnh. Nên dùng Chrome hoặc Edge, vì Safari chặn trang web gọi vào máy.</p>
      </>,
      <button className="btn btn-primary" onClick={connect}><RotateCcw size={16} /> Kết nối lại</button>
    );
  }

  // A worker still running the old code has no genres until it restarts
  if (!genres.length) {
    return shell(
      <p>Công cụ tạo bài trên máy đang chạy bản cũ. Chờ nó tự tắt sau khoảng 10 phút hoặc chạy lại <code>pnpm worker</code>, rồi kết nối lại.</p>,
      <button className="btn btn-primary" onClick={connect}><RotateCcw size={16} /> Kết nối lại</button>
    );
  }

  if (job) {
    const steps = [
      { label: 'Claude phân tích và lập kế hoạch', done: !['PLANNING'].includes(job.status) && !!job.plan, active: job.status === 'PLANNING' },
      { label: 'Claude soạn bài', done: !!job.lesson, active: job.status === 'WRITING' },
      { label: 'Đưa bài lên khoá học', done: !!job.meta?.lessonId && job.status !== 'LESSON_READY', active: job.status === 'LESSON_READY' },
      ...(job.request.video ? [
        { label: 'Tạo video trên máy', done: !!job.videoPath && job.status !== 'RENDERING', active: job.status === 'RENDERING' },
        { label: 'Đăng lên Facebook', done: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'SUBMITTED'].includes(job.facebook?.status ?? ''), active: job.facebook?.status === 'UPLOADING' || job.facebook?.status === 'PROCESSING' },
        { label: 'Đăng lên YouTube', done: job.youtube?.status === 'DONE', active: job.youtube?.status === 'UPLOADING' },
        { label: 'Cập nhật link video vào bài học', done: !!job.meta?.videoLinkUrl, active: false }
      ] : [])
    ];
    const failedLabel = job.status === 'FAILED' ? steps.find((s) => !s.done)?.label : null;
    // Only Stick Talk has a shot list; a failed render may have been stopped by its check
    const editable = job.request.videoStyle === 'stickman' && !!job.lesson && ((job.status === 'DONE' && !!job.videoPath) || (job.status === 'FAILED' && job.failedStage === 'render'));

    const page = shell(
      <>
        <p style={{ fontWeight: 600, margin: 0 }}>{job.request.topic}</p>
        <p className="lg-meta">{genreOfJob ? `${genreOfJob.label} · ` : ''}{job.episode ? `Tập ${job.episode} · ` : ''}{job.request.courseTitle} · {job.request.level} · {job.request.words} từ · {job.request.vocabulary} từ vựng</p>
        <ol className="lg-steps">
          {steps.map((step) => (
            <li key={step.label} className={step.done ? 'done' : step.active ? 'active' : step.label === failedLabel ? 'failed' : ''}>
              {step.done ? <CircleCheck size={16} /> : step.active ? <Loader2 size={16} className="spin" /> : step.label === failedLabel ? <CircleX size={16} /> : <span className="lg-dot" />}
              {step.label}
            </li>
          ))}
        </ol>

        {job.status === 'FAILED' && <p className="lg-error">{job.error}</p>}
        {publishError && <p className="lg-error">{publishError}</p>}

        {job.status === 'PLAN_READY' && (
          <>
            <div className="lg-plan"><Markdown text={job.plan ?? ''} /></div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Góp ý nếu muốn Claude lập lại</label>
              <textarea rows={2} maxLength={1000} className="form-input" style={{ resize: 'none' }} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </div>
          </>
        )}

        {job.status === 'DONE' && (
          <>
            {job.videoPath && (
              <>
                <video className="lg-video" src={jobVideoUrl(job.id)} controls playsInline preload="metadata" />
                <p className="lg-meta">Video chỉ lưu trên máy này: <code>{job.videoPath}</code></p>
                {editable && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEditingShots(true)}><Clapperboard size={14} /> Chỉnh cảnh</button>}
              </>
            )}
            <p className="lg-meta">Task nằm ở bảng “{TASK_PROJECT_NAME}”, đang chờ bạn đánh dấu Done.</p>
            {job.videoPath && genreOfJob && <VideoPublish key={job.id} job={job} genre={genreOfJob} onManageChannels={onManageChannels} onChange={setJob} onLinked={onCreated} />}
          </>
        )}
      </>,
      <>
        {!['DONE'].includes(job.status) && <button className="btn btn-secondary" disabled={!!busy} onClick={cancel}>Hủy bài này</button>}
        {job.status === 'PLAN_READY' && (
          <>
            <button className="btn btn-secondary" disabled={!!busy || !feedback.trim()} onClick={sendFeedback}>Lập lại theo góp ý</button>
            <button className="btn btn-primary" disabled={!!busy} onClick={approve}><CircleCheck size={16} /> Duyệt và tạo bài</button>
          </>
        )}
        {job.status === 'FAILED' && editable && <button className="btn btn-secondary" disabled={!!busy} onClick={() => setEditingShots(true)}><Clapperboard size={16} /> Chỉnh cảnh</button>}
        {job.status === 'FAILED' && <button className="btn btn-primary" disabled={!!busy} onClick={retry}><RotateCcw size={16} /> Thử lại</button>}
        {publishError && job.status === 'LESSON_READY' && <button className="btn btn-primary" onClick={() => publish(job)}><RotateCcw size={16} /> Lưu lại</button>}
        {job.status === 'DONE' && (
          <>
            <button className="btn btn-secondary" onClick={() => connect()}>Tạo bài khác</button>
            {job.meta?.lessonId && <button className="btn btn-primary" onClick={() => onOpenLesson(job.meta.courseId, job.meta.lessonId)}>Mở bài học</button>}
          </>
        )}
      </>
    );
    return (
      <>
        {page}
        {editingShots && editable && <ShotEditor job={job} onClose={() => setEditingShots(false)} onRendering={(next) => { setEditingShots(false); setJob(next); }} />}
      </>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
        {header}
        <form onSubmit={submit}>
          <div className="modal-body">
            {recent.length > 0 && (
              <div className="form-group">
                <label className="form-label">Video đã tạo</label>
                <div className="lg-recent">
                  {recent.map((item) => (
                    <button key={item.id} type="button" className="lg-recent-item" onClick={() => setJob(item)}>
                      <Video size={14} />
                      <span>{item.lesson?.title ?? item.request.topic}</span>
                      <span className="lg-meta" style={{ margin: 0 }}>
                        {[item.facebook?.status === 'PUBLISHED' ? 'Facebook' : item.facebook?.status === 'SCHEDULED' ? 'Hẹn Facebook' : item.facebook?.status === 'DRAFT' ? 'Nháp Facebook' : null, item.youtube?.status === 'DONE' ? (item.youtube.live === false ? 'Hẹn YouTube' : 'YouTube') : null].filter(Boolean).join(' · ') || 'Chưa đăng'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Thể loại</label>
              <select className="form-input" value={form.genre} disabled={!!coursePage} onChange={(e) => changeGenre(e.target.value)}>
                {genres.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              {coursePage && <p className="lg-meta">Khoá học này đã cài đặt page: thể loại, kiểu video và luật lấy theo page, đăng lên {coursePage.channel.name}, tập tiếp theo là tập {coursePage.nextEpisode}.</p>}
              {currentGenre && !coursePage && (
                <p className="lg-meta">
                  {currentGenre.description}. Đăng lên kênh {currentGenre.channelName}.
                  {(!currentGenre.facebook || !currentGenre.youtube) && ` Kênh này chưa kết nối ${[!currentGenre.facebook && 'Facebook', !currentGenre.youtube && 'YouTube'].filter(Boolean).join(' và ')}, vẫn tạo được video nhưng chưa đăng được.`}
                  {' '}<button type="button" className="lg-link" onClick={onManageChannels}>Quản lý kênh</button>
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Chủ đề <span className="form-required">*</span></label>
              <input autoFocus required maxLength={150} className="form-input" placeholder="VD: Hai người bạn bàn kế hoạch cuối tuần" value={form.topic} onChange={(e) => update({ topic: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Chuyên mục</label>
              <select className="form-input" value={form.contentType} onChange={(e) => {
                const contentType = e.target.value as ContentType;
                const suggested = CONTENT_TYPES[contentType].format;
                update({ contentType, format: !currentGenre || currentGenre.formats.includes(suggested) ? suggested : currentGenre.formats[0] });
              }}>
                {(Object.keys(CONTENT_TYPES) as ContentType[]).map((key) => <option key={key} value={key}>{CONTENT_TYPES[key].label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Khoá học</label>
              <select className="form-input" value={form.courseId} onChange={(e) => changeCourse(e.target.value)}>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                <option value={NEW_COURSE}>Khoá học mới...</option>
              </select>
            </div>
            {form.courseId === NEW_COURSE && (
              <div className="form-group">
                <label className="form-label">Tên khoá học mới <span className="form-required">*</span></label>
                <input required maxLength={200} className="form-input" value={form.courseTitle} onChange={(e) => update({ courseTitle: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Level</label>
                <select className="form-input" value={form.level} onChange={(e) => update({ level: e.target.value })}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Hình thức</label>
                <select className="form-input" value={form.format} disabled={(currentGenre?.formats.length ?? 0) < 2} onChange={(e) => update({ format: e.target.value as 'dialogue' | 'reading' })}>
                  {currentGenre?.formats.map((format) => <option key={format} value={format}>{format === 'dialogue' ? 'Hội thoại nam và nữ' : currentGenre.narrated ? 'Một người đọc (shadowing)' : 'Bài đọc'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Độ dài bài (số từ)</label>
                <input type="number" required min={WORDS.min} max={WORDS.max} step={10} className="form-input" value={form.words} onChange={(e) => update({ words: Number(e.target.value) })} />
                {form.video && form.words > REELS_SAFE_WORDS && <p className="lg-meta">Video có thể dài hơn 90 giây, Facebook Reels sẽ không nhận. YouTube vẫn đăng được.</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Số từ vựng</label>
                <input type="number" required min={VOCABULARY.min} max={VOCABULARY.max} className="form-input" value={form.vocabulary} onChange={(e) => update({ vocabulary: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Yêu cầu thêm</label>
              <textarea rows={2} maxLength={1000} className="form-input" style={{ resize: 'none' }} placeholder="VD: Nhấn mạnh thì hiện tại hoàn thành, giọng vui vẻ" value={form.note} onChange={(e) => update({ note: e.target.value })} />
            </div>
            <label className="flex align-center gap-2" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.video} onChange={(e) => update({ video: e.target.checked })} />
              Tạo video, lưu trên máy này (giọng đọc: {voices})
            </label>
            {form.video && (currentGenre?.styles.length ?? 0) > 1 && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Kiểu video</label>
                <select className="form-input" value={form.videoStyle} disabled={!!coursePage} onChange={(e) => update({ videoStyle: e.target.value })}>
                  {currentGenre?.styles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                </select>
              </div>
            )}
            {form.video && (currentStyle?.aspects.length ?? 0) > 1 && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Khung hình video</label>
                <select className="form-input" value={form.aspect} onChange={(e) => update({ aspect: e.target.value as '9:16' | '16:9' })}>
                  {currentStyle?.aspects.map((aspect) => <option key={aspect} value={aspect}>{aspect === '9:16' ? 'Dọc 9:16' : 'Ngang 16:9'}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={!!busy}><Sparkles size={16} /> {busy ? 'Đang gửi...' : 'Gửi cho Claude'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
