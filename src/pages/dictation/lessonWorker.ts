// Client for the local helper of vdev-video (`pnpm worker`): it asks Claude and renders video on this machine.
// Not the VDEV BE, so it doesn't go through services/api: no token is ever sent here.
export const WORKER_URL = 'http://localhost:4599';
export const WORKER_COMMAND = 'cd vdev-video && pnpm worker:install';

export type LessonJobStatus = 'PLANNING' | 'PLAN_READY' | 'WRITING' | 'LESSON_READY' | 'RENDERING' | 'DONE' | 'FAILED' | 'CANCELLED';

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
}

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
export const jobAction = (id: string, action: 'feedback' | 'approve' | 'published' | 'meta' | 'retry' | 'cancel' | 'facebook' | 'youtube' | 'rerender', body: unknown = {}): Promise<LessonJob> =>
  call(`/jobs/${id}/${action}`, 'POST', body);
export const listPosts = (): Promise<PagePost[]> => call('/posts');
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
  actors?: Record<string, { expression?: string; action?: string | null }>;
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
    actions: { action: string; label: string }[];
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
