// Carries a batch through the steps that need the user's VDEV login, for as long as the page is open: each written
// lesson goes onto its course, and each YouTube link onto its lesson. The worker does everything else by itself.
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../services/api';
import { batchOf, isFacebookBusy, jobAction, listJobs, type LessonJob } from './lessonWorker';
import { linkVideoToLesson, needsLink, saveLessonToCourse, youtubeLinkOf } from './lessonSave';

const POLL_MS = 5000;
export const BATCH_ACTIVE = ['QUEUED', 'PLANNING', 'PLAN_READY', 'WRITING', 'LESSON_READY', 'RENDERING'];

// Two tabs, or the dialog and the page, must not save one lesson twice
const working = new Set<string>();

// Still moving by itself; a step that failed waits for the user, so it doesn't count
export const batchBusy = (job: LessonJob) =>
  (job.status === 'LESSON_READY' ? !job.meta?.saveError : BATCH_ACTIVE.includes(job.status))
  || job.youtube?.status === 'UPLOADING' || isFacebookBusy(job) || (needsLink(job) && !job.meta?.linkError);

const step = async (job: LessonJob, onSaved: () => void) => {
  if (working.has(job.id)) return;
  // A save that failed waits for the user to try again, instead of hitting the BE every few seconds
  const saving = job.status === 'LESSON_READY' && !job.meta?.saveError;
  const linking = needsLink(job) && !job.meta?.linkError;
  if (!saving && !linking) return;
  working.add(job.id);
  try {
    if (saving) await saveLessonToCourse(job);
    else await linkVideoToLesson(job, youtubeLinkOf(job)!);
    onSaved();
  } catch (err) {
    const key = saving ? 'saveError' : 'linkError';
    await jobAction(job.id, 'meta', { meta: { [key]: getErrorMessage(err, saving ? 'Không lưu được bài lên khoá học' : 'Không gắn được link video vào bài học') } }).catch(() => undefined);
  } finally {
    working.delete(job.id);
  }
};

// Returns kick(): call it after starting or scheduling a batch, so the runner looks again
export const useBatchRunner = (enabled: boolean, onSaved: () => void) => {
  const [tick, setTick] = useState(0);
  const kick = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    const run = async () => {
      // The worker not running means nothing is moving: wait for a kick instead of waking it up again and again
      const jobs = await listJobs().catch(() => null);
      if (!jobs || stopped) return;
      const batch = jobs.filter((job) => batchOf(job) && job.status !== 'CANCELLED');
      for (const job of batch) {
        if (stopped) return;
        await step(job, onSaved);
      }
      if (!stopped && batch.some(batchBusy)) timer = window.setTimeout(run, POLL_MS);
    };
    run();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [enabled, tick, onSaved]);

  return kick;
};
