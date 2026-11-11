// The sci-fi story channel, served by the local vdev-video worker (scripts/storyStudio.ts there): series bibles,
// episodes from outline to two cuts. Full episode → YouTube, teaser → Facebook.
import { WORKER_URL, type ComedyReview, type LessonJob, type VideoGenre } from '../dictation/lessonWorker';

export const NARRATOR = 'narrator';
export const MOODS = ['calm', 'tense', 'whisper', 'urgent', 'awe', 'sad', 'cold', 'warm'] as const;
export const MOOD_LABEL: Record<string, string> = { calm: 'Bình thường', tense: 'Căng', whisper: 'Thì thầm', urgent: 'Gấp', awe: 'Choáng ngợp', sad: 'Buồn', cold: 'Lạnh lùng', warm: 'Ấm' };
export const CAMERAS = ['push', 'pull', 'panLeft', 'panRight', 'still'] as const;
export const CAMERA_LABEL: Record<string, string> = { push: 'Dồn vào', pull: 'Lùi ra', panLeft: 'Lia trái', panRight: 'Lia phải', still: 'Đứng yên' };
export const SYLLABLES_PER_SECOND = 3;
export const LIMITS = { full: { min: 1100, max: 1950 }, short: { min: 110, max: 200 } };

export interface StoryCharacter { id: string; name: string; role: string; look: string; voice: string; want: string; flaw: string; secret: string }
export interface StoryBible { title: string; logline: string; world: string; rules: string[]; tone: string; style: string; protagonist: StoryCharacter; cast: StoryCharacter[]; threads: string[] }
export interface EpisodeMemory { jobId: string; episode: number; title: string; summary: string; opened: string[]; closed: string[]; change: string; cliffhanger: string }
export interface StorySeries { id: string; createdAt: string; bible: StoryBible; episodes: EpisodeMemory[] }
export interface SeriesSummary { id: string; title: string; logline: string; protagonist: string; episodes: number; createdAt: string }

export interface StoryOutline {
  title: string; logline: string; coldOpen: string; beats: { name: string; summary: string; turn: string }[];
  midpoint: string; climax: string; cliffhanger: string; opened: string[]; closed: string[]; change: string;
}
export interface StoryLine { speaker: string; text: string; mood: string; pause: number | null }
export interface StoryScene { art: string; camera: string; focus: number; caption: string | null; lines: StoryLine[] }
export interface StoryScript { title: string; scenes: StoryScene[]; ending: string }
export interface StoryShort { hook: string; lines: { art: string; text: string; mood: string }[]; cta: string }
export interface StoryPackaging { youtubeTitle: string; youtubeDescription: string; tags: string[]; thumbnail: string; facebookCaption: string }
export interface StoryJob {
  seriesId: string; episode: number; step: string | null; progress: string | null;
  outline: StoryOutline | null; outlineReview: ComedyReview | null; outlinePolished: boolean;
  script: StoryScript | null; scriptReview: ComedyReview | null; scriptPolished: boolean;
  short: StoryShort | null; packaging: StoryPackaging | null;
}
export type StoryEpisode = LessonJob & { story?: StoryJob; shortPath?: string | null };
export interface StoryIdea { by: 'claude' | 'codex'; idea: string; note: string; why: string }

export const isStoryJob = (job: LessonJob) => job.request?.kind === 'story';

export const STORY_GENRE: VideoGenre = {
  id: 'story', label: 'Truyện viễn tưởng', description: 'Truyện khoa học viễn tưởng kể bằng tiếng Việt', series: 'Truyện viễn tưởng', channelName: 'Truyện viễn tưởng', titleSuffix: 'Truyện viễn tưởng',
  hashtags: '#truyenvientuong #khoahocvientuong', formats: ['dialogue'], styles: [], facebook: false, youtube: false, env: { facebook: [], youtube: '' }
};

const call = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${WORKER_URL}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Worker trả lỗi ${response.status}`);
  return data;
};

export const listSeries = (): Promise<SeriesSummary[]> => call('/stories/series');
export const getSeries = (id: string): Promise<StorySeries> => call(`/stories/series/${id}`);
export const createSeries = (premise: string, note: string): Promise<StorySeries> => call('/stories/series', 'POST', { premise, note });
export const saveBible = (id: string, bible: StoryBible): Promise<StorySeries> => call(`/stories/series/${id}`, 'POST', { bible });
export const episodeIdeas = async (id: string): Promise<StoryIdea[]> => (await call(`/stories/series/${id}`, 'POST', { ideas: true })).ideas;
export const createEpisode = (seriesId: string, idea: string, note: string): Promise<StoryEpisode> => call('/stories', 'POST', { seriesId, idea, note });
export const outlineFeedback = (id: string, feedback: string): Promise<StoryEpisode> => call(`/stories/${id}/feedback`, 'POST', { feedback });
export const approveOutline = (id: string, outline?: StoryOutline): Promise<StoryEpisode> => call(`/stories/${id}/approve`, 'POST', outline ? { outline } : {});
export const saveStoryScript = (id: string, script: StoryScript, short: StoryShort): Promise<StoryEpisode> => call(`/stories/${id}/script`, 'POST', { script, short });
export const paintStoryArt = (id: string, artId: string, description: string): Promise<{ id: string }> => call(`/stories/${id}/art`, 'POST', { id: artId, description });
export const renderEpisode = (id: string): Promise<StoryEpisode> => call(`/stories/${id}/render`, 'POST', {});
export const artUrl = (jobId: string, artId: string, version = 0) => `${WORKER_URL}/stories/${jobId}/art?id=${encodeURIComponent(artId)}&v=${version}`;
export const shortVideoUrl = (jobId: string) => `${WORKER_URL}/videos/${jobId}?cut=short`;

export const syllables = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const minutes = (count: number) => Math.round((count / SYLLABLES_PER_SECOND / 60) * 10) / 10;
