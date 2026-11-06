import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { Markdown } from '../tasks/PlanPanel';
import { WORKER_COMMAND, createJob, getJob, jobAction, jobVideoUrl, listJobs, workerHealth, type LessonJob } from './lessonWorker';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const NEW_COURSE = '__new';
const TASK_PROJECT_NAME = 'Bài học tiếng Anh';
const POLL_MS = 2000;
const WORDS = { min: 30, max: 600 };
const VOCABULARY = { min: 0, max: 40 };
const FINISHED = ['DONE', 'CANCELLED'];

const shortError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// Keeps lesson tasks together on one board instead of the inbox
const lessonProjectId = async () => {
  const projects = await api.get('/api/task-projects', { noCache: true });
  const found = (Array.isArray(projects) ? projects : []).find((p: any) => p.name === TASK_PROJECT_NAME);
  if (found) return found.id;
  return (await api.post('/api/task-projects', { name: TASK_PROJECT_NAME })).id;
};

const setTaskStatus = (id: string | undefined, status: string) =>
  id ? api.patch(`/api/tasks/${id}`, { status }) : Promise.resolve();

interface LessonGeneratorProps {
  sessions: any[];
  initialSessionId: string | null;
  onClose: () => void;
  onCreated: () => void;
  onOpenLesson: (sessionId: string, lessonId: string) => void;
}

export const LessonGenerator: React.FC<LessonGeneratorProps> = ({ sessions, initialSessionId, onClose, onCreated, onOpenLesson }) => {
  const { busy, run } = useBusy();
  const initial = sessions.find((s) => s.id === initialSessionId) ?? sessions[0] ?? null;
  const [workerState, setWorkerState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [voices, setVoices] = useState('');
  const [job, setJob] = useState<LessonJob | null>(null);
  const [feedback, setFeedback] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [form, setForm] = useState({
    courseId: initial?.id ?? NEW_COURSE,
    courseTitle: '',
    topic: '',
    level: initial?.level ?? 'A2',
    format: 'dialogue' as 'dialogue' | 'reading',
    words: 150,
    vocabulary: 10,
    video: true,
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
      const jobs = await listJobs();
      // Pick up work still in progress after the dialog or the page was closed
      setJob(jobs.find((j) => !FINISHED.includes(j.status)) ?? null);
      setWorkerState('online');
    } catch {
      setWorkerState('offline');
    }
  }, []);

  useEffect(() => { connect(); }, [connect]);

  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || jobStatus === 'DONE' || jobStatus === 'CANCELLED' || jobStatus === 'FAILED' || jobStatus === 'PLAN_READY') return;
    const timer = window.setInterval(() => {
      getJob(jobId).then(setJob).catch(() => setWorkerState('offline'));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [jobId, jobStatus]);

  // The lesson goes to VDEV from here, on the user's own login; the worker never sees a token
  const publish = useCallback(async (current: LessonJob) => {
    if (publishing.current) return;
    publishing.current = true;
    setPublishError(null);
    try {
      let lessonId: string | undefined = current.meta?.lessonId;
      if (!lessonId) {
        const { title, description } = current.lesson;
        const created = await api.post(`/api/dictation/sessions/${current.meta.courseId}/lessons`, { title, description });
        lessonId = created.id as string;
        // Saved right away: if the next step fails, a retry continues with this lesson instead of making another
        await jobAction(current.id, 'meta', { meta: { lessonId } });
      }
      if (!current.meta?.sentencesSaved) {
        await api.post(`/api/dictation/lessons/${lessonId}/sentences/bulk`, { items: current.lesson.sentences });
        await jobAction(current.id, 'meta', { meta: { sentencesSaved: true } });
      }
      await setTaskStatus(current.meta.writeTaskId, 'IN_REVIEW');
      await setTaskStatus(current.meta.videoTaskId, 'IN_PROGRESS');
      setJob(await jobAction(current.id, 'published', { meta: { lessonId } }));
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
          topic: form.topic.trim(), courseTitle: course.title, level: form.level, format: form.format,
          words: form.words, vocabulary: form.vocabulary, video: form.video, note: form.note.trim()
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

  const changeCourse = (courseId: string) => {
    const course = sessions.find((s) => s.id === courseId);
    update({ courseId, ...(course ? { level: course.level } : {}) });
  };

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
        <p>Chưa kết nối được công cụ tạo bài trên máy này. Mở Terminal và chạy:</p>
        <pre className="lg-command">{WORKER_COMMAND}</pre>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>Giữ cửa sổ Terminal mở trong lúc tạo bài. Nên dùng Chrome hoặc Edge, vì Safari chặn trang web gọi vào máy.</p>
      </>,
      <button className="btn btn-primary" onClick={connect}><RotateCcw size={16} /> Kết nối lại</button>
    );
  }

  if (job) {
    const steps = [
      { label: 'Claude phân tích và lập kế hoạch', done: !['PLANNING'].includes(job.status) && !!job.plan, active: job.status === 'PLANNING' },
      { label: 'Claude soạn bài', done: !!job.lesson, active: job.status === 'WRITING' },
      { label: 'Đưa bài lên khoá học', done: !!job.meta?.lessonId && job.status !== 'LESSON_READY', active: job.status === 'LESSON_READY' },
      ...(job.request.video ? [{ label: 'Tạo video trên máy', done: !!job.videoPath, active: job.status === 'RENDERING' }] : [])
    ];
    const failedLabel = job.status === 'FAILED' ? steps.find((s) => !s.done)?.label : null;

    return shell(
      <>
        <p style={{ fontWeight: 600, margin: 0 }}>{job.request.topic}</p>
        <p className="lg-meta">{job.episode ? `Tập ${job.episode} · ` : ''}{job.request.courseTitle} · {job.request.level} · {job.request.words} từ · {job.request.vocabulary} từ vựng</p>
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
              </>
            )}
            <p className="lg-meta">Task nằm ở bảng “{TASK_PROJECT_NAME}”, đang chờ bạn đánh dấu Done.</p>
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
        {job.status === 'FAILED' && <button className="btn btn-primary" disabled={!!busy} onClick={retry}><RotateCcw size={16} /> Thử lại</button>}
        {publishError && job.status === 'LESSON_READY' && <button className="btn btn-primary" onClick={() => publish(job)}><RotateCcw size={16} /> Lưu lại</button>}
        {job.status === 'DONE' && (
          <>
            <button className="btn btn-secondary" onClick={() => setJob(null)}>Tạo bài khác</button>
            {job.meta?.lessonId && <button className="btn btn-primary" onClick={() => onOpenLesson(job.meta.courseId, job.meta.lessonId)}>Mở bài học</button>}
          </>
        )}
      </>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
        {header}
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Chủ đề <span className="form-required">*</span></label>
              <input autoFocus required maxLength={150} className="form-input" placeholder="VD: Hai người bạn bàn kế hoạch cuối tuần" value={form.topic} onChange={(e) => update({ topic: e.target.value })} />
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
                <select className="form-input" value={form.format} onChange={(e) => update({ format: e.target.value as 'dialogue' | 'reading' })}>
                  <option value="dialogue">Hội thoại nam và nữ</option>
                  <option value="reading">Bài đọc</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Độ dài bài (số từ)</label>
                <input type="number" required min={WORDS.min} max={WORDS.max} step={10} className="form-input" value={form.words} onChange={(e) => update({ words: Number(e.target.value) })} />
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
