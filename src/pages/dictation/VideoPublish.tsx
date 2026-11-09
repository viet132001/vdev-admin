import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, ExternalLink, Loader2, RotateCcw, Send } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { genreIdOf, isFacebookBusy, isPublishing, jobAction, listJobs, type LessonJob, type VideoGenre, type YouTubePrivacy } from './lessonWorker';
import { formatWhen, fromLocalInput, nextFreeSlot, toLocalInput } from './schedule';

const CAPTION_LIMIT = 2200;
const TITLE_LIMIT = 100;
const PRIVACY_LABEL: Record<YouTubePrivacy, string> = { public: 'Công khai', unlisted: 'Không công khai (ai có link mới xem được)', private: 'Riêng tư' };

// Every word the lesson teaches, once and in the order it comes up, so viewers can review them under the video
const vocabularyList = (job: LessonJob) => {
  const seen = new Set<string>();
  const items = (job.lesson?.sentences ?? [])
    .flatMap((s: any) => s.vocabularies ?? [])
    .filter((v: any) => v?.term?.trim() && !seen.has(v.term.trim().toLowerCase()) && seen.add(v.term.trim().toLowerCase()));
  return items.length ? ['Từ vựng trong bài:', ...items.map((v: any) => `• ${v.term.trim()}: ${String(v.meaning ?? '').trim()}`)].join('\n') : '';
};

const defaultCaption = (job: LessonJob, genre: VideoGenre) => [job.lesson?.description, vocabularyList(job), genre.hashtags].filter(Boolean).join('\n\n').slice(0, CAPTION_LIMIT);
const defaultTitle = (job: LessonJob, genre: VideoGenre) => `${job.lesson?.title ?? job.request.topic} | ${genre.titleSuffix}`.slice(0, TITLE_LIMIT);

interface VideoPublishProps {
  job: LessonJob;
  genre: VideoGenre;
  onManageChannels: () => void;
  onChange: (job: LessonJob) => void;
  onLinked: () => void;
  initialWhen?: Date; // a slot of the publishing plan this video was picked for: opens on scheduling it
  suggestedWhen?: Date; // the plan's slot shown for it elsewhere, so the time offered here is the same one
}

export const VideoPublish: React.FC<VideoPublishProps> = ({ job, genre, onManageChannels, onChange, onLinked, initialWhen, suggestedWhen }) => {
  const { busy, run } = useBusy();
  const facebookReady = genre.facebook;
  const youtubeReady = genre.youtube;
  const [title, setTitle] = useState(() => defaultTitle(job, genre));
  const [caption, setCaption] = useState(() => defaultCaption(job, genre));
  const [aiGenerated, setAiGenerated] = useState(true);
  const [privacy, setPrivacy] = useState<YouTubePrivacy>('unlisted');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [timing, setTiming] = useState<'now' | 'later'>(initialWhen ? 'later' : 'now');
  const [when, setWhen] = useState(() => { const preset = initialWhen ?? suggestedWhen; return preset ? toLocalInput(preset) : ''; });
  const [linkError, setLinkError] = useState<string | null>(null);
  const linking = useRef<string | null>(null);

  const facebook = job.facebook;
  const youtube = job.youtube;
  const lessonId: string | undefined = job.meta?.lessonId;
  const linkedUrl: string | undefined = job.meta?.videoLinkUrl;

  const act = (key: string, action: 'facebook' | 'youtube' | 'rerender', body: unknown) => run(key, async () => {
    try {
      onChange(await jobAction(job.id, action, body));
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Worker không làm được việc này');
    }
  });

  const shared = { title: title.trim(), description: caption.trim(), aiGenerated };
  const scheduledAt = timing === 'later' && when ? fromLocalInput(when) : null;
  const sendFacebook = (state: 'DRAFT' | 'PUBLISHED') => act(`fb-${state}`, 'facebook', { ...shared, state });
  const sendYouTube = () => act('youtube', 'youtube', { ...shared, privacy });
  const scheduleFacebook = () => act('fb-later', 'facebook', { ...shared, state: 'SCHEDULED', scheduledAt });
  const scheduleYouTube = () => act('yt-later', 'youtube', { ...shared, privacy: 'public', scheduledAt });
  const canScheduleFacebook = facebookReady && (!facebook || facebook.status === 'FAILED' || facebook.status === 'DRAFT');
  const canScheduleYouTube = youtubeReady && (!youtube || youtube.status === 'FAILED');
  const scheduleBoth = () => run('both-later', async () => {
    try {
      if (canScheduleFacebook) onChange(await jobAction(job.id, 'facebook', { ...shared, state: 'SCHEDULED', scheduledAt }));
      if (canScheduleYouTube) onChange(await jobAction(job.id, 'youtube', { ...shared, privacy: 'public', scheduledAt }));
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Không hẹn được');
    }
  });

  // Offers the next free slot of this lesson's category in the weekly plan
  const contentType = job.request?.contentType;
  useEffect(() => {
    // Another channel posting that day doesn't take this channel's slot
    listJobs().then((jobs) => setWhen((current) => current || toLocalInput(nextFreeSlot(contentType, jobs.filter((j) => j.id !== job.id && genreIdOf(j.request) === genre.id))))).catch(() => undefined);
  }, [contentType, job.id, genre.id]);

  const askFacebook = () => setConfirm({
    title: `Đăng công khai lên Facebook ${genre.channelName}?`,
    message: 'Mọi người sẽ thấy video này trên page ngay sau khi đăng. Muốn gỡ phải vào Facebook để xoá.',
    confirmLabel: 'Đăng công khai',
    action: async () => {
      setConfirm(null);
      await sendFacebook('PUBLISHED');
    }
  });

  const askYouTube = () => {
    if (privacy !== 'public') return sendYouTube();
    setConfirm({
      title: `Đăng công khai lên YouTube ${genre.channelName}?`,
      message: 'Mọi người sẽ tìm thấy video này trên kênh. Muốn gỡ phải vào YouTube Studio để xoá.',
      confirmLabel: 'Đăng công khai',
      action: async () => {
        setConfirm(null);
        await sendYouTube();
      }
    });
  };

  // The lesson is changed from here, on the user's own login; the worker never talks to VDEV
  const link = useCallback(async (url: string) => {
    if (!lessonId || linking.current === url) return;
    linking.current = url;
    setLinkError(null);
    try {
      await api.patch(`/api/dictation/lessons/${lessonId}`, { videoUrl: url });
      onChange(await jobAction(job.id, 'meta', { meta: { videoLinkUrl: url } }));
      onLinked();
    } catch (err) {
      setLinkError(getErrorMessage(err, 'Không cập nhật được link video vào bài học'));
    } finally {
      linking.current = null;
    }
  }, [lessonId, job.id, onChange, onLinked]);

  // A private video can't be played by learners, so that link never goes on the lesson by itself
  // A scheduled one is private only until its time, so its link goes on now: nobody has to be at the machine then
  const youtubeUrl = youtube?.status === 'DONE' && (youtube.privacy !== 'private' || youtube.publishAt) ? youtube.url : null;
  useEffect(() => {
    if (youtubeUrl && linkedUrl !== youtubeUrl) link(youtubeUrl);
  }, [youtubeUrl, linkedUrl, link]);

  const canEdit = (!facebook || facebook.status === 'FAILED') || (!youtube || youtube.status === 'FAILED');
  const canRerender = (!facebook || facebook.status === 'FAILED') && (!youtube || youtube.status === 'FAILED');

  return (
    <div className="lg-facebook">
      <p style={{ fontWeight: 600, margin: '0 0 10px' }}>Đăng video lên kênh {genre.channelName}</p>

      {canEdit && (
        <>
          <div className="form-group">
            <label className="form-label">Tiêu đề</label>
            <input maxLength={TITLE_LIMIT} className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nội dung bài đăng</label>
            <textarea rows={3} maxLength={CAPTION_LIMIT} className="form-input" style={{ resize: 'vertical' }} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <label className="flex align-center gap-2" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={aiGenerated} onChange={(e) => setAiGenerated(e.target.checked)} />
            Gắn nhãn nội dung do AI tạo
          </label>
        </>
      )}

      {(canScheduleFacebook || canScheduleYouTube) && (
        <div className="lg-publish-row">
          <p className="lg-publish-name">Thời điểm đăng</p>
          <div className="flex align-center gap-2" style={{ flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <label className="flex align-center gap-2" style={{ cursor: 'pointer' }}><input type="radio" checked={timing === 'now'} onChange={() => setTiming('now')} /> Đăng ngay</label>
            <label className="flex align-center gap-2" style={{ cursor: 'pointer' }}><input type="radio" checked={timing === 'later'} onChange={() => setTiming('later')} /> Hẹn giờ</label>
          </div>
          {timing === 'later' && (
            <>
              <input type="datetime-local" className="form-input" style={{ marginTop: 8 }} value={when} onChange={(e) => setWhen(e.target.value)} />
              <p className="lg-meta">Video được tải lên ngay. Đến giờ Facebook và YouTube tự đăng, máy tắt vẫn đăng được.</p>
              {canScheduleFacebook && canScheduleYouTube && <div className="lg-facebook-actions"><button className="btn btn-primary btn-sm" disabled={!!busy || !scheduledAt} onClick={scheduleBoth}><Send size={14} /> Hẹn đăng cả hai</button></div>}
            </>
          )}
        </div>
      )}

      <div className="lg-publish-row">
        <p className="lg-publish-name">Facebook</p>
        {facebook?.error && <p className="lg-error">{facebook.error}</p>}
        {!facebookReady && !facebook && <p className="lg-meta" style={{ margin: 0 }}>Kênh {genre.channelName} chưa kết nối page.</p>}
        {!facebookReady && !facebook && <div className="lg-facebook-actions"><button className="btn btn-secondary btn-sm" onClick={onManageChannels}>Quản lý kênh</button></div>}
        {facebook && isFacebookBusy(job) && (
          <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem' }}><Loader2 size={16} className="spin" />{facebook.status === 'UPLOADING' ? 'Đang tải video lên...' : 'Facebook đang xử lý video...'}</p>
        )}
        {facebook?.status === 'PUBLISHED' && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)' }}><CircleCheck size={16} /> Đã đăng công khai trên page.</p>}
        {facebook?.status === 'SUBMITTED' && <p className="lg-meta" style={{ margin: 0 }}>Facebook đã nhận video nhưng chưa xử lý xong. Hãy kiểm tra trên page, video này sẽ không được gửi lại từ đây.</p>}
        {facebook?.status === 'SCHEDULED' && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)' }}><CircleCheck size={16} /> Đã hẹn đăng lúc {formatWhen(facebook.scheduledAt)}.</p>}
        {facebook?.status === 'DRAFT' && <p className="lg-meta" style={{ margin: 0 }}>Đã lưu bản nháp, xem trong Meta Business Suite.</p>}
        <div className="lg-facebook-actions">
          {facebook?.permalink && <a className="btn btn-secondary btn-sm" href={facebook.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Xem trên Facebook</a>}
          {facebook?.permalink && !youtubeUrl && linkedUrl !== facebook.permalink && lessonId && <button className="btn btn-secondary btn-sm" onClick={() => link(facebook.permalink!)}>Dùng link này cho bài học</button>}
          {facebookReady && (!facebook || facebook.status === 'FAILED') && timing === 'now' && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => sendFacebook('DRAFT')}>Lưu nháp</button>}
          {canScheduleFacebook && timing === 'now' && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={askFacebook}><Send size={14} /> Đăng công khai</button>}
          {canScheduleFacebook && timing === 'later' && <button className="btn btn-secondary btn-sm" disabled={!!busy || !scheduledAt} onClick={scheduleFacebook}>Hẹn Facebook</button>}
        </div>
      </div>

      <div className="lg-publish-row">
        <p className="lg-publish-name">YouTube</p>
        {youtube?.error && <p className="lg-error">{youtube.error}</p>}
        {!youtubeReady && !youtube && <p className="lg-meta" style={{ margin: 0 }}>Kênh {genre.channelName} chưa đăng nhập YouTube.</p>}
        {!youtubeReady && !youtube && <div className="lg-facebook-actions"><button className="btn btn-secondary btn-sm" onClick={onManageChannels}>Quản lý kênh</button></div>}
        {youtube?.status === 'UPLOADING' && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem' }}><Loader2 size={16} className="spin" /> Đang tải video lên...</p>}
        {youtube?.status === 'DONE' && youtube.live === false && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)' }}><CircleCheck size={16} /> Đã hẹn công khai lúc {formatWhen(youtube.publishAt)}.</p>}
        {youtube?.status === 'DONE' && youtube.live !== false && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)' }}><CircleCheck size={16} /> Đã đăng ({youtube.privacy ? PRIVACY_LABEL[youtube.privacy] : ''}).</p>}
        {youtube?.status === 'DONE' && youtube.privacy !== youtube.requested && <p className="lg-error" style={{ marginTop: 8 }}>YouTube đặt video thành "{youtube.privacy ? PRIVACY_LABEL[youtube.privacy] : ''}", khác với lựa chọn của bạn. Vào YouTube Studio để kiểm tra.</p>}
        {canScheduleYouTube && timing === 'now' && (
          <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
            <label className="form-label">Chế độ hiển thị</label>
            <select className="form-input" value={privacy} onChange={(e) => setPrivacy(e.target.value as YouTubePrivacy)}>
              {(Object.keys(PRIVACY_LABEL) as YouTubePrivacy[]).map((value) => <option key={value} value={value}>{PRIVACY_LABEL[value]}</option>)}
            </select>
            {privacy === 'private' && <p className="lg-meta">Video riêng tư thì học viên không xem được, nên link sẽ không được gắn vào bài học.</p>}
          </div>
        )}
        <div className="lg-facebook-actions">
          {youtube?.url && <a className="btn btn-secondary btn-sm" href={youtube.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Xem trên YouTube</a>}
          {canScheduleYouTube && timing === 'now' && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={askYouTube}><Send size={14} /> Đăng YouTube</button>}
          {canScheduleYouTube && timing === 'later' && <button className="btn btn-secondary btn-sm" disabled={!!busy || !scheduledAt} onClick={scheduleYouTube}>Hẹn YouTube</button>}
        </div>
      </div>

      <div className="lg-publish-row">
        <p className="lg-publish-name">Link video của bài học</p>
        {linkedUrl && youtube?.live === false && <p className="lg-meta" style={{ marginTop: 0 }}>Học viên xem được từ {formatWhen(youtube.publishAt)}.</p>}
        {linkedUrl
          ? <p className="flex align-center gap-2 lg-meta" style={{ margin: 0, color: 'var(--success)' }}><CircleCheck size={16} /> {linkedUrl}</p>
          : <p className="lg-meta" style={{ margin: 0 }}>{lessonId ? 'Link sẽ tự cập nhật sau khi đăng YouTube.' : 'Bài này chưa lưu lên khoá học.'}</p>}
        {linkError && (
          <>
            <p className="lg-error" style={{ marginTop: 8 }}>{linkError}</p>
            {youtubeUrl && <div className="lg-facebook-actions"><button className="btn btn-secondary btn-sm" onClick={() => link(youtubeUrl)}><RotateCcw size={14} /> Thử lại</button></div>}
          </>
        )}
      </div>

      {canRerender && !isPublishing(job) && (
        <div className="lg-facebook-actions">
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('rerender', 'rerender', {})}><RotateCcw size={14} /> Tạo lại video</button>
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
