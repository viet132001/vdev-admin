import React from 'react';
import type { LiveMode } from './live';

const LABEL: Record<LiveMode, { text: string; color: string; title: string }> = {
  live: { text: 'Trực tiếp', color: 'var(--success)', title: 'Thay đổi từ người khác và Claude hiện ngay' },
  polling: { text: 'Tự làm mới', color: 'var(--text-muted)', title: 'Làm mới mỗi 20 giây khi tab đang mở' },
  connecting: { text: 'Đang nối...', color: 'var(--text-muted)', title: 'Đang kết nối kênh cập nhật' },
  offline: { text: 'Mất kết nối', color: 'var(--danger)', title: 'Đang thử nối lại' }
};

// Small status dot next to the project title: tells the user whether the screen updates by itself
export const LiveBadge: React.FC<{ mode: LiveMode }> = ({ mode }) => {
  const m = LABEL[mode];
  return (
    <span className="tw-tag neutral" style={{ color: m.color }} title={m.title}>
      <span className="tw-column-dot" style={{ backgroundColor: m.color, width: 6, height: 6 }} />
      {m.text}
    </span>
  );
};
