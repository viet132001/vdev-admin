import React from 'react';
import { api, getErrorMessage } from '../../services/api';

// Team project ("Dự án nhóm") constants — mirrors TeamTaskStatus / TeamRole in vdev-be (src/doc/team-projects-api.md)
export const TEAM_STATUS = [
  { value: 'TODO', label: 'Cần làm', color: 'var(--text-muted)' },
  { value: 'IN_PROGRESS', label: 'Đang làm', color: 'var(--text-main)' },
  { value: 'IN_REVIEW', label: 'Chờ review', color: 'var(--warning)' },
  { value: 'BLOCKED', label: 'Bị chặn', color: 'var(--danger)' },
  { value: 'DONE', label: 'Done', color: 'var(--success)' },
  { value: 'CANCELLED', label: 'Đã huỷ', color: 'var(--text-muted)' }
];
export const OPEN_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'];

export const TEAM_ROLES = [
  { value: 'OWNER', label: 'Chủ dự án', hint: 'Toàn quyền, xoá dự án' },
  { value: 'MANAGER', label: 'Quản lý', hint: 'Mời người, sửa source / kế hoạch' },
  { value: 'MEMBER', label: 'Thành viên', hint: 'Tạo, nhận và cập nhật task' },
  { value: 'VIEWER', label: 'Người xem', hint: 'Chỉ xem' }
];

const ROLE_RANK: Record<string, number> = { OWNER: 4, MANAGER: 3, MEMBER: 2, VIEWER: 1 };

// UI convenience only: the backend checks the project role on every request
export const roleAtLeast = (role: string | undefined, min: string) => (ROLE_RANK[role || ''] || 0) >= ROLE_RANK[min];

export const teamStatusMeta = (status: string) => TEAM_STATUS.find((s) => s.value === status) || TEAM_STATUS[0];
export const roleLabel = (role: string) => TEAM_ROLES.find((r) => r.value === role)?.label || role;

export const TeamStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = teamStatusMeta(status);
  return (
    <span className="tw-tag neutral" style={{ color: meta.color }}>
      <span className="tw-column-dot" style={{ backgroundColor: meta.color, width: 6, height: 6 }} />
      {meta.label}
    </span>
  );
};

export const initials = (name: string | null | undefined) =>
  (name || '?').trim().split(/\s+/).slice(-2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';

export const Avatar: React.FC<{ name?: string | null; size?: number; title?: string }> = ({ name, size = 22, title }) => (
  <span className="pj-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} title={title || name || 'Chưa giao'}>
    {name ? initials(name) : '–'}
  </span>
);

export const ProgressBar: React.FC<{ value: number; height?: number }> = ({ value, height = 6 }) => (
  <div className="progress-bar-container" style={{ height }}>
    <div className="progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: value >= 100 ? 'var(--success)' : 'var(--primary)' }} />
  </div>
);

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// Plain-text dump of a task for pasting into any AI chat when MCP isn't set up
export const taskToMarkdown = (task: any, project: any) => {
  const lines = [
    `# ${task.key}: ${task.title}`,
    `Dự án: ${project.name} (${project.key})`,
    task.source ? `Source: ${task.source.key} — ${task.source.name}${task.source.repoUrl ? ` (${task.source.repoUrl})` : ''}${task.source.techStack ? ` · ${task.source.techStack}` : ''}` : '',
    `Trạng thái: ${teamStatusMeta(task.status).label} · Ưu tiên: ${task.priority}`,
    task.assignee ? `Người làm: ${task.assignee.fullName} <${task.assignee.email}>` : 'Người làm: chưa giao',
    task.dueDate ? `Hạn: ${new Date(task.dueDate).toISOString().slice(0, 10)}` : '',
    '',
    '## Mô tả',
    task.description?.trim() || '(chưa có mô tả)',
    '',
    '## Tiêu chí nghiệm thu',
    ...(task.acceptanceCriteria?.length ? task.acceptanceCriteria.map((c: string) => `- [ ] ${c}`) : ['(chưa có)'])
  ];
  return lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
};

export const aiPrompt = (task: any) =>
  `Làm task ${task.key} bằng MCP "vdev": gọi get_task("${task.key}") để đọc mô tả, tiêu chí và tài liệu; chuyển status IN_PROGRESS khi bắt đầu; làm xong thì update_task status IN_REVIEW kèm comment tóm tắt thay đổi và cách kiểm tra.`;

// Props every project tab receives from Projects.tsx
export interface ProjectTabProps {
  project: any;
  reloadProject: () => void;
  openTask: (ref: string | null) => void;
  /** Bumped when a task changes elsewhere (side panel) so the tab refetches */
  version: number;
}

export const useTasks = (projectId: string, version: number) => {
  const [tasks, setTasks] = React.useState<any[] | null>(null);
  const reload = React.useCallback(async () => {
    try {
      setTasks(await api.get(`/api/team-projects/${projectId}/tasks`, { noCache: true }));
    } catch (err) {
      setTasks([]);
      alert(getErrorMessage(err, 'Không tải được danh sách task'));
    }
  }, [projectId]);
  React.useEffect(() => { reload(); }, [reload, version]);
  return { tasks, reload, setTasks };
};

export const memberName = (project: any, userId: string | null | undefined) =>
  project.members.find((m: any) => m.userId === userId)?.fullName || 'Chưa giao';
