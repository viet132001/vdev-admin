import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, List, PenLine, RotateCcw, Sparkles, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { FacebookOverview } from './FacebookOverview';
import {
  DEFAULT_GENRE, WORKER_COMMAND, cleanFacebook, createPost, facebookContent, genreIdOf, listJobs, listPages, listPosts, ownerOf, suggestPost, workerHealth,
  type CoursePage, type FacebookContent, type LessonJob, type PagePost, type PageReel, type PageScheduled, type VideoGenre
} from './lessonWorker';
import { formatDay, formatTime, jobWhen, sameDay, startOfWeek } from './schedule';
import { contentLabel, videoLinks } from './videoStatus';

const POST_LIMIT = 2000;
const VIEW_KEY = 'vdev_schedule_view';
const POST_TIME = '12:00';
const shortError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const facebookState = (job: LessonJob) => {
  const status = job.facebook?.status;
  if (status === 'PUBLISHED') return <span className="ok">Facebook: đã đăng</span>;
  if (status === 'SCHEDULED') return <span>Facebook: đã hẹn</span>;
  if (status === 'DRAFT') return <span>Facebook: bản nháp</span>;
  return status ? <span>Facebook: đang xử lý</span> : <span>Facebook: chưa đăng</span>;
};

const youtubeState = (job: LessonJob) => {
  const video = job.youtube;
  if (!video || video.status === 'FAILED') return null;
  if (video.status === 'UPLOADING') return <span>YouTube: đang tải</span>;
  return video.live === false ? <span>YouTube: đã hẹn</span> : <span className="ok">YouTube: đã đăng</span>;
};

// Only what is really out or booked: VDEV's videos and text posts, and what the Page has from elsewhere
type Entry =
  | { kind: 'video'; at: Date; job: LessonJob; reel: PageReel | null }
  | { kind: 'reel'; at: Date; reel: PageReel }
  | { kind: 'booked'; at: Date; item: PageScheduled }
  | { kind: 'post'; at: Date; post: PagePost };

const ExternalLinkTo: React.FC<{ url: string | null; label?: string }> = ({ url, label = 'Xem' }) =>
  url ? <> · <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {label}</a></> : null;

interface PublishScheduleProps {
  initialDate?: Date | null; // opens on the week of this day
  onPickVideo: (jobId: string, at?: Date) => void; // a video of the library
  onClose: () => void;
}

export const PublishSchedule: React.FC<PublishScheduleProps> = ({ initialDate, onPickVideo, onClose }) => {
  const { busy, run } = useBusy();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate ?? new Date()));
  const [genres, setGenres] = useState<VideoGenre[]>([]);
  const [pages, setPages] = useState<CoursePage[]>([]);
  const [genreId, setGenreId] = useState(DEFAULT_GENRE);
  const [allJobs, setJobs] = useState<LessonJob[]>([]);
  const [allPosts, setPosts] = useState<PagePost[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState<Date | null>(null); // the day a text post is being written for
  const [postTime, setPostTime] = useState(POST_TIME);
  const [text, setText] = useState('');
  const [facebook, setFacebook] = useState<{ owner: string; content: FacebookContent } | null>(null);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [facebookLoading, setFacebookLoading] = useState(false);
  // Board like Meta Business Suite by default; the choice is remembered on this browser only
  const [view, setView] = useState<'board' | 'list'>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; }
  });
  const pickView = (next: 'board' | 'list') => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private mode: just not remembered */ }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Posts Facebook no longer has (deleted there, or their Page is gone) are dropped before anything is shown
      await cleanFacebook().catch(() => undefined);
      const [health, nextJobs, nextPosts, nextPages] = await Promise.all([workerHealth(), listJobs(), listPosts(), listPages().catch(() => [])]);
      setGenres(health.genres ?? []);
      setPages(nextPages.filter((page) => page.ownPage));
      setJobs(nextJobs);
      setPosts(nextPosts);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reading the Page also updates the worker's jobs (a Reel moved, posted or deleted on Facebook), so jobs come after
  const loadFacebook = useCallback(async (owner: string, fresh = false) => {
    setFacebookLoading(true);
    setFacebookError(null);
    try {
      const content = await facebookContent(owner, fresh);
      setFacebook({ owner, content });
      setJobs(await listJobs());
    } catch (err) {
      setFacebook(null);
      setFacebookError(shortError(err, 'Không đọc được page Facebook'));
    } finally {
      setFacebookLoading(false);
    }
  }, []);

  const channelReady = genres.find((g) => g.id === genreId)?.facebook ?? pages.find((page) => page.channel.owner === genreId)?.channel.facebook ?? false;
  useEffect(() => {
    if (offline || loading) return;
    if (channelReady) loadFacebook(genreId);
    else { setFacebook(null); setFacebookError(null); }
  }, [genreId, channelReady, offline, loading, loadFacebook]);

  // A course with a page of its own is a channel too; text posts only exist for a genre's page for now
  const canPost = !(genreId.startsWith('course-') || genreId === 'comedy') && channelReady;
  const jobs = allJobs.filter((job) => ownerOf(job) === genreId);
  const posts = allPosts.filter((post) => genreIdOf(post) === genreId);
  const fromPage = facebook?.owner === genreId ? facebook.content : null;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    return day;
  });
  const weekEnd = weekDays[6];
  const inWeek = (at: Date) => weekDays.some((day) => sameDay(day, at));

  const ourPosts = new Set(posts.map((post) => post.postId).filter(Boolean));
  const entries: Entry[] = [
    ...jobs.flatMap((job): Entry[] => {
      const at = jobWhen(job);
      return at && inWeek(at) ? [{ kind: 'video', at, job, reel: fromPage?.reels.find((reel) => reel.jobId === job.id) ?? null }] : [];
    }),
    ...(fromPage?.reels ?? []).filter((reel) => !reel.jobId && reel.postedAt && inWeek(new Date(reel.postedAt)))
      .map((reel): Entry => ({ kind: 'reel', at: new Date(reel.postedAt!), reel })),
    ...(fromPage?.scheduled ?? []).filter((item) => !item.jobId && !ourPosts.has(item.postId) && inWeek(new Date(item.scheduledAt)))
      .map((item): Entry => ({ kind: 'booked', at: new Date(item.scheduledAt), item })),
    ...posts.filter((post) => inWeek(new Date(post.scheduledAt))).map((post): Entry => ({ kind: 'post', at: new Date(post.scheduledAt), post }))
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const videoCount = entries.filter((entry) => entry.kind === 'video' || entry.kind === 'reel' || (entry.kind === 'booked' && entry.item.videoId)).length;

  const moveWeek = (weeks: number) => setWeekStart((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + weeks * 7);
    return next;
  });

  const draft = () => run('suggest', async () => {
    try {
      setText((await suggestPost(text.trim(), genreId)).text);
    } catch (err) {
      alert(shortError(err, 'Claude chưa viết được bài'));
    }
  });

  const schedule = (day: Date) => run('schedule', async () => {
    const [hours, minutes] = postTime.split(':').map(Number);
    const at = new Date(day);
    at.setHours(hours, minutes, 0, 0);
    try {
      await createPost(text.trim(), at.toISOString(), genreId);
      setComposing(null);
      setText('');
      await load();
    } catch (err) {
      alert(shortError(err, 'Không hẹn được bài đăng'));
    }
  });

  const entryCard = (entry: Entry) => {
    const time = formatTime(entry.at);
    if (entry.kind === 'video') {
      const { job, reel } = entry;
      const youtube = youtubeState(job);
      return (
        <div className="sc-card-head">
          {reel?.picture && <img src={reel.picture} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div style={{ minWidth: 0 }}>
            <div className="sc-status" style={{ marginTop: 0 }}><strong>{time}</strong> · {contentLabel(job) || 'Video'}</div>
            <button className="lg-link sc-title" onClick={() => onPickVideo(job.id)}>{job.lesson?.title ?? job.request?.topic}</button>
            <div className="sc-status">
              {facebookState(job)}{youtube && <> · {youtube}</>}
              {reel?.views !== null && reel?.views !== undefined && <> · {reel.views.toLocaleString('vi-VN')} lượt xem</>}
              {videoLinks(job).map((link) => <ExternalLinkTo key={link.url} url={link.url} label={link.label} />)}
            </div>
          </div>
        </div>
      );
    }
    if (entry.kind === 'reel') {
      const { reel } = entry;
      return (
        <div className="sc-card-head">
          {reel.picture && <img src={reel.picture} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div style={{ minWidth: 0 }}>
            <div className="sc-status" style={{ marginTop: 0 }}><strong>{time}</strong> · Reel đăng ngoài VDEV</div>
            <div className="sc-title">{reel.title}</div>
            <div className="sc-status"><span className="ok">Đã đăng</span>{reel.views !== null && <> · {reel.views.toLocaleString('vi-VN')} lượt xem</>}<ExternalLinkTo url={reel.permalink} /></div>
          </div>
        </div>
      );
    }
    if (entry.kind === 'booked') {
      const { item } = entry;
      return (
        <>
          <div className="sc-status" style={{ marginTop: 0 }}><strong>{time}</strong> · {item.videoId ? 'Video' : 'Bài viết'} hẹn ngoài VDEV</div>
          <div className={item.videoId ? 'sc-title' : 'sc-text'}>{item.title ?? item.text?.split('\n')[0] ?? 'Bài đã lên lịch'}</div>
          <div className="sc-status">Đã hẹn trên Facebook<ExternalLinkTo url={item.permalink} /></div>
        </>
      );
    }
    const { post } = entry;
    return (
      <>
        <div className="sc-status" style={{ marginTop: 0 }}><strong>{time}</strong> · Bài viết</div>
        <div className="sc-text">{post.text}</div>
        <div className="sc-status">{post.status === 'PUBLISHED' ? <span className="ok">Đã đăng</span> : 'Đã hẹn'}<ExternalLinkTo url={post.permalink} /></div>
      </>
    );
  };

  const entryKey = (entry: Entry) => `${entry.kind}-${entry.kind === 'video' ? entry.job.id : entry.kind === 'reel' ? entry.reel.videoId : entry.kind === 'booked' ? entry.item.postId : entry.post.id}`;

  // A day's posts, the same in the list and on the board, and the writer for a text post on a day still ahead
  const dayContent = (day: Date) => {
    const items = entries.filter((entry) => sameDay(entry.at, day));
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 0, 0);
    const ahead = endOfDay.getTime() > Date.now();
    const open = !!composing && sameDay(composing, day);
    return (
      <>
        {items.length === 0 && !open && <div className="sc-empty" style={{ fontSize: '0.8rem' }}>Chưa có bài nào</div>}
        {items.map((entry) => <div key={entryKey(entry)} className="sc-card filled">{entryCard(entry)}</div>)}
        {open && (
          <div className="sc-card filled">
            <div className="flex align-center" style={{ gap: 6 }}>
              <span className="sc-status" style={{ marginTop: 0 }}>Bài viết lúc</span>
              <input type="time" className="form-input" style={{ width: 'auto', padding: '2px 6px' }} value={postTime} onChange={(e) => setPostTime(e.target.value)} />
            </div>
            <textarea rows={4} maxLength={POST_LIMIT} autoFocus className="form-input" style={{ marginTop: 6, resize: 'vertical' }} placeholder="Viết bài, hoặc gõ ý tưởng rồi để Claude viết giúp" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="lg-facebook-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setComposing(null)}>Hủy</button>
              <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={draft}><Sparkles size={14} /> {busy === 'suggest' ? 'Đang viết...' : 'Claude viết giúp'}</button>
              <button className="btn btn-primary btn-sm" disabled={!!busy || !text.trim() || !postTime} onClick={() => schedule(day)}>Hẹn đăng</button>
            </div>
          </div>
        )}
        {canPost && ahead && !open && (
          <button className="btn btn-secondary btn-sm sc-add" onClick={() => { setComposing(day); setText(''); setPostTime(POST_TIME); }}><PenLine size={14} /> Soạn bài</button>
        )}
      </>
    );
  };

  return (
    <div className="modal-overlay">
      <div className={`modal-content lg-modal${view === 'board' ? ' sc-modal-wide' : ''}`}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Lịch đăng</h3>
          <button className="hamburger-btn" title="Đóng" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {offline ? (
            <>
              <p>Lịch đăng lấy từ công cụ trên máy này. Nếu chưa cài, mở Terminal và chạy:</p>
              <pre className="lg-command">{WORKER_COMMAND}</pre>
              <button className="btn btn-primary mt-4" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
            </>
          ) : (
            <>
              {genres.length + pages.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Kênh</label>
                  <select className="form-input" value={genreId} onChange={(e) => { setGenreId(e.target.value); setComposing(null); }}>
                    {genres.map((g) => <option key={g.id} value={g.id}>{g.label}: {g.channelName}</option>)}
                    {pages.map((page) => <option key={page.courseId} value={page.channel.owner}>Khoá học: {page.title}</option>)}
                    <option value="comedy">Hài ngắn</option>
                  </select>
                </div>
              )}
              <div className="flex justify-between align-center" style={{ marginBottom: 12 }}>
                <button className="btn btn-secondary btn-sm" title="Tuần trước" onClick={() => moveWeek(-1)}><ChevronLeft size={16} /></button>
                <div className="flex align-center" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{formatDay(weekStart)} – {formatDay(weekEnd)}</strong>
                  <div className="sc-toggle" role="group" aria-label="Kiểu xem">
                    <button className={view === 'board' ? 'active' : ''} title="Bảng theo ngày" onClick={() => pickView('board')}><LayoutGrid size={14} /> Bảng</button>
                    <button className={view === 'list' ? 'active' : ''} title="Danh sách" onClick={() => pickView('list')}><List size={14} /> Danh sách</button>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" title="Tuần sau" onClick={() => moveWeek(1)}><ChevronRight size={16} /></button>
              </div>
              <div className="sc-summary">
                <span>Video trong tuần: <strong>{videoCount}</strong></span>
                <span>Bài viết: <strong>{entries.length - videoCount}</strong></span>
                {!channelReady && <span>Kênh này chưa kết nối page Facebook: chỉ hiện video đăng từ VDEV.</span>}
              </div>

              {(channelReady || facebookError) && !loading && (
                <FacebookOverview content={fromPage} error={facebookError} loading={facebookLoading} onRefresh={() => loadFacebook(genreId, true)} onOpenVideo={(jobId) => onPickVideo(jobId)} />
              )}

              {loading && <div className="loading-container"><span className="spinner"></span></div>}

              {!loading && view === 'list' && weekDays.map((day) => (
                <div key={day.toISOString()} className="sc-row">
                  <div className="sc-when">{formatDay(day)}</div>
                  <div className="sc-list-day">{dayContent(day)}</div>
                </div>
              ))}

              {!loading && view === 'board' && (
                <div className="sc-board">
                  {weekDays.map((day) => (
                    <div key={day.toISOString()} className={`sc-day${sameDay(day, new Date()) ? ' today' : ''}`}>
                      <div className="sc-day-head">
                        <span className="sc-day-name">{formatDay(day).split(' ')[0]}</span>
                        <span className="sc-day-num">{day.getDate()}</span>
                      </div>
                      {dayContent(day)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
