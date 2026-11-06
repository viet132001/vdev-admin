// Client for the local helper of vdev-video (`pnpm worker`): it asks Claude and renders video on this machine.
// Not the VDEV BE, so it doesn't go through services/api: no token is ever sent here.
export const WORKER_URL = 'http://localhost:4599';
export const WORKER_COMMAND = 'cd vdev-video && pnpm worker';

export type LessonJobStatus = 'PLANNING' | 'PLAN_READY' | 'WRITING' | 'LESSON_READY' | 'RENDERING' | 'DONE' | 'FAILED' | 'CANCELLED';

export type FacebookStatus = 'UPLOADING' | 'PROCESSING' | 'DRAFT' | 'PUBLISHED' | 'SUBMITTED' | 'FAILED';

export interface FacebookPost {
  status: FacebookStatus;
  state: 'DRAFT' | 'PUBLISHED';
  videoId: string | null;
  permalink: string | null;
  error: string | null;
}

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';

export interface YouTubePost {
  status: 'UPLOADING' | 'DONE' | 'FAILED';
  requested: YouTubePrivacy;
  privacy: YouTubePrivacy | null;
  videoId: string | null;
  url: string | null;
  error: string | null;
}

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
export const jobVideoUrl = (id: string) => `${WORKER_URL}/videos/${id}`;
