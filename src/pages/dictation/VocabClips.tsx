// The short vocabulary videos made beside a podcast lesson: each is watched and posted on its own.
import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { VideoPublish } from './VideoPublish';
import { jobAction, jobVideoUrl, listJobs, type LessonJob, type VideoGenre } from './lessonWorker';

const POLL_MS = 3000;

interface VocabClipsProps {
  parentId: string;
  genre: VideoGenre;
  onManageChannels: () => void;
  onLinked: () => void;
}

export const VocabClips: React.FC<VocabClipsProps> = ({ parentId, genre, onManageChannels, onLinked }) => {
  const [clips, setClips] = useState<LessonJob[]>([]);
  const [round, setRound] = useState(0);
  const moving = clips.some((clip) => clip.status === 'RENDERING');

  useEffect(() => {
    let stale = false;
    const load = () => listJobs()
      .then((jobs) => { if (!stale) setClips(jobs.filter((job) => job.meta?.clipOf === parentId).sort((a, b) => String(a.lesson?.title).localeCompare(String(b.lesson?.title)))); })
      .catch(() => undefined);
    load();
    const timer = moving ? window.setInterval(load, POLL_MS) : undefined;
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [parentId, moving, round]);

  const replace = (next: LessonJob) => setClips((all) => all.map((clip) => (clip.id === next.id ? next : clip)));
  const retry = async (clip: LessonJob) => {
    try {
      replace(await jobAction(clip.id, 'retry'));
      setRound((n) => n + 1);
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Không thử lại được');
    }
  };

  if (!clips.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Video từ vựng ({clips.length})</p>
      {clips.map((clip) => (
        <details key={clip.id} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer' }}>
            {clip.lesson?.title}
            <span className="lg-meta">{clip.status === 'RENDERING' ? ` · Đang tạo${clip.progress != null ? ` ${clip.progress}%` : ''}` : clip.status === 'FAILED' ? ' · Lỗi' : ''}</span>
          </summary>
          {clip.status === 'FAILED' && (
            <>
              <p className="lg-error">{clip.error}</p>
              <button className="btn btn-secondary btn-sm" onClick={() => retry(clip)}><RotateCcw size={14} /> Thử lại</button>
            </>
          )}
          {clip.status === 'DONE' && clip.videoPath && (
            <>
              <video className="lg-video" src={jobVideoUrl(clip.id)} controls playsInline preload="none" />
              <VideoPublish job={clip} genre={genre} onManageChannels={onManageChannels} onChange={replace} onLinked={onLinked} />
            </>
          )}
        </details>
      ))}
    </div>
  );
};
