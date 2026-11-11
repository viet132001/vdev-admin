import React from 'react';
import { ExternalLink, Eye, Heart, MessageCircle, Play, RotateCcw } from 'lucide-react';
import type { FacebookContent } from './lessonWorker';
import { formatWhen } from './schedule';

const MAX_SHOWN = 6;

const number = (value: number | null) => (value === null ? '—' : value.toLocaleString('vi-VN'));
const seconds = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây`);

interface FacebookOverviewProps {
  content: FacebookContent | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenVideo: (jobId: string) => void;
}

// The channel's latest Reels as Meta Business Suite counts them, so a week can be planned from what worked
export const FacebookOverview: React.FC<FacebookOverviewProps> = ({ content, error, loading, onRefresh, onOpenVideo }) => {
  const reels = content?.reels ?? [];
  const sum = (pick: (reel: (typeof reels)[number]) => number | null) => {
    const known = reels.map(pick).filter((value): value is number => value !== null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };
  const likes = sum((reel) => reel.likes);
  const comments = sum((reel) => reel.comments);
  const interactions = likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0);
  const watched = reels.map((reel) => reel.avgWatchSeconds).filter((value): value is number => value !== null);
  const avgWatch = watched.length ? watched.reduce((a, b) => a + b, 0) / watched.length : null;

  return (
    <div className="fb-overview">
      <div className="flex justify-between align-center" style={{ gap: 8 }}>
        <strong style={{ fontSize: '0.9rem' }}>Trên Facebook</strong>
        <button className="btn btn-secondary btn-sm" disabled={loading} onClick={onRefresh} title="Đọc lại page và cập nhật lịch đăng">
          <RotateCcw size={14} className={loading ? 'spin' : undefined} /> Cập nhật từ Facebook
        </button>
      </div>
      {error && <p className="lg-error" style={{ margin: '8px 0 0' }}>{error}</p>}
      {!error && content && (
        <>
          <div className="fb-stats">
            <div><Eye size={16} /><strong>{number(sum((reel) => reel.views))}</strong><span>Lượt xem</span></div>
            <div><Play size={16} /><strong>{seconds(avgWatch === null ? null : Math.round(avgWatch * 10) / 10)}</strong><span>Xem trung bình</span></div>
            <div><MessageCircle size={16} /><strong>{number(interactions)}</strong><span>Tương tác</span></div>
          </div>
          <p className="lg-meta" style={{ margin: '6px 0 0' }}>
            {reels.length} Reels gần nhất · {content.scheduled.length} bài đã lên lịch · cập nhật lúc {formatWhen(content.fetchedAt)}
            {!content.watchTime && <> · Thời gian xem cần quyền <code>read_insights</code>: tạo token page có quyền này rồi Đổi token ở Quản lý kênh.</>}
          </p>
          {reels.length > 0 && (
            <div className="fb-reels">
              {reels.slice(0, MAX_SHOWN).map((reel) => (
                <div key={reel.videoId} className="fb-reel">
                  {reel.picture ? <img src={reel.picture} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="fb-reel-thumb" />}
                  <div style={{ minWidth: 0 }}>
                    {reel.jobId
                      ? <button className="lg-link sc-title" onClick={() => onOpenVideo(reel.jobId!)}>{reel.title}</button>
                      : <div className="sc-title">{reel.title}</div>}
                    <div className="sc-status">
                      <Eye size={12} /> {number(reel.views)} · <Heart size={12} /> {number(reel.likes)} · <MessageCircle size={12} /> {number(reel.comments)}
                      {reel.avgWatchSeconds !== null && <> · xem TB {seconds(reel.avgWatchSeconds)}</>}
                    </div>
                    <div className="sc-status">
                      {reel.postedAt ? formatWhen(reel.postedAt) : ''}{!reel.jobId && ' · đăng ngoài VDEV'}
                      {reel.permalink && <> · <a href={reel.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Xem</a></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!error && !content && loading && <div className="loading-container"><span className="spinner"></span></div>}
    </div>
  );
};
