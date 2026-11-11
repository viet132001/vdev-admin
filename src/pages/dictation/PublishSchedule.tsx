import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, RotateCcw, Sparkles, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { FacebookOverview } from './FacebookOverview';
import { DEFAULT_GENRE, WORKER_COMMAND, createPost, facebookContent, genreIdOf, listJobs, listPages, listPosts, ownerOf, suggestPost, workerHealth, type CoursePage, type FacebookContent, type LessonJob, type PagePost, type PageScheduled, type VideoGenre } from './lessonWorker';
import { formatDay, formatTime, jobWhen, postOnDay, sameDay, slotLabel, startOfWeek, weekSlots, type ContentType, type Slot } from './schedule';
import { videoLinks, waitingFor } from './videoStatus';

const POST_LIMIT = 2000;
const shortError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const facebookState = (job: LessonJob) => {
  const status = job.facebook?.status;
  if (status === 'PUBLISHED') return <span className="ok">Facebook: đã đăng</span>;
  if (status === 'SCHEDULED') return <span>Facebook: đã hẹn</span>;
  if (status === 'FAILED') return <span className="bad">Facebook: lỗi</span>;
  if (status === 'DRAFT') return <span>Facebook: bản nháp</span>;
  return status ? <span>Facebook: đang xử lý</span> : <span>Facebook: chưa đăng</span>;
};

const youtubeState = (job: LessonJob) => {
  const video = job.youtube;
  if (!video) return <span>YouTube: chưa đăng</span>;
  if (video.status === 'FAILED') return <span className="bad">YouTube: lỗi</span>;
  if (video.status === 'UPLOADING') return <span>YouTube: đang tải</span>;
  return video.live === false ? <span>YouTube: đã hẹn</span> : <span className="ok">YouTube: đã đăng</span>;
};

// Something the Page will post that VDEV didn't schedule: shown so the slot isn't offered twice
const OutsideItem: React.FC<{ item: PageScheduled }> = ({ item }) => (
  <>
    <div className="sc-title" style={{ whiteSpace: 'pre-wrap' }}>{item.title ?? item.text?.split('\n')[0] ?? 'Bài đã lên lịch'}</div>
    <div className="sc-status">
      Hẹn trên Facebook lúc {formatTime(new Date(item.scheduledAt))} (ngoài VDEV)
      {item.permalink && <> · <a href={item.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Xem</a></>}
    </div>
  </>
);

interface PublishScheduleProps {
  initialDate?: Date | null; // opens on the week of this day
  onPickVideo: (jobId: string, at?: Date) => void; // a video of the library, for this slot when given
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
  const [composing, setComposing] = useState<Date | null>(null);
  const [text, setText] = useState('');
  const [facebook, setFacebook] = useState<{ owner: string; content: FacebookContent } | null>(null);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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

  // Reading the Page also updates the worker's jobs (a Reel moved or posted on Facebook), so the jobs are read after
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

  // Each channel has its own week: what goes out on one channel doesn't fill a slot on another
  // A course with a page of its own is a channel too; text posts only exist for a genre's page for now
  const isCourse = genreId.startsWith('course-') || genreId === 'comedy';
  const jobs = allJobs.filter((job) => ownerOf(job) === genreId);
  const posts = isCourse ? [] : allPosts.filter((post) => genreIdOf(post) === genreId);

  const moveWeek = (weeks: number) => setWeekStart((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + weeks * 7);
    return next;
  });

  const slots = weekSlots(weekStart);
  // Off-plan videos still count, so a slot's day is matched to whatever is really going out then
  const jobOn = (slot: Slot) => jobs.find((job) => {
    const when = jobWhen(job);
    return !!when && sameDay(when, slot.at);
  });
  const videoSlots = slots.filter((slot) => slot.kind !== 'post');
  const postSlots = slots.filter((slot) => slot.kind === 'post');
  // Scheduled on the Page but not by VDEV (made in Meta Business Suite, or a video this machine doesn't have)
  const fromPage = facebook?.owner === genreId ? facebook.content : null;
  const outside = (fromPage?.scheduled ?? []).filter((item) => !item.jobId);
  const outsideOn = (slot: Slot): PageScheduled | undefined => outside.find((item) => (slot.kind === 'post' ? !item.videoId : !!item.videoId) && sameDay(new Date(item.scheduledAt), slot.at));
  const viewsOf = (job: LessonJob) => fromPage?.reels.find((reel) => reel.jobId === job.id)?.views ?? null;
  const filledVideos = videoSlots.filter((slot) => jobOn(slot) || outsideOn(slot)).length;
  const filledPosts = postSlots.filter((slot) => postOnDay(posts, slot.at) || outsideOn(slot)).length;

  const draft = () => run('suggest', async () => {
    try {
      setText((await suggestPost(text.trim(), genreId)).text);
    } catch (err) {
      alert(shortError(err, 'Claude chưa viết được bài'));
    }
  });

  const schedule = (at: Date) => run('schedule', async () => {
    try {
      await createPost(text.trim(), at.toISOString(), genreId);
      setComposing(null);
      setText('');
      await load();
    } catch (err) {
      alert(shortError(err, 'Không hẹn được bài đăng'));
    }
  });

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
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
                <strong style={{ fontSize: '0.9rem' }}>{formatDay(weekStart)} – {formatDay(weekEnd)}</strong>
                <button className="btn btn-secondary btn-sm" title="Tuần sau" onClick={() => moveWeek(1)}><ChevronRight size={16} /></button>
              </div>
              <div className="sc-summary">
                <span>Video: <strong>{filledVideos}/{videoSlots.length}</strong></span>
                <span>Bài tương tác: <strong>{filledPosts}/{postSlots.length}</strong></span>
              </div>

              {(channelReady || facebookError) && !loading && (
                <FacebookOverview content={fromPage} error={facebookError} loading={facebookLoading} onRefresh={() => loadFacebook(genreId, true)} onOpenVideo={(jobId) => onPickVideo(jobId)} />
              )}

              {loading && <div className="loading-container"><span className="spinner"></span></div>}

              {!loading && slots.map((slot) => {
                const key = `${slot.kind}-${slot.at.toISOString()}`;
                const past = slot.at.getTime() < Date.now();
                if (slot.kind === 'post') {
                  const post = postOnDay(posts, slot.at);
                  const open = composing?.getTime() === slot.at.getTime();
                  return (
                    <div key={key} className="sc-row">
                      <div className="sc-when">{formatDay(slot.at)}<span>{formatTime(slot.at)}</span></div>
                      <div>
                        <div className="sc-status" style={{ marginTop: 0 }}>{slotLabel(slot.kind)}</div>
                        {post && (
                          <>
                            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.text}</div>
                            <div className="sc-status">
                              {post.status === 'PUBLISHED' ? <span className="ok">Đã đăng</span> : 'Đã hẹn'}
                              {post.permalink && <> · <a href={post.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Xem</a></>}
                            </div>
                          </>
                        )}
                        {!post && outsideOn(slot) && <OutsideItem item={outsideOn(slot)!} />}
                        {!post && !outsideOn(slot) && !open && (past || isCourse
                          ? <div className="sc-empty">{isCourse && !past ? 'Bài chữ chỉ có ở page của thể loại' : 'Không có bài'}</div>
                          : <button className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => { setComposing(slot.at); setText(''); }}>Soạn bài</button>)}
                        {!post && !outsideOn(slot) && open && (
                          <>
                            <textarea rows={4} maxLength={POST_LIMIT} autoFocus className="form-input" style={{ marginTop: 6, resize: 'vertical' }} placeholder="Viết bài, hoặc gõ ý tưởng rồi để Claude viết giúp" value={text} onChange={(e) => setText(e.target.value)} />
                            <div className="lg-facebook-actions">
                              <button className="btn btn-secondary btn-sm" onClick={() => setComposing(null)}>Hủy</button>
                              <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={draft}><Sparkles size={14} /> {busy === 'suggest' ? 'Đang viết...' : 'Claude viết giúp'}</button>
                              <button className="btn btn-primary btn-sm" disabled={!!busy || !text.trim()} onClick={() => schedule(slot.at)}>Hẹn đăng</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
                const job = jobOn(slot);
                const elsewhere = job ? undefined : outsideOn(slot);
                const views = job ? viewsOf(job) : null;
                // Videos made and not yet out, of this slot's category on this channel: one click to put it here
                const waiting = !job && !elsewhere && !past ? waitingFor(jobs, slot.kind as ContentType) : [];
                return (
                  <div key={key} className="sc-row">
                    <div className="sc-when">{formatDay(slot.at)}<span>{formatTime(slot.at)}</span></div>
                    <div>
                      <div className="sc-status" style={{ marginTop: 0 }}>{slotLabel(slot.kind)}</div>
                      {job ? (
                        <>
                          <button className="lg-link sc-title" onClick={() => onPickVideo(job.id)}>{job.lesson?.title ?? job.request?.topic}</button>
                          <div className="sc-status">
                            {facebookState(job)} · {youtubeState(job)}{views !== null && <> · {views.toLocaleString('vi-VN')} lượt xem</>}
                            {videoLinks(job).map((link) => <React.Fragment key={link.url}> · <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {link.label}</a></React.Fragment>)}
                          </div>
                        </>
                      ) : elsewhere ? (
                        <OutsideItem item={elsewhere} />
                      ) : (
                        <>
                          <div className="sc-empty">{past ? 'Không có video' : waiting.length ? 'Trống. Video chờ đăng của chuyên mục này:' : 'Trống: tạo bài rồi hẹn giờ vào ngày này'}</div>
                          {waiting.length > 0 && (
                            <div className="sc-pick">
                              {waiting.slice(0, 4).map((item) => <button key={item.id} className="btn btn-secondary btn-sm" onClick={() => onPickVideo(item.id, slot.at)}>{item.lesson?.title ?? item.request?.topic}</button>)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
