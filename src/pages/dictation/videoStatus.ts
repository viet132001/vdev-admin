// Where a lesson's video is: still being made, only on this machine, on its way to a channel, or out there with a link.
// One answer per video, so the library, the schedule and the lesson all say the same thing.
import { isFacebookBusy, type LessonJob } from './lessonWorker';
import { CONTENT_TYPES, jobWhen, nextFreeSlot, type ContentType } from './schedule';

export type VideoState = 'MAKING' | 'FAILED' | 'LOCAL' | 'UPLOADING' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'LINKED';

export const VIDEO_STATE: Record<VideoState, { label: string; tone: 'info' | 'success' | 'warning' | 'danger' | '' }> = {
  MAKING: { label: 'Đang tạo', tone: '' },
  FAILED: { label: 'Lỗi', tone: 'danger' },
  LOCAL: { label: 'Chỉ trên máy', tone: 'warning' },
  UPLOADING: { label: 'Đang tải lên', tone: '' },
  DRAFT: { label: 'Bản nháp Facebook', tone: 'info' },
  SCHEDULED: { label: 'Đã hẹn', tone: 'info' },
  PUBLISHED: { label: 'Đã đăng', tone: 'success' },
  LINKED: { label: 'Đã gắn link', tone: 'success' } // a lesson with a video but no job on this machine
};

export const VIDEO_FILTERS: { id: 'all' | 'waiting' | 'scheduled' | 'published' | 'problem'; label: string; states: VideoState[] }[] = [
  { id: 'all', label: 'Tất cả', states: [] },
  { id: 'waiting', label: 'Chờ đăng', states: ['LOCAL', 'DRAFT'] },
  { id: 'scheduled', label: 'Đã hẹn', states: ['SCHEDULED', 'UPLOADING'] },
  { id: 'published', label: 'Đã đăng', states: ['PUBLISHED', 'LINKED'] },
  { id: 'problem', label: 'Đang tạo / lỗi', states: ['MAKING', 'FAILED'] }
];

const isMadeVideo = (job: LessonJob) => job.status === 'DONE' && !!job.videoPath;

export const videoState = (job: LessonJob): VideoState => {
  if (job.status === 'FAILED') return 'FAILED';
  if (!isMadeVideo(job)) return 'MAKING';
  const { facebook, youtube } = job;
  if (facebook?.status === 'PUBLISHED' || (youtube?.status === 'DONE' && youtube.live !== false)) return 'PUBLISHED';
  if (facebook?.status === 'SCHEDULED' || (youtube?.status === 'DONE' && youtube.live === false)) return 'SCHEDULED';
  if (isFacebookBusy(job) || youtube?.status === 'UPLOADING' || facebook?.status === 'SUBMITTED') return 'UPLOADING';
  if (facebook?.status === 'DRAFT') return 'DRAFT';
  return 'LOCAL';
};

// Every place the video can be watched, most public first
export const videoLinks = (job: LessonJob | null, lessonUrl?: string | null) => {
  const links: { label: string; url: string }[] = [];
  if (job?.youtube?.url) links.push({ label: 'YouTube', url: job.youtube.url });
  if (job?.facebook?.permalink) links.push({ label: 'Facebook', url: job.facebook.permalink });
  const linked = job?.meta?.videoLinkUrl ?? lessonUrl;
  if (linked && !links.some((link) => link.url === linked)) links.push({ label: 'Link trong bài học', url: linked });
  return links;
};

// Jobs the worker made a video for: lessons written without one have nothing to manage here
export const isVideoJob = (job: LessonJob) => !!job.request?.video && job.status !== 'CANCELLED';

// A video waiting to go out, of this category and channel: what an empty slot of the plan can take
export const waitingFor = (jobs: LessonJob[], contentType: ContentType) =>
  jobs.filter((job) => isVideoJob(job) && (job.request?.contentType ?? 'conversation') === contentType && (videoState(job) === 'LOCAL' || videoState(job) === 'DRAFT'));

export const contentLabel = (job: LessonJob) => CONTENT_TYPES[(job.request?.contentType ?? 'conversation') as ContentType]?.label ?? '';

export interface Planned {
  at: Date;
  suggested: boolean; // not booked yet: the plan's free slot this video would take
}

// When each video goes out, or when the plan would put it. Waiting videos take the free slots of their category on
// their channel in the order they were made, one each, so the suggestions can be followed as they are.
export const planVideos = (jobs: LessonJob[], channelOf: (job: LessonJob) => string, now = new Date()) => {
  const plan = new Map<string, Planned>();
  const promised = new Map<string, Date[]>();
  const waiting = jobs.filter((job) => videoState(job) === 'LOCAL' || videoState(job) === 'DRAFT').sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  for (const job of jobs) {
    const when = jobWhen(job);
    if (when) plan.set(job.id, { at: when, suggested: false });
  }
  for (const job of waiting) {
    const channel = channelOf(job);
    const taken = promised.get(channel) ?? [];
    // A job from before categories is a conversation everywhere else on this page, so it takes that slot here too
    const at = nextFreeSlot(job.request?.contentType ?? 'conversation', jobs.filter((other) => channelOf(other) === channel), now, taken);
    promised.set(channel, [...taken, at]);
    plan.set(job.id, { at, suggested: true });
  }
  return plan;
};
