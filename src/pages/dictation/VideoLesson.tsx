import React from 'react';
import { ArrowRight, BookOpen, ExternalLink, Pencil, Video } from 'lucide-react';
import { useAuth, hasRole } from '../../context/AuthContext';
import { parseVideo } from './video';

interface VideoLessonProps {
  lessonId: string;
  title: string;
  videoUrl: string | null;
  hasSentences: boolean;
  onEdit: () => void;
  onReading: () => void;
}

export const VideoLesson: React.FC<VideoLessonProps> = ({ lessonId, title, videoUrl, hasSentences, onEdit, onReading }) => {
  const { user } = useAuth();
  const video = parseVideo(videoUrl);

  if (!video) {
    return (
      <div className="empty-state">
        <Video className="empty-state-icon" size={32} />
        <p>Chủ đề này chưa có video bài học.</p>
        <button className="btn btn-primary mt-4" onClick={onEdit}>Thêm link video</button>
        {hasSentences && hasRole(user, 'ADMIN') && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
            Hoặc tạo video từ các câu của chủ đề, chạy trong thư mục <code>vdev-video</code>:<br />
            <code>pnpm render {lessonId}</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dc-video">
      {video.kind === 'link' ? (
        <div className="empty-state">
          <Video className="empty-state-icon" size={32} />
          <p>Trang này không cho xem video ngay trong ứng dụng.</p>
          <a className="btn btn-primary mt-4" href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Mở video</a>
        </div>
      ) : (
        <div className="dc-video-frame">
          {video.kind === 'embed' ? (
            // YouTube refuses to play without a referrer, so don't use no-referrer here
            <iframe
              src={video.url}
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <video src={video.url} controls playsInline preload="metadata" />
          )}
        </div>
      )}
      <div className="flex justify-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={onEdit}><Pencil size={14} /> Đổi video</button>
        {hasSentences && (
          <button className="btn btn-primary btn-sm" onClick={onReading}><BookOpen size={14} /> Sang bài đọc <ArrowRight size={14} /></button>
        )}
      </div>
    </div>
  );
};
