import React, { useEffect, useRef } from 'react';
import { CalendarDays, ChartGantt, List, SquareKanban, Table, AlertCircle } from 'lucide-react';

// Colors are CSS variables so they follow light / dark mode; only "done" and "urgent" carry a hue
export const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Chờ xử lý', color: 'var(--text-muted)' },
  { value: 'IN_PROGRESS', label: 'Đang làm', color: 'var(--text-main)' },
  { value: 'COMPLETED', label: 'Hoàn thành', color: 'var(--success)' },
  { value: 'CANCELLED', label: 'Đã hủy', color: 'var(--text-muted)' }
];

export const PRIORITY_OPTIONS = [
  { value: 'NONE', label: 'Không', color: 'var(--text-muted)' },
  { value: 'LOW', label: 'Thấp', color: 'var(--text-muted)' },
  { value: 'MEDIUM', label: 'Trung bình', color: 'var(--text-main)' },
  { value: 'HIGH', label: 'Cao', color: 'var(--warning)' },
  { value: 'URGENT', label: 'Khẩn cấp', color: 'var(--danger)' }
];

export const VIEW_TYPES = [
  { value: 'BOARD', label: 'Bảng', icon: SquareKanban },
  { value: 'LIST', label: 'Danh sách', icon: List },
  { value: 'TABLE', label: 'Bảng tính', icon: Table },
  { value: 'CALENDAR', label: 'Lịch', icon: CalendarDays },
  { value: 'TIMELINE', label: 'Dòng thời gian', icon: ChartGantt }
];

// Muted swatches for tags / columns / projects; grays first
export const COLOR_PRESETS = ['#71717a', '#a1a1aa', '#3f3f46', '#15803d', '#1d4ed8', '#b45309', '#b91c1c', '#7e22ce', '#0e7490', '#be185d'];

// Inbox has no columns/views on the server, so it gets fixed client-side views
export const INBOX_VIEWS = [
  { id: 'inbox-list', name: 'Danh sách', type: 'LIST', config: null },
  { id: 'inbox-table', name: 'Bảng tính', type: 'TABLE', config: null },
  { id: 'inbox-calendar', name: 'Lịch', type: 'CALENDAR', config: null }
];

export const statusMeta = (status: string) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
export const priorityMeta = (priority: string) => PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[0];

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

// ISO -> value for <input type="date">
export const toDateInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const ymd = (d: Date) => toDateInput(d.toISOString());

export const isOverdue = (task: any) =>
  !!task.deadline && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && new Date(task.deadline).getTime() < new Date().setHours(0, 0, 0, 0);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = statusMeta(status);
  return (
    <span className="tw-tag neutral" style={{ color: meta.color }}>
      <span className="tw-column-dot" style={{ backgroundColor: meta.color, width: 6, height: 6 }} />
      {meta.label}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  if (!priority || priority === 'NONE') return null;
  const meta = priorityMeta(priority);
  return <span className="tw-tag neutral" style={{ color: meta.color }}>{meta.label}</span>;
};

export const TagChip: React.FC<{ tag: any; onRemove?: () => void }> = ({ tag, onRemove }) => (
  <span className="tw-tag neutral" style={{ color: 'var(--text-main)' }}>
    <span className="tw-column-dot" style={{ backgroundColor: tag.color || 'var(--text-muted)', width: 6, height: 6 }} />
    {tag.name}
    {onRemove && (
      <button type="button" onClick={onRemove} style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
    )}
  </span>
);

// Small anchored menu that closes on outside click
export const Popover: React.FC<{ onClose: () => void; children: React.ReactNode; style?: React.CSSProperties }> = ({ onClose, children, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return <div ref={ref} className="tw-popover" style={style} onClick={(e) => e.stopPropagation()}>{children}</div>;
};

export interface ConfirmState {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  action: () => Promise<void> | void;
}

export const ConfirmDialog: React.FC<{ state: ConfirmState | null; onClose: () => void }> = ({ state, onClose }) => {
  if (!state) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="flex align-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertCircle size={20} />
            <h3 style={{ margin: 0 }}>{state.title}</h3>
          </div>
        </div>
        <div className="modal-body" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{state.message}</div>
        <div className="modal-footer" style={{ borderTop: 'none', backgroundColor: 'transparent' }}>
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await state.action();
              onClose();
            }}
          >
            {state.confirmLabel || 'Đồng ý'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Client-side filters shared by every view (board data is not paginated, so it is filtered here)
export interface TaskFilters {
  keyword: string;
  priority: string;
  tagId: string;
}

export const matchesFilters = (task: any, f: TaskFilters) => {
  if (f.keyword && !`${task.title} ${task.description || ''}`.toLowerCase().includes(f.keyword.toLowerCase())) return false;
  if (f.priority && task.priority !== f.priority) return false;
  if (f.tagId && !(task.tags || []).some((t: any) => t.id === f.tagId)) return false;
  return true;
};

export const filtersToQuery = (f: TaskFilters) => {
  const params = new URLSearchParams();
  if (f.keyword) params.set('keyword', f.keyword);
  if (f.priority) params.set('priority', f.priority);
  if (f.tagId) params.set('tagId', f.tagId);
  return params;
};
