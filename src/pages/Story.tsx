import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { VideoPublish } from './dictation/VideoPublish';
import { WORKER_COMMAND, getJob, isPublishing, jobAction, jobVideoUrl, listJobs } from './dictation/lessonWorker';
import { BibleEditor, EpisodeMemoryList, NewEpisode, NewSeries } from './story/SeriesPanel';
import { OutlineView } from './story/OutlineView';
import { ScriptEditor } from './story/ScriptEditor';
import { STORY_GENRE, getSeries, isStoryJob, listSeries, shortVideoUrl, type SeriesSummary, type StoryEpisode, type StoryPackaging, type StorySeries } from './story/storyWorker';

const POLL_MS = 3000;
const MOVING = ['PLANNING', 'WRITING', 'RENDERING'];
const STATUS: Record<string, { label: string; tone: string }> = {
  PLANNING: { label: 'Đang lập dàn ý', tone: 'info' },
  PLAN_READY: { label: 'Chờ duyệt dàn ý', tone: 'warning' },
  WRITING: { label: 'Đang viết kịch bản', tone: 'info' },
  LESSON_READY: { label: 'Chờ duyệt kịch bản', tone: 'warning' },
  RENDERING: { label: 'Đang render', tone: 'info' },
  DONE: { label: 'Có video', tone: 'success' },
  FAILED: { label: 'Lỗi', tone: 'danger' },
  CANCELLED: { label: 'Đã huỷ', tone: 'warning' }
};

// The steps of each stage, as the worker names them in story.step
const STAGES: Record<string, { id: string; label: string }[]> = {
  PLANNING: [{ id: 'outline', label: 'Claude lập dàn ý' }, { id: 'outline-review', label: 'Codex chấm' }, { id: 'outline-polish', label: 'Claude sửa theo góp ý' }],
  WRITING: [{ id: 'script', label: 'Claude viết kịch bản' }, { id: 'script-review', label: 'Codex tìm chỗ người xem bỏ đi' }, { id: 'script-polish', label: 'Claude sửa' }, { id: 'launch', label: 'Codex dựng bản ngắn và đóng gói' }, { id: 'arts', label: 'Claude vẽ tranh' }],
  RENDERING: [{ id: 'voice', label: 'Lồng giọng' }, { id: 'render-full', label: 'Render bản đầy đủ' }, { id: 'render-short', label: 'Render bản ngắn' }]
};

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const Progress: React.FC<{ job: StoryEpisode }> = ({ job }) => {
  const steps = STAGES[job.status] ?? [];
  const current = Math.max(0, steps.findIndex((s) => s.id === job.story?.step));
  return (
    <div className="card flex flex-col gap-2">
      <ol className="st-steps">
        {steps.map((step, i) => (
          <li key={step.id} className={`st-step ${i < current ? 'done' : i === current ? 'current' : ''}`}>
            {i < current ? <Check size={14} /> : i === current ? <Loader2 size={14} className="spin" /> : <span style={{ width: 14 }} />}
            {step.label}{i === current && job.story?.progress ? ` · ${job.story.progress}` : ''}
          </li>
        ))}
      </ol>
      <p className="lg-meta" style={{ margin: 0 }}>
        {job.status === 'PLANNING' && 'Claude viết kỹ nên thường 5–12 phút. Có thể rời trang, worker vẫn chạy.'}
        {job.status === 'WRITING' && 'Kịch bản 6–10 phút qua hai lượt viết và một lượt chấm, rồi vẽ tranh: thường 20–40 phút. Có thể rời trang, worker vẫn chạy.'}
        {job.status === 'RENDERING' && 'Lồng giọng ElevenLabs rồi render hai bản. Bản đầy đủ có thể mất 10–30 phút.'}
      </p>
    </div>
  );
};

const CopyText: React.FC<{ label: string; text: string; pre?: boolean }> = ({ label, text, pre }) => {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <>
      <dt className="flex align-center gap-2">{label}
        <button className="icon-btn" title="Chép" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }).catch(() => undefined)}>{done ? <Check size={14} /> : <Copy size={14} />}</button>
      </dt>
      <dd style={pre ? { whiteSpace: 'pre-wrap' } : undefined}>{text}</dd>
    </>
  );
};

const Packaging: React.FC<{ packaging: StoryPackaging }> = ({ packaging }) => (
  <div className="card st-pack">
    <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Đóng gói</h2>
    <p className="lg-meta" style={{ margin: '2px 0 0' }}>Tiêu đề và mô tả YouTube đã điền sẵn vào form đăng; chú thích Facebook chép ở đây.</p>
    <dl style={{ margin: 0 }}>
      <CopyText label="Tiêu đề YouTube" text={packaging.youtubeTitle} />
      <CopyText label="Mô tả YouTube" text={packaging.youtubeDescription} pre />
      <CopyText label="Tag" text={packaging.tags.join(', ')} />
      <CopyText label="Chữ trên ảnh bìa" text={packaging.thumbnail} />
      <CopyText label="Chú thích Facebook Reels" text={packaging.facebookCaption} pre />
    </dl>
  </div>
);

export const Story: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const seriesId = params.get('series');
  const jobId = params.get('job');
  const [state, setState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);
  const [series, setSeries] = useState<StorySeries | null>(null);
  const [jobs, setJobs] = useState<StoryEpisode[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, all] = await Promise.all([listSeries(), listJobs()]);
      setSeriesList(list);
      setJobs(all.filter(isStoryJob) as StoryEpisode[]);
      setState('online');
    } catch {
      setState('offline');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The series on screen: the one in the URL, else the newest
  const activeId = seriesId ?? seriesList[0]?.id ?? null;
  useEffect(() => {
    if (!activeId || activeId === 'new') { setSeries(null); return; }
    getSeries(activeId).then(setSeries).catch(() => setSeries(null));
  }, [activeId, jobs.length]);

  const job = jobs.find((j) => j.id === jobId) ?? null;
  const moving = !!job && (MOVING.includes(job.status) || isPublishing(job));
  useEffect(() => {
    if (!job || !moving) return;
    const timer = window.setInterval(() => {
      getJob(job.id).then((next) => {
        setJobs((list) => list.map((j) => (j.id === next.id ? (next as StoryEpisode) : j)));
        if (next.status === 'DONE' && activeId) getSeries(activeId).then(setSeries).catch(() => undefined);
      }).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [job, moving, activeId]);

  const go = (next: { series?: string | null; job?: string | null }) => {
    const p: Record<string, string> = {};
    const s = next.series === undefined ? activeId : next.series;
    if (s) p.series = s;
    if (next.job) p.job = next.job;
    setParams(p);
  };
  const replace = (next: StoryEpisode) => setJobs((list) => (list.some((j) => j.id === next.id) ? list.map((j) => (j.id === next.id ? next : j)) : [next, ...list]));

  const retry = async () => {
    if (!job) return;
    try { replace(await jobAction(job.id, 'retry') as StoryEpisode); } catch (err) { alert(message(err, 'Không thử lại được')); }
  };
  const askDelete = () => job && setConfirm({
    title: `Xoá tập ${job.story?.episode ?? ''}?`,
    message: 'Kịch bản và hai file video trên máy bị xoá. Tranh của series, bài đã đăng hoặc đã hẹn trên Facebook / YouTube vẫn còn.',
    confirmLabel: 'Xoá',
    action: async () => {
      setConfirm(null);
      try {
        await jobAction(job.id, MOVING.includes(job.status) ? 'cancel' : 'delete');
        setJobs((list) => list.filter((j) => j.id !== job.id));
        go({ job: null });
      } catch (err) {
        alert(message(err, 'Không xoá được'));
      }
    }
  });

  if (state === 'loading') return <div className="loading-container"><span className="spinner"></span><span>Đang kết nối...</span></div>;
  if (state === 'offline') {
    return (
      <div className="flex flex-col gap-4">
        <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 600 }}>Truyện viễn tưởng</h1>
        <div className="card">
          <p>Kênh truyện chạy bằng công cụ trên máy này, chưa kết nối được. Nếu chưa cài, mở Terminal và chạy:</p>
          <pre className="lg-command">{WORKER_COMMAND}</pre>
          <button className="btn btn-primary mt-4" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
        </div>
      </div>
    );
  }

  const episodes = jobs.filter((j) => j.story?.seriesId === activeId).sort((a, b) => (b.story?.episode ?? 0) - (a.story?.episode ?? 0));
  const status = job ? STATUS[job.status] ?? { label: job.status, tone: 'info' } : null;
  const story = job?.story;
  const scriptStage = !!job && !!story?.script && !!story.short && (['LESSON_READY', 'DONE'].includes(job.status) || (job.status === 'FAILED' && job.failedStage === 'render'));

  return (
    <div className="st-shell">
      <aside className="st-list">
        <select className="form-input" value={activeId ?? 'new'} onChange={(e) => go({ series: e.target.value, job: null })}>
          {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          <option value="new">+ Series mới</option>
        </select>
        {series && <button className={`btn ${job ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }} onClick={() => go({ job: null })}><Plus size={16} /> Tập mới</button>}
        {series && episodes.length === 0 && <p className="lg-meta">Chưa có tập nào.</p>}
        {episodes.map((j) => {
          const s = STATUS[j.status] ?? { label: j.status, tone: 'info' };
          return (
            <button key={j.id} className={`st-item${j.id === jobId ? ' active' : ''}`} onClick={() => go({ job: j.id })}>
              <span className="vl-title">Tập {j.story?.episode}: {j.story?.script?.title ?? j.story?.outline?.title ?? (j.request.topic || 'Đang lập dàn ý')}</span>
              <span className={`badge badge-${s.tone}`}>{s.label}</span>
            </button>
          );
        })}
      </aside>

      <section className="st-main flex flex-col gap-4">
        {(!activeId || activeId === 'new') && <NewSeries onCreated={(created) => { setSeriesList((l) => [{ id: created.id, title: created.bible.title, logline: created.bible.logline, protagonist: created.bible.protagonist.name, episodes: 0, createdAt: created.createdAt }, ...l]); go({ series: created.id, job: null }); }} />}

        {series && !job && (
          <>
            <div>
              <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600 }}>{series.bible.title}</h1>
              <p className="lg-meta" style={{ marginTop: 4 }}>{series.bible.logline} Nhân vật chính: {series.bible.protagonist.name}.</p>
            </div>
            <NewEpisode series={series} onCreated={(created) => { replace(created); go({ job: created.id }); }} />
            <BibleEditor key={series.id} series={series} onSaved={setSeries} />
            <EpisodeMemoryList series={series} />
          </>
        )}

        {job && series && story && (
          <>
            <header className="flex justify-between align-center" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p className="lg-meta" style={{ margin: 0 }}>{series.bible.title} · Tập {story.episode}</p>
                <h1 style={{ fontSize: '1.4rem', margin: '2px 0 0', fontWeight: 600 }}>{story.script?.title ?? story.outline?.title ?? 'Đang lập dàn ý'}</h1>
              </div>
              <div className="flex align-center gap-2">
                {status && <span className={`badge badge-${status.tone}`}>{status.label}</span>}
                <button className="icon-btn" title="Xoá" onClick={askDelete}><Trash2 size={16} /></button>
              </div>
            </header>

            {MOVING.includes(job.status) && <Progress job={job} />}
            {job.status === 'FAILED' && (
              <div className="card">
                <p className="lg-error" style={{ marginTop: 0 }}>{job.error}</p>
                <button className="btn btn-primary btn-sm" onClick={retry}><RotateCcw size={14} /> Thử lại từ bước lỗi</button>
              </div>
            )}

            {job.status === 'DONE' && job.videoPath && (
              <div className="card flex flex-col gap-4">
                <div className="sr-videos">
                  <div><b>Bản đầy đủ · YouTube</b><video className="lg-video" src={jobVideoUrl(job.id)} controls playsInline preload="metadata" /></div>
                  {job.shortPath && <div><b>Bản ngắn · Facebook</b><video className="lg-video sr-vertical" src={shortVideoUrl(job.id)} controls playsInline preload="metadata" /></div>}
                </div>
                <p className="lg-meta" style={{ margin: 0 }}>Đăng Facebook sẽ gửi bản ngắn, đăng YouTube gửi bản đầy đủ.</p>
                <VideoPublish key={job.id} job={job} genre={STORY_GENRE} initialTitle={story.packaging?.youtubeTitle} initialCaption={story.packaging?.youtubeDescription} onManageChannels={() => alert('Kết nối kênh "Truyện viễn tưởng" ở màn Quản lý kênh trong Quản lý page.')} onChange={(next) => replace(next as StoryEpisode)} onLinked={() => undefined} />
              </div>
            )}

            {story.outline && ['PLAN_READY', 'WRITING', 'LESSON_READY'].includes(job.status) && <OutlineView job={job} onChange={replace} />}
            {story.packaging && ['LESSON_READY', 'DONE'].includes(job.status) && <Packaging packaging={story.packaging} />}
            {scriptStage && story.script && story.short && <ScriptEditor key={job.id} job={job} bible={series.bible} onChange={replace} />}
          </>
        )}
      </section>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
