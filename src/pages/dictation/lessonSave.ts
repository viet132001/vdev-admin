// What the page does in VDEV for a job, on the user's own login: the worker never holds a VDEV token.
import { api } from '../../services/api';
import { jobAction, type LessonJob, type VideoGenre } from './lessonWorker';

export const TASK_PROJECT_NAME = 'Bài học tiếng Anh';

// Keeps lesson tasks together on one board instead of the inbox
export const lessonProjectId = async () => {
  const projects = await api.get('/api/task-projects', { noCache: true });
  const found = (Array.isArray(projects) ? projects : []).find((p: any) => p.name === TASK_PROJECT_NAME);
  if (found) return found.id;
  return (await api.post('/api/task-projects', { name: TASK_PROJECT_NAME })).id;
};

export const setTaskStatus = (id: string | undefined, status: string) => (id ? api.patch(`/api/tasks/${id}`, { status }) : Promise.resolve());

// The written lesson goes onto its course. Each step is remembered on the job, so a retry continues instead of
// making a second lesson. Returns the job as the worker has it after being told.
export const saveLessonToCourse = async (job: LessonJob): Promise<LessonJob> => {
  let lessonId: string | undefined = job.meta?.lessonId;
  if (!lessonId) {
    const { title, description } = job.lesson;
    const created = await api.post(`/api/dictation/sessions/${job.meta.courseId}/lessons`, { title, description });
    lessonId = created.id as string;
    await jobAction(job.id, 'meta', { meta: { lessonId } });
  }
  if (!job.meta?.sentencesSaved) {
    // phrases and stage are for the video only
    await api.post(`/api/dictation/lessons/${lessonId}/sentences/bulk`, { items: job.lesson.sentences.map(({ phrases: _videoOnly, stage: _acting, ...sentence }: any) => sentence) });
    await jobAction(job.id, 'meta', { meta: { sentencesSaved: true } });
  }
  await setTaskStatus(job.meta.writeTaskId, 'IN_REVIEW');
  await setTaskStatus(job.meta.videoTaskId, 'IN_PROGRESS');
  return jobAction(job.id, 'published', { meta: { lessonId } });
};

// A private video can't be played by learners, so that link never goes on the lesson by itself. A scheduled one is
// private only until its time, so its link goes on now: nobody has to be at the machine then.
export const youtubeLinkOf = (job: LessonJob) => {
  const youtube = job.youtube;
  return youtube?.status === 'DONE' && (youtube.privacy !== 'private' || youtube.publishAt) ? youtube.url : null;
};

export const needsLink = (job: LessonJob) => {
  const url = youtubeLinkOf(job);
  return !!url && !!job.meta?.lessonId && job.meta?.videoLinkUrl !== url;
};

export const linkVideoToLesson = async (job: LessonJob, url: string): Promise<LessonJob> => {
  await api.patch(`/api/dictation/lessons/${job.meta.lessonId}`, { videoUrl: url });
  return jobAction(job.id, 'meta', { meta: { videoLinkUrl: url } });
};

// What a post says by default, on Facebook and YouTube alike
export const CAPTION_LIMIT = 2200;
export const TITLE_LIMIT = 100;

// Every word the lesson teaches, once and in the order it comes up, so viewers can review them under the video
const vocabularyList = (job: LessonJob) => {
  const seen = new Set<string>();
  const items = (job.lesson?.sentences ?? [])
    .flatMap((s: any) => s.vocabularies ?? [])
    .filter((v: any) => v?.term?.trim() && !seen.has(v.term.trim().toLowerCase()) && seen.add(v.term.trim().toLowerCase()));
  return items.length ? ['Từ vựng trong bài:', ...items.map((v: any) => `• ${v.term.trim()}: ${String(v.meaning ?? '').trim()}`)].join('\n') : '';
};

export const defaultCaption = (job: LessonJob, genre: VideoGenre) => [job.lesson?.description, vocabularyList(job), genre.hashtags].filter(Boolean).join('\n\n').slice(0, CAPTION_LIMIT);
export const defaultTitle = (job: LessonJob, genre: VideoGenre) => `${job.lesson?.title ?? job.request.topic} | ${genre.titleSuffix}`.slice(0, TITLE_LIMIT);
