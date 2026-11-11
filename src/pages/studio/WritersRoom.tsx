import React, { useState } from 'react';
import { Check, Copy, Lightbulb, Loader2 } from 'lucide-react';
import { WRITER_NAME, brainstormComedy, type ComedyIdea, type ComedyPackaging, type ComedyWriter, type WritersRoom } from '../dictation/lessonWorker';

const STEPS: { id: WritersRoom['step']; label: string }[] = [
  { id: 'drafting', label: 'Cả hai viết nháp' },
  { id: 'reviewing', label: 'Chấm chéo' },
  { id: 'polishing', label: 'Sửa bản thắng' },
  { id: 'packaging', label: 'Đóng gói YouTube' }
];

// Where the room is while the job is PLANNING; nothing yet means the drafts are being written
export const RoomProgress: React.FC<{ room?: WritersRoom }> = ({ room }) => {
  const current = STEPS.findIndex((s) => s.id === (room?.step ?? 'drafting'));
  return (
    <div className="card flex flex-col gap-2">
      <ol className="st-steps">
        {STEPS.map((step, i) => {
          const skipped = step.id === 'polishing' && i < current && !room?.polished;
          const state = i < current ? 'done' : i === current ? 'current' : '';
          return (
            <li key={step.id} className={`st-step ${state}`}>
              {i < current ? <Check size={14} /> : i === current ? <Loader2 size={14} className="spin" /> : <span style={{ width: 14 }} />}
              {step.label}{skipped ? ' (không cần)' : ''}
            </li>
          );
        })}
      </ol>
      <p className="lg-meta" style={{ margin: 0 }}>Claude và Codex viết cùng ý tưởng, chấm bản của nhau, bản điểm cao hơn được sửa theo góp ý rồi Codex viết tiêu đề, mô tả, tag cho YouTube. Thường mất 3–6 phút.</p>
    </div>
  );
};

// Both drafts with the other writer's review; the page can switch to the one it prefers
export const RoomPanel: React.FC<{ room: WritersRoom; canPick: boolean; busy: boolean; onPick: (by: ComedyWriter) => void }> = ({ room, canPick, busy, onPick }) => (
  <div className="card flex flex-col gap-2">
    <div>
      <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Phòng biên kịch</h2>
      <p className="lg-meta" style={{ margin: '2px 0 0' }}>
        {room.winner ? `Đang dùng bản của ${WRITER_NAME[room.winner]}` : 'Chưa chọn bản nào'}
        {room.polished ? ', đã sửa một lượt theo góp ý của người chấm.' : '.'} Đổi sang bản kia thì các chỉnh sửa tay chưa lưu sẽ mất.
      </p>
    </div>
    <div className="st-room">
      {room.drafts.map((draft) => {
        const using = draft.by === room.winner;
        return (
          <div key={draft.by} className={`st-draft${using ? ' winner' : ''}`}>
            <div className="flex justify-between align-center gap-2">
              <b>{WRITER_NAME[draft.by]}</b>
              {using && <span className="badge badge-info">Đang dùng</span>}
            </div>
            {!draft.script && <p className="lg-error" style={{ margin: 0 }}>Không viết được: {draft.error}</p>}
            {draft.script && (
              <>
                <span>{draft.script.title}</span>
                {draft.review ? (
                  <>
                    <span><span className="st-score">{draft.review.score}</span>/10 <span className="lg-meta">· {WRITER_NAME[draft.review.by]} chấm</span></span>
                    {draft.review.verdict && <span style={{ fontSize: '0.85rem' }}>{draft.review.verdict}</span>}
                    {draft.review.keep && <span className="lg-meta" style={{ margin: 0 }}>Giữ: {draft.review.keep}</span>}
                    {draft.review.fix.length > 0 && <ul>{draft.review.fix.map((f) => <li key={f}>{f}</li>)}</ul>}
                  </>
                ) : <span className="lg-meta" style={{ margin: 0 }}>Chưa được chấm.</span>}
                {!using && canPick && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => onPick(draft.by)}>Dùng bản này</button>}
              </>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button className="icon-btn" title="Chép" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }).catch(() => undefined)}>
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

// What the channel shows around the video: filled into the publish form, the rest is for the thumbnail and the hook
export const PackagingCard: React.FC<{ packaging: ComedyPackaging }> = ({ packaging }) => (
  <div className="card st-pack">
    <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Đóng gói cho YouTube</h2>
    <p className="lg-meta" style={{ margin: '2px 0 0' }}>{WRITER_NAME[packaging.by]} viết. Tiêu đề và mô tả đã điền sẵn vào form đăng.</p>
    <dl style={{ margin: 0 }}>
      <dt>Tiêu đề</dt><dd>{packaging.title}</dd>
      {packaging.hook && <><dt>Chữ ở giây đầu</dt><dd>{packaging.hook}</dd></>}
      {packaging.thumbnail && <><dt>Chữ trên ảnh bìa</dt><dd>{packaging.thumbnail}</dd></>}
      <dt>Mô tả</dt><dd>{packaging.description}</dd>
      {packaging.tags.length > 0 && (
        <>
          <dt className="flex align-center gap-2">Tag <CopyButton text={packaging.tags.join(', ')} /></dt>
          <dd className="st-tags">{packaging.tags.map((t) => <span key={t} className="badge">{t}</span>)}</dd>
        </>
      )}
    </dl>
  </div>
);

// Ideas for the next episodes from both writers, knowing what the channel already has
export const IdeaBoard: React.FC<{ onUse: (idea: ComedyIdea) => void }> = ({ onUse }) => {
  const [theme, setTheme] = useState('');
  const [ideas, setIdeas] = useState<ComedyIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brainstorm = async () => {
    setLoading(true);
    setError(null);
    try {
      setIdeas(await brainstormComedy(theme.trim()));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Chưa lấy được ý tưởng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: '1 1 220px' }} maxLength={300} placeholder="Chủ đề cho kênh (tuỳ chọn), VD: đi làm, hẹn hò, du lịch" value={theme} onChange={(e) => setTheme(e.target.value)} />
        <button type="button" className="btn btn-secondary" disabled={loading} onClick={brainstorm}>{loading ? <Loader2 size={16} className="spin" /> : <Lightbulb size={16} />} {loading ? 'Đang nghĩ...' : 'Gợi ý ý tưởng'}</button>
      </div>
      {error && <p className="lg-error" style={{ margin: 0 }}>{error}</p>}
      {ideas.length > 0 && (
        <div className="st-ideas">
          {ideas.map((idea, i) => (
            <div key={i} className="st-idea">
              <span className="badge">{WRITER_NAME[idea.by]}</span>
              <span style={{ fontSize: '0.9rem' }}>{idea.idea}</span>
              {idea.why && <span className="lg-meta" style={{ margin: 0 }}>{idea.why}</span>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUse(idea)}>Dùng ý tưởng này</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
