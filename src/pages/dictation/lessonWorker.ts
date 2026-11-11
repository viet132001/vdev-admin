// Client for the local helper of vdev-video (`pnpm worker`): it asks Claude and renders video on this machine.
// Not the VDEV BE, so it doesn't go through services/api: no token is ever sent here.
export const WORKER_URL = 'http://localhost:4599';
export const WORKER_COMMAND = 'cd vdev-video && pnpm worker:install';

export type LessonJobStatus = 'QUEUED' | 'PLANNING' | 'PLAN_READY' | 'WRITING' | 'LESSON_READY' | 'RENDERING' | 'DONE' | 'FAILED' | 'CANCELLED';

export type FacebookStatus = 'UPLOADING' | 'PROCESSING' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'SUBMITTED' | 'FAILED';

export interface FacebookPost {
  status: FacebookStatus;
  state: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';
  videoId: string | null;
  permalink: string | null;
  error: string | null;
  scheduledAt?: string | null;
  postedAt?: string | null;
}

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';

export interface YouTubePost {
  status: 'UPLOADING' | 'DONE' | 'FAILED';
  requested: YouTubePrivacy;
  privacy: YouTubePrivacy | null;
  videoId: string | null;
  url: string | null;
  error: string | null;
  publishAt?: string | null;
  live?: boolean;
  postedAt?: string | null;
}

export interface PagePost {
  id: string;
  genre?: string;
  text: string;
  scheduledAt: string;
  status: 'SCHEDULED' | 'PUBLISHED';
  postId?: string; // the post on Facebook
  permalink: string | null;
}

// Comes from the worker, so a genre added in vdev-video shows up here with no change to this page
export interface VideoGenre {
  id: string;
  label: string;
  description: string;
  series: string;
  channelName: string;
  titleSuffix: string;
  hashtags: string;
  formats: ('dialogue' | 'reading')[];
  narrated?: boolean; // one reader for the whole lesson (Shadowing); older workers don't send it
  styles: { id: string; label: string; aspects: ('9:16' | '16:9')[] }[];
  facebook: boolean;
  youtube: boolean;
  env: { facebook: string[]; youtube: string };
}

// Jobs and posts from before genres have none: they all belong to the first series
export const DEFAULT_GENRE = 'communication';
export const genreIdOf = (item: { genre?: string } | null | undefined) => item?.genre ?? DEFAULT_GENRE;

export interface LessonJob {
  id: string;
  status: LessonJobStatus;
  request: any;
  plan: string | null;
  episode: number | null;
  lesson: any | null;
  meta: any;
  videoPath: string | null;
  facebook?: FacebookPost | null;
  youtube?: YouTubePost | null;
  error: string | null;
  failedStage: 'plan' | 'write' | 'render' | null;
  createdAt?: string;
  updatedAt?: string;
  target?: JobTarget;
  comedy?: { script: ComedyScript };
  room?: WritersRoom;
}

// ---------- comedy shorts (the Studio) ----------

export interface ComedyLine {
  speaker: string;
  text: string;
  expression: string;
  pose: string;
  camera: 'wide' | 'close' | 'insert';
  spot?: string | null;
  pause?: number | null;
  hold?: number | null;
  fx?: string | null;
  sfx?: string | null;
  listener?: { expression: string; pose: string } | null;
}

export interface ComedyShot {
  set: string;
  blocking: { cast: string; mark: string; facing: 1 | -1 }[];
  lines: ComedyLine[];
}

export interface ComedyScript {
  title: string;
  shots: ComedyShot[];
}

export interface ComedyCatalog {
  cast: { id: string; name: string; about: string }[];
  poses: { id: string; use: string }[];
  expressions: { id: string; use: string }[];
  cameras: string[];
  fx: string[];
  sfx: string[];
  sets: { id: string; description: string; marks: { name: string; stance: string }[]; spots: { name: string; about: string }[] }[];
  writers?: { claude: boolean; codex: boolean };
}

// Claude and Codex as a writers' room (scripts/writersRoom.ts of vdev-video)
export type ComedyWriter = 'claude' | 'codex';
export const WRITER_NAME: Record<ComedyWriter, string> = { claude: 'Claude', codex: 'Codex' };
export interface ComedyReview { by: ComedyWriter; score: number; verdict: string; keep: string; fix: string[] }
export interface ComedyDraft { by: ComedyWriter; script: ComedyScript | null; description: string; review: ComedyReview | null; error: string | null }
export interface ComedyPackaging { by: ComedyWriter; title: string; description: string; tags: string[]; hook: string; thumbnail: string }
export interface WritersRoom { step: 'drafting' | 'reviewing' | 'polishing' | 'packaging' | 'done'; drafts: ComedyDraft[]; winner: ComedyWriter | null; polished: boolean; packaging: ComedyPackaging | null }
export interface ComedyIdea { by: ComedyWriter; idea: string; note: string; why: string }

export const isComedyJob = (job: LessonJob) => job.request?.kind === 'comedy';

// Comedy shorts post to a channel of their own; the publish form reads its name and tags from a genre
export const COMEDY_GENRE: VideoGenre = {
  id: 'comedy', label: 'Hài ngắn', description: 'Video hài ngắn người que', series: 'Hài ngắn', channelName: 'Hài ngắn', titleSuffix: 'Hài ngắn',
  hashtags: '#haihuoc #stickman #tienganh', formats: ['dialogue'], styles: [], facebook: false, youtube: false, env: { facebook: [], youtube: '' }
};
export const genreForJob = (job: LessonJob, genres: VideoGenre[]) => (isComedyJob(job) ? COMEDY_GENRE : genres.find((g) => g.id === genreIdOf(job.request)));

// Where a job's video goes: its course's page, or its genre's when the course has no page of its own
export interface JobTarget {
  owner: string;
  name: string;
  facebook: boolean;
  youtube: boolean;
}

// A course set up as a page, kept by the worker: the BE only knows the course itself
export interface CoursePage {
  courseId: string;
  title: string;
  genre: string;
  videoStyle: string;
  rules: string;
  ownPage: boolean;
  postTime: string; // HH:MM
  updatedAt: string;
  channel: JobTarget;
  nextEpisode: number;
}

export const batchOf = (job: LessonJob): { id: string; index: number; total: number } | null => job.request?.batch ?? null;
// The channel a job posts to, for keeping two videos of one channel off the same day
export const ownerOf = (job: LessonJob) => job.target?.owner ?? genreIdOf(job.request);

export const isFacebookBusy = (job: LessonJob) => job.facebook?.status === 'UPLOADING' || job.facebook?.status === 'PROCESSING';
export const isPublishing = (job: LessonJob) => isFacebookBusy(job) || job.youtube?.status === 'UPLOADING';

const call = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${WORKER_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Worker lỗi ${response.status}`);
  return data;
};

export const workerHealth = () => call('/health');
export const listJobs = (): Promise<LessonJob[]> => call('/jobs');
export const getJob = (id: string): Promise<LessonJob> => call(`/jobs/${id}`);
export const createJob = (request: unknown): Promise<LessonJob> => call('/jobs', 'POST', { request });
export const jobAction = (id: string, action: 'feedback' | 'approve' | 'published' | 'meta' | 'retry' | 'cancel' | 'delete' | 'facebook' | 'youtube' | 'rerender', body: unknown = {}): Promise<LessonJob> =>
  call(`/jobs/${id}/${action}`, 'POST', body);
export const listPages = (): Promise<CoursePage[]> => call('/pages');
export const getPage = (courseId: string): Promise<CoursePage> => call(`/pages/${courseId}`);
export const savePage = (courseId: string, page: Partial<CoursePage>): Promise<CoursePage> => call(`/pages/${courseId}`, 'POST', page);
export const createBatch = (courseId: string, items: { topic: string; note: string }[], request: unknown): Promise<LessonJob[]> => call('/batches', 'POST', { courseId, items, request });
export const comedyCatalog = (): Promise<ComedyCatalog> => call('/comedy/catalog');
export const createComedy = (idea: string, note: string, duo = false): Promise<LessonJob> => call('/comedy', 'POST', { idea, note, ...(duo ? { team: 'duo' } : {}) });
export const pickComedyDraft = (id: string, by: ComedyWriter): Promise<LessonJob> => call(`/comedy/${id}/pick`, 'POST', { by });
export const brainstormComedy = async (theme: string): Promise<ComedyIdea[]> => (await call('/comedy/ideas', 'POST', { theme })).ideas;
export const saveComedyScript = (id: string, script: ComedyScript): Promise<LessonJob> => call(`/comedy/${id}/script`, 'POST', { script });
export const paintComedySet = (id: string, setId: string, description: string): Promise<ComedyCatalog> => call(`/comedy/${id}/set`, 'POST', { id: setId, description });
export const previewComedyLine = async (id: string, line: number, script: ComedyScript) => `${WORKER_URL}${(await call(`/comedy/${id}/preview`, 'POST', { line, script })).url}`;
export const listPosts = (): Promise<PagePost[]> => call('/posts');

// What is on the channel's Facebook Page now, read by the worker with the Page token. Reading it also brings the
// worker's own record in line: a Reel moved or posted from Meta Business Suite updates its job.
export interface PageReel {
  videoId: string;
  jobId: string | null; // a video made in VDEV; null: posted another way
  title: string;
  picture: string | null;
  permalink: string | null;
  postedAt: string | null;
  seconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  avgWatchSeconds: number | null;
}
export interface PageScheduled {
  postId: string;
  videoId: string | null;
  jobId: string | null;
  title: string | null;
  text: string | null;
  scheduledAt: string;
  permalink: string | null;
}
export interface FacebookContent {
  reels: PageReel[];
  scheduled: PageScheduled[];
  watchTime: boolean; // false: the token lacks read_insights
  fetchedAt: string;
}
// Checks every video VDEV recorded as posted, on every channel, and forgets the ones Facebook no longer has
export const cleanFacebook = (): Promise<{ cleared: string[] }> => call('/channels/facebook-clean', 'POST', {});
export const facebookContent = (owner: string, fresh = false): Promise<FacebookContent> => call(`/channels/${encodeURIComponent(owner)}/facebook-content${fresh ? '?fresh=1' : ''}`);

// When the channel's Page already has a video out or booked, by VDEV or by hand, so a suggested slot never lands on
// one of those days. except: the video being placed, which doesn't block itself. A channel without a Page has none.
export const facebookTaken = async (owner: string, except?: string): Promise<Date[]> => {
  try {
    const content = await facebookContent(owner);
    return [
      ...content.scheduled.filter((item) => item.videoId && item.jobId !== except).map((item) => new Date(item.scheduledAt)),
      ...content.reels.filter((reel) => reel.postedAt && reel.jobId !== except).map((reel) => new Date(reel.postedAt!))
    ];
  } catch {
    return [];
  }
};
export const suggestPost = (idea: string, genre: string): Promise<{ text: string }> => call('/posts/suggest', 'POST', { idea, genre });
export const createPost = (text: string, scheduledAt: string, genre: string): Promise<PagePost> => call('/posts', 'POST', { text, scheduledAt, genre });
export interface FacebookChoice {
  id: string;
  name: string;
  usedBy: string | null;
}

// Names and ids only: a token goes into the worker and never comes back
export interface ChannelStatus {
  genre: string;
  label: string;
  series: string;
  scheduled: number;
  facebook: { configured: boolean; pageId: string | null; name: string | null; expiresAt: string | null; expiryKnown: boolean; missingScopes: string[]; checkedAt: string | null };
  youtube: { configured: boolean; channelId: string | null; title: string | null; login: { status: 'WAITING' | 'FAILED'; error: string | null } | null };
}

export interface ChannelsView {
  youtubeClient: boolean;
  channels: ChannelStatus[];
}

export const listChannels = (): Promise<ChannelsView> => call('/channels');
export const saveYouTubeClient = (clientId: string, clientSecret: string): Promise<ChannelsView> => call('/channels/youtube-client', 'POST', { clientId, clientSecret });
export const channelAction = (genre: string, action: 'facebook' | 'facebook-check' | 'facebook-remove' | 'youtube-login' | 'youtube-remove', body: unknown = {}): Promise<any> => call(`/channels/${genre}/${action}`, 'POST', body);
export const jobVideoUrl = (id: string) => `${WORKER_URL}/videos/${id}`;

// The shots of a rendered Stick Talk video (vdev-video src/shots.ts): edited here, kept by the worker for the next render
export interface ShotActor {
  id: string;
  expression: string;
  falls: boolean;
  action: string | null;
  beat?: number; // the word of the line the action starts on, -1 for the whole shot
}

export interface StudioShot {
  key: string;
  kind: string;
  index: number;
  from: number;
  frames: number;
  label: string;
  text: string | null;
  backdrop: string;
  night: boolean;
  zoom: number;
  camera: { move: string; target: string }; // target: a cast id or 'group'
  shock: boolean;
  fall: boolean;
  actors: ShotActor[];
}

export interface ShotEdit {
  backdrop?: string;
  night?: boolean;
  zoom?: number;
  camera?: { move?: string; target?: string };
  actors?: Record<string, { expression?: string; action?: string | null; beat?: number | null }>;
}
export type ShotEdits = Record<string, ShotEdit>;

export interface StudioView {
  fps: number;
  frames: number;
  shots: StudioShot[];
  edits: ShotEdits;
  errors: string[];
  added?: string[]; // problems the draft brings in, on a dry run
  options: {
    cast: { id: string; name: string }[];
    backdrops: { code: string; name: string }[];
    expressions: { code: string; name: string; use: string }[];
    actions: { action: string; label: string; use?: string }[];
    zooms: number[];
    cameraMoves: { move: string; label: string }[];
  };
}

export const getShots = (id: string): Promise<StudioView> => call(`/jobs/${id}/shots`);
export const tryShots = (id: string, edits: ShotEdits): Promise<StudioView> => call(`/jobs/${id}/shots`, 'POST', { edits, save: false });
export const saveShots = (id: string, edits: ShotEdits): Promise<StudioView> => call(`/jobs/${id}/shots`, 'POST', { edits });
export const previewShot = async (id: string, body: { key: string; kind: 'still' | 'clip'; edits: ShotEdits; at?: number }) => {
  const { url } = await call(`/jobs/${id}/preview`, 'POST', body);
  return `${WORKER_URL}${url}`;
};
