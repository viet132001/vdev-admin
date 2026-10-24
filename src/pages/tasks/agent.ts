import { useCallback, useRef, useState } from 'react';

// Task Agent (Claude) — labels and helpers shared by the plan / review / settings screens. See src/doc/task-agent-mcp.md

export const PLAN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFTING: { label: 'Claude đang lập kế hoạch', color: 'var(--text-muted)' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', color: 'var(--warning)' },
  APPROVED: { label: 'Đã duyệt', color: 'var(--text-main)' },
  DONE: { label: 'Hoàn tất', color: 'var(--success)' },
  REJECTED: { label: 'Đã từ chối', color: 'var(--danger)' },
  CANCELLED: { label: 'Đã hủy', color: 'var(--text-muted)' }
};

export const RUN_STATUS: Record<string, { label: string; color: string }> = {
  QUEUED: { label: 'Đang chờ máy chạy', color: 'var(--text-muted)' },
  RUNNING: { label: 'Đang chạy', color: 'var(--warning)' },
  SUCCEEDED: { label: 'Thành công', color: 'var(--success)' },
  FAILED: { label: 'Lỗi', color: 'var(--danger)' },
  CANCELLED: { label: 'Đã hủy', color: 'var(--text-muted)' }
};

export const RUN_TYPE: Record<string, string> = { PLAN: 'Lập kế hoạch', EXECUTE: 'Thực hiện', REWORK: 'Làm lại', TEST: 'Chạy test lại', ROLLBACK: 'Rollback' };

export const RUN_ERROR: Record<string, string> = {
  RUNNER_LOST: 'Mất kết nối với máy chạy',
  RUNNER_STOPPED: 'Máy chạy bị tắt giữa chừng',
  PLAN_NOT_SUBMITTED: 'Claude kết thúc mà chưa gửi kế hoạch'
};

/** BE codes ("RUNNER_LOST") or runner errors in the form "CODE: message" (e.g. "USAGE_LIMIT: Claude hết hạn mức…") */
export const runErrorText = (error: string | null | undefined) => {
  if (!error) return '';
  if (RUN_ERROR[error]) return RUN_ERROR[error];
  const coded = /^[A-Z_]+: ([\s\S]+)$/.exec(error);
  return coded ? coded[1] : error;
};

// Review notes: section 12 statuses when the BE supports them, otherwise derived from resolvedInRevision
export const NOTE_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Góp ý mới', color: 'var(--warning)' },
  ADDRESSED: { label: 'Claude đã thực hiện', color: 'var(--text-main)' },
  FOLLOW_UP: { label: 'Góp thêm', color: 'var(--warning)' },
  RESOLVED: { label: 'Đã đóng', color: 'var(--success)' }
};

export const noteStatus = (note: any): string =>
  note.status || (note.resolvedInRevision || note.addressedInRevision ? 'ADDRESSED' : 'OPEN');

export const isNoteOpen = (note: any) => ['OPEN', 'FOLLOW_UP'].includes(noteStatus(note));

export const isActiveRun = (run: any) => !!run && (run.status === 'QUEUED' || run.status === 'RUNNING');

export const AGENT_SETTINGS_DEFAULT = {
  enabled: true,
  testCommand: null as string | null,
  lintCommand: null as string | null,
  buildCommand: null as string | null,
  excludePatterns: ['.env*', '*.pem', '*.key', 'node_modules/', 'dist/'],
  contextPaths: [] as string[],
  maxTurnsPerTask: 40,
  maxBudgetUsdPerRun: 5,
  previewUrl: null as string | null,
  previewLoginPath: null as string | null,
  previewUsername: null as string | null,
  previewApplyCommand: null as string | null
};

export const agentSettingsOf = (project: any) => ({ ...AGENT_SETTINGS_DEFAULT, ...(project?.agentSettings || {}) });

/**
 * Runs one action at a time and exposes which one is in flight, so buttons can show a loading state.
 * The ref blocks a second call even before React re-renders the disabled button (double click).
 */
export const useBusy = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const run = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(key);
    try {
      return await action();
    } finally {
      running.current = false;
      setBusy(null);
    }
  }, []);
  return { busy, run };
};

export const formatRelative = (iso: string | null | undefined) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};
