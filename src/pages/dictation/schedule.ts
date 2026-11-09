// The publishing plan: which category goes out on which day, and how a week of work maps onto it.
import type { LessonJob, PagePost } from './lessonWorker';

export type ContentType = 'conversation' | 'story' | 'vocabulary';

export const CONTENT_TYPES: Record<ContentType, { label: string; format: 'dialogue' | 'reading' }> = {
  conversation: { label: 'Daily Conversation', format: 'dialogue' },
  story: { label: 'English Stories', format: 'reading' },
  vocabulary: { label: 'Vocabulary', format: 'dialogue' }
};

export type SlotKind = ContentType | 'post';

export const slotLabel = (kind: SlotKind) => (kind === 'post' ? 'Bài tương tác' : CONTENT_TYPES[kind].label);

// getDay() numbering. 3 Daily Conversation, 2 English Stories, 2 Vocabulary and 2 text posts a week; change it here.
const VIDEO_TIME = [19, 30];
const POST_TIME = [12, 0];
export const WEEK_PLAN: { day: number; kind: SlotKind; time: number[] }[] = [
  { day: 1, kind: 'conversation', time: VIDEO_TIME },
  { day: 2, kind: 'vocabulary', time: VIDEO_TIME },
  { day: 3, kind: 'post', time: POST_TIME },
  { day: 3, kind: 'conversation', time: VIDEO_TIME },
  { day: 4, kind: 'story', time: VIDEO_TIME },
  { day: 5, kind: 'conversation', time: VIDEO_TIME },
  { day: 6, kind: 'post', time: POST_TIME },
  { day: 6, kind: 'vocabulary', time: VIDEO_TIME },
  { day: 0, kind: 'story', time: VIDEO_TIME }
];

const MIN_LEAD_MS = 15 * 60 * 1000;
const SEARCH_DAYS = 28;

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const startOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

const atTime = (date: Date, time: number[]) => {
  const result = new Date(date);
  result.setHours(time[0], time[1], 0, 0);
  return result;
};

export interface Slot {
  kind: SlotKind;
  at: Date;
}

// A week's slots from Monday to Sunday
export const weekSlots = (weekStart: Date): Slot[] =>
  WEEK_PLAN.map(({ day, kind, time }) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + ((day + 6) % 7));
    return { kind, at: atTime(date, time) };
  }).sort((a, b) => a.at.getTime() - b.at.getTime());

// When a job's video goes or went out: it can't be two different days on the two platforms in this plan
export const jobWhen = (job: LessonJob): Date | null => {
  const iso = job.facebook?.scheduledAt ?? job.youtube?.publishAt ?? job.facebook?.postedAt ?? job.youtube?.postedAt;
  return iso ? new Date(iso) : null;
};

// alsoTaken: slots already promised to other videos, so a list of suggestions doesn't put two on one day
export const nextFreeSlot = (contentType: ContentType | undefined, jobs: LessonJob[], now = new Date(), alsoTaken: Date[] = []): Date => {
  const taken = [...jobs.map(jobWhen).filter((date): date is Date => !!date), ...alsoTaken];
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    for (const { day, kind, time } of WEEK_PLAN) {
      if (day !== date.getDay() || kind !== (contentType ?? kind) || kind === 'post') continue;
      const at = atTime(date, time);
      if (at.getTime() - now.getTime() > MIN_LEAD_MS && !taken.some((other) => sameDay(other, at))) return at;
    }
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
};

const pad = (n: number) => String(n).padStart(2, '0');

export const toLocalInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const fromLocalInput = (value: string) => new Date(value).toISOString();

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const formatDay = (date: Date) => `${DAY_NAMES[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
export const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${formatTime(date)} ${formatDay(date)}`;
};

export const postOnDay = (posts: PagePost[], at: Date) => posts.find((post) => sameDay(new Date(post.scheduledAt), at));
