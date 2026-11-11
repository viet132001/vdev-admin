import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, Clapperboard, ExternalLink, PlayCircle, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { ShotEditor } from './ShotEditor';
import { VideoPublish } from './VideoPublish';
import { WORKER_COMMAND, genreForJob, genreIdOf, isPublishing, jobAction, jobVideoUrl, ownerOf, listJobs, workerHealth, type LessonJob, type VideoGenre } from './lessonWorker';
import { formatWhen } from './schedule';
import { VIDEO_FILTERS, VIDEO_STATE, contentLabel, isVideoJob, planVideos, videoLinks, videoState, type VideoState } from './videoStatus';

// One lesson's video: made on this machine (a job), or only known from the link on the lesson
interface Row {
  key: string;
  title: string;
  courseId: string | null;
  courseTitle: string;
  lessonId: string | null;
  lessonUrl: string | null;
  job: LessonJob | null;
  state: VideoState;
}

export interface LibraryFocus {
  jobId: string;
  at?: Date; // the plan's slot it was picked for
}

interface VideoLibraryProps {
  sessions: any[];
  focus: LibraryFocus | null;
  initialCourseId?: string; // opened from a course: its videos only, until another course is picked
  channelsVersion: number;
  onManageChannels: () => void;
  onOpenLesson: (sessionId: string, lessonId: string) => void;
  onOpenSchedule: (at: Date | null) => void;
  onChanged: () => void;
  onClose: () => void;
}

const PUBLISH_POLL_MS = 3000;

export const VideoLibrary: React.FC<VideoLibraryProps> = ({ sessions, focus, initialCourseId, channelsVersion, onManageChannels, onOpenLesson, onOpenSchedule, onChanged, onClose }) => {
  const [jobs, setJobs] = useState<LessonJob[]>([]);
  const [genres, setGenres] = useState<VideoGenre[]>([]);
  const [lessons, setLessons] = useState<{ courseId: string; courseTitle: string; lesson: any }[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [genreId, setGenreId] = useState<string>('all');
  const [courseId, setCourseId] = useState<string>(initialCourseId ?? 'all');
  const [filter, setFilter] = useState<(typeof VIDEO_FILTERS)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(focus?.jobId ?? null);
  const [editingShots, setEditingShots] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // The lessons come from VDEV, the videos on this machine from the worker: either can be there without the other
    const fromCourses = Promise.all(sessions.map(async (s) => {
      const detail = await api.get(`/api/dictation/sessions/${s.id}`, { noCache: true }).catch(() => null);
      return (detail?.lessons ?? []).map((lesson: any) => ({ courseId: s.id, courseTitle: s.title, lesson }));
    })).then((all) => all.flat());
    const fromWorker = Promise.all([workerHealth(), listJobs()]);
    const [courseResult, workerResult] = await Promise.allSettled([fromCourses, fromWorker]);
    if (courseResult.status === 'fulfilled') setLessons(courseResult.value);
    if (workerResult.status === 'fulfilled') {
      setGenres(workerResult.value[0].genres ?? []);
      setJobs(workerResult.value[1]);
      setOffline(false);
    } else {
      setOffline(true);
    }
    setLoading(false);
  }, [sessions]);

  useEffect(() => { load(); }, [load]);

  // A token saved in the channel manager changes which channels are ready, not the videos
  useEffect(() => {
    if (channelsVersion) workerHealth().then((health) => setGenres(health.genres ?? [])).catch(() => undefined);
  }, [channelsVersion]);

  // The worker uploads in the background: without asking again, a post that went through would spin here forever
  const publishing = jobs.some(isPublishing);
  useEffect(() => {
    if (!publishing) return;
    const timer = window.setInterval(() => { listJobs().then(setJobs).catch(() => undefined); }, PUBLISH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [publishing]);

  const videoJobs = jobs.filter(isVideoJob);
  const lessonById = new Map(lessons.map((item) => [item.lesson.id, item]));
  const madeHere = new Set(videoJobs.map((job) => job.meta?.lessonId).filter(Boolean));
  const rows: Row[] = [
    ...videoJobs.map((job): Row => {
      const known = job.meta?.lessonId ? lessonById.get(job.meta.lessonId) : undefined;
      return {
        key: job.id,
        title: known?.lesson.title ?? job.lesson?.title ?? job.request?.topic ?? 'Chưa có tên',
        courseId: job.meta?.courseId ?? known?.courseId ?? null,
        courseTitle: known?.courseTitle ?? job.request?.courseTitle ?? 'Chưa có khoá học',
        lessonId: job.meta?.lessonId ?? null,
        lessonUrl: known?.lesson.videoUrl ?? null,
        job,
        state: videoState(job)
      };
    }),
    // Lessons with a video from elsewhere, or from a machine that isn't this one
    ...lessons.filter((item) => item.lesson.videoUrl && !madeHere.has(item.lesson.id)).map((item): Row => ({
      key: `lesson-${item.lesson.id}`,
      title: item.lesson.title,
      courseId: item.courseId,
      courseTitle: item.courseTitle,
      lessonId: item.lesson.id,
      lessonUrl: item.lesson.videoUrl,
      job: null,
      state: 'LINKED'
    }))
  ];

  const states = VIDEO_FILTERS.find((f) => f.id === filter)!.states;
  const needle = query.trim().toLowerCase();
  // The counts follow the course, channel and search picked, so each one is what its button would show
  const matching = rows.filter((row) => (courseId === 'all' || row.courseId === courseId) && (genreId === 'all' || (row.job ? genreIdOf(row.job.request) === genreId : false))
    && (!needle || row.title.toLowerCase().includes(needle) || row.courseTitle.toLowerCase().includes(needle)));
  const shown = matching.filter((row) => !states.length || states.includes(row.state));
  const counts = Object.fromEntries(VIDEO_FILTERS.map((f) => [f.id, matching.filter((row) => !f.states.length || f.states.includes(row.state)).length]));
  const courses = [...new Set(shown.map((row) => row.courseTitle))];
  const plans = planVideos(videoJobs, ownerOf);

  const header = (title: string, back?: () => void) => (
    <div className="modal-header">
      <div className="flex align-center gap-2">
        {back && <button className="hamburger-btn" title="Quay lại danh sách" onClick={back}><ChevronLeft size={18} /></button>}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <button className="hamburger-btn" title="Đóng" onClick={onClose}><X size={18} /></button>
    </div>
  );

  const replaceJob = (next: LessonJob) => setJobs((current) => current.map((job) => (job.id === next.id ? next : job)));

  // Only the copy on this machine: the lesson stays on its course, and a post stays on Facebook or YouTube
  const askDelete = (job: LessonJob, title: string) => {
    const posted = (job.facebook && job.facebook.status !== 'FAILED') || (job.youtube && job.youtube.status !== 'FAILED');
    setConfirm({
      title: `Xoá video “${title}”?`,
      message: `File video trên máy bị xoá và video không còn trong danh sách này. Bài học trên khoá học vẫn giữ nguyên${posted ? '. Bài đã đăng hoặc đã hẹn trên Facebook / YouTube vẫn còn, muốn gỡ phải vào đó xoá' : ''}.`,
      confirmLabel: 'Xoá',
      action: async () => {
        setConfirm(null);
        try {
          await jobAction(job.id, 'delete');
          setJobs((current) => current.filter((other) => other.id !== job.id));
          setOpenId((current) => (current === job.id ? null : current));
        } catch (err) {
          alert(err instanceof Error && err.message ? err.message : 'Không xoá được video');
        }
      }
    });
  };

  // ---------- one video ----------
  const open = openId ? videoJobs.find((job) => job.id === openId) : undefined;
  if (open) {
    const genre = genreForJob(open, genres);
    const row = rows.find((r) => r.key === open.id)!;
    const plan = plans.get(open.id);
    const stickman = open.request?.videoStyle === 'stickman' && !!open.lesson && open.status === 'DONE' && !!open.videoPath;
    return (
      <div className="modal-overlay">
        <div className="modal-content lg-modal">
          {header(row.title, () => setOpenId(null))}
          <div className="modal-body">
            <p className="lg-meta" style={{ marginTop: 0 }}>
              {row.courseTitle}{genre ? ` · ${genre.label}` : ''}{open.episode ? ` · Tập ${open.episode}` : ''} · {contentLabel(open)}
            </p>
            <div className="vl-state-line">
              <span className={`badge badge-${VIDEO_STATE[row.state].tone || 'info'}`}>{VIDEO_STATE[row.state].label}</span>
              {plan && <span className="lg-meta" style={{ margin: 0 }}>{plan.suggested ? 'Khung trống gần nhất' : 'Lịch'}: {formatWhen(plan.at.toISOString())}</span>}
            </div>
            {open.status === 'FAILED' && <p className="lg-error" style={{ marginTop: 10 }}>{open.error}</p>}
            {open.videoPath && open.status === 'DONE' && (
              <>
                <video className="lg-video" style={{ marginTop: 12 }} src={jobVideoUrl(open.id)} controls playsInline preload="metadata" />
                <p className="lg-meta">Bản trên máy: <code>{open.videoPath}</code></p>
              </>
            )}
            <div className="lg-facebook-actions" style={{ justifyContent: 'flex-start' }}>
              {row.courseId && row.lessonId && <button className="btn btn-secondary btn-sm" onClick={() => onOpenLesson(row.courseId!, row.lessonId!)}><PlayCircle size={14} /> Mở bài học</button>}
              {plan && <button className="btn btn-secondary btn-sm" onClick={() => onOpenSchedule(plan.at)}><CalendarDays size={14} /> Xem trong lịch đăng</button>}
              {stickman && <button className="btn btn-secondary btn-sm" onClick={() => setEditingShots(true)}><Clapperboard size={14} /> Chỉnh cảnh</button>}
              <button className="btn btn-secondary btn-sm" onClick={() => askDelete(open, row.title)}><Trash2 size={14} /> Xoá video</button>
            </div>
            {open.status === 'DONE' && open.videoPath && genre && (
              <VideoPublish key={`${open.id}-${focus?.at?.getTime() ?? ''}`} job={open} genre={genre} initialWhen={open.id === focus?.jobId ? focus.at : undefined} suggestedWhen={plan?.suggested ? plan.at : undefined} onManageChannels={onManageChannels} onChange={replaceJob} onLinked={onChanged} />
            )}
          </div>
        </div>
        {editingShots && <ShotEditor job={open} onClose={() => setEditingShots(false)} onRendering={(next) => { setEditingShots(false); replaceJob(next); }} />}
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      </div>
    );
  }

  // ---------- all videos ----------
  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal vl-modal">
        {header('Quản lý video')}
        <div className="modal-body">
          {offline && (
            <div className="vl-notice">
              Chưa kết nối công cụ trên máy, nên chỉ thấy video đã gắn vào bài học. Video chỉ lưu trên máy hiện ra khi công cụ chạy: <code>{WORKER_COMMAND}</code>
              <div style={{ marginTop: 8 }}><button className="btn btn-secondary btn-sm" onClick={load}><RotateCcw size={14} /> Kết nối lại</button></div>
            </div>
          )}
          <div className="vl-toolbar">
            <div className="vl-search">
              <Search size={14} />
              <input className="form-input" placeholder="Tìm theo bài học hoặc khoá học" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {sessions.length > 1 && (
              <select className="form-input" aria-label="Khoá học" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="all">Mọi khoá học</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            )}
            {genres.length > 1 && (
              <select className="form-input" aria-label="Kênh" value={genreId} onChange={(e) => setGenreId(e.target.value)}>
                <option value="all">Mọi kênh</option>
                {genres.map((g) => <option key={g.id} value={g.id}>{g.label}: {g.channelName}</option>)}
              </select>
            )}
          </div>
          <div className="vl-filters">
            {VIDEO_FILTERS.map((f) => (
              <button key={f.id} className={`vl-filter${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label} <span>{counts[f.id]}</span></button>
            ))}
          </div>

          {loading && <div className="loading-container"><span className="spinner"></span></div>}
          {!loading && !shown.length && (
            <div className="sc-empty" style={{ padding: '24px 0', textAlign: 'center' }}>
              {matching.length ? 'Không có video nào khớp bộ lọc.' : rows.length ? 'Chưa có video nào ở đây. Chọn "Mọi khoá học" để xem video của khoá học khác.' : 'Chưa có video nào. Tạo bài bằng Claude và bật "Tạo video" để có video đầu tiên.'}
            </div>
          )}
          {!loading && courses.map((course) => (
            <section key={course} className="vl-course">
              <h4>{course}</h4>
              {shown.filter((row) => row.courseTitle === course).map((row) => {
                const plan = row.job ? plans.get(row.job.id) : undefined;
                const links = videoLinks(row.job, row.lessonUrl);
                const genre = row.job ? genreForJob(row.job, genres) : undefined;
                const body = (
                  <>
                    <div className="vl-row-main">
                      <span className="vl-title">{row.title}</span>
                      <span className={`badge badge-${VIDEO_STATE[row.state].tone || 'info'}`}>{VIDEO_STATE[row.state].label}</span>
                    </div>
                    <div className="vl-row-meta">
                      {[genre?.label, row.job?.episode ? `Tập ${row.job.episode}` : null, row.job ? contentLabel(row.job) : null].filter(Boolean).join(' · ')}
                      {plan && <span>{plan.suggested ? ' · Gợi ý đăng ' : ' · Lịch '}{formatWhen(plan.at.toISOString())}</span>}
                    </div>
                  </>
                );
                return (
                  <div key={row.key} className="vl-row">
                    <div className="vl-row-line">
                      {row.job ? <button className="vl-row-open" onClick={() => setOpenId(row.job!.id)}>{body}</button> : <div className="vl-row-open">{body}</div>}
                      {row.job && <button className="icon-btn vl-row-delete" title="Xoá video trên máy" onClick={() => askDelete(row.job!, row.title)}><Trash2 size={14} /></button>}
                    </div>
                    {links.length > 0 && (
                      <div className="vl-links">
                        {links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {link.label}</a>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
