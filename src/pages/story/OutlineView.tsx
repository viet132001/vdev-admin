import React, { useState } from 'react';
import { Check, Loader2, MessageSquare, PenLine } from 'lucide-react';
import { WRITER_NAME, type ComedyReview } from '../dictation/lessonWorker';
import { approveOutline, outlineFeedback, type StoryEpisode } from './storyWorker';

// What the editor said about a draft, and whether the writer has already reworked it
export const ReviewCard: React.FC<{ title: string; review: ComedyReview | null; polished: boolean }> = ({ title, review, polished }) => {
  if (!review) return null;
  return (
    <div className="st-draft">
      <div className="flex justify-between align-center gap-2">
        <b>{title}</b>
        <span><span className="st-score">{review.score}</span>/10 <span className="lg-meta">· {WRITER_NAME[review.by]} chấm bản nháp đầu</span></span>
      </div>
      {review.verdict && <span style={{ fontSize: '0.9rem' }}>{review.verdict}</span>}
      {review.keep && <span className="lg-meta" style={{ margin: 0 }}>Giữ: {review.keep}</span>}
      {review.fix.length > 0 && <ul>{review.fix.map((f) => <li key={f}>{f}</li>)}</ul>}
      <span className="lg-meta" style={{ margin: 0 }}>{polished ? 'Claude đã viết lại theo các góp ý này.' : review.fix.length ? 'Chưa sửa theo góp ý (lần sửa không đạt kiểm tra).' : 'Không cần sửa.'}</span>
    </div>
  );
};

export const OutlineView: React.FC<{ job: StoryEpisode; onChange: (job: StoryEpisode) => void }> = ({ job, onChange }) => {
  const story = job.story!;
  const outline = story.outline!;
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<'feedback' | 'approve' | null>(null);
  const ready = job.status === 'PLAN_READY';

  const act = async (kind: 'feedback' | 'approve') => {
    setBusy(kind);
    try {
      onChange(kind === 'feedback' ? await outlineFeedback(job.id, feedback.trim()) : await approveOutline(job.id));
      setFeedback('');
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Worker không làm được việc này');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card flex flex-col gap-4">
      <div>
        <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600 }}>Dàn ý: {outline.title}</h2>
        <p style={{ margin: '4px 0 0' }}>{outline.logline}</p>
      </div>
      <ReviewCard title="Biên tập viên chấm dàn ý" review={story.outlineReview} polished={story.outlinePolished} />
      <dl className="sr-outline">
        <dt>Mở đầu (15 giây móc người xem)</dt><dd>{outline.coldOpen}</dd>
        {outline.beats.map((b, i) => (
          <React.Fragment key={i}>
            <dt>{i + 1}. {b.name}</dt>
            <dd>{b.summary} <span className="lg-meta">→ {b.turn}</span></dd>
          </React.Fragment>
        ))}
        <dt>Giữa tập</dt><dd>{outline.midpoint}</dd>
        <dt>Cao trào</dt><dd>{outline.climax}</dd>
        <dt>Cú móc cuối</dt><dd>{outline.cliffhanger}</dd>
        <dt>Câu hỏi mở / đóng</dt><dd>Mở: {outline.opened.join('; ') || 'không'}. Đóng: {outline.closed.join('; ') || 'không'}.</dd>
        <dt>Nhân vật chính đổi</dt><dd>{outline.change}</dd>
      </dl>
      {ready && (
        <>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Góp ý của bạn</label>
            <textarea rows={3} maxLength={1500} className="form-input" style={{ resize: 'vertical' }} placeholder="VD: cú lật đoán được quá sớm; cho Kha nói dối ở nhịp 3; kết bằng cảnh Linh thấy chính mình" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
          <div className="flex gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled={!!busy || !feedback.trim()} onClick={() => act('feedback')}>{busy === 'feedback' ? <Loader2 size={16} className="spin" /> : <MessageSquare size={16} />} Viết lại theo góp ý</button>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act('approve')}>{busy === 'approve' ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Duyệt, viết kịch bản</button>
          </div>
        </>
      )}
      {!ready && <p className="lg-meta flex align-center gap-2" style={{ margin: 0 }}><PenLine size={14} /> Dàn ý đã duyệt.</p>}
    </div>
  );
};
