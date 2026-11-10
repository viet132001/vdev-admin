import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { PRIORITY_OPTIONS, PriorityBadge, formatDate } from '../tasks/shared';
import { Avatar, OPEN_STATUSES, TEAM_STATUS, TeamStatusBadge, roleAtLeast, useTasks, type ProjectTabProps } from './shared';

const VIEWS = [
  { value: 'board', label: 'Bảng trạng thái' },
  { value: 'source', label: 'Theo source' },
  { value: 'list', label: 'Danh sách' }
];

const DESCRIPTION_TEMPLATE = `## Bối cảnh
Vì sao cần làm, liên quan tính năng / màn hình nào.

## Yêu cầu
-

## Hướng dẫn kỹ thuật
- API / màn hình / file liên quan:
- Lưu ý:
`;

export const TaskFormModal: React.FC<{
  project: any;
  initial?: Record<string, any>;
  onClose: () => void;
  onCreated: (task: any) => void;
}> = ({ project, initial, onClose, onCreated }) => {
  const [form, setForm] = useState({
    title: '', description: DESCRIPTION_TEMPLATE, criteria: '', priority: 'MEDIUM', sourceId: '', assigneeId: '',
    milestoneId: '', startDate: '', dueDate: '', estimateHours: '', ...initial
  });
  const { busy, run } = useBusy();
  const assignable = project.members.filter((m: any) => roleAtLeast(m.role, 'MEMBER'));
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const task = await api.post(`/api/team-projects/${project.id}/tasks`, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          acceptanceCriteria: form.criteria.split('\n').map((c: string) => c.replace(/^\s*[-*]\s*(\[ \]\s*)?/, '').trim()).filter(Boolean),
          priority: form.priority,
          sourceId: form.sourceId || undefined,
          assigneeId: form.assigneeId || undefined,
          milestoneId: form.milestoneId || undefined,
          startDate: form.startDate || undefined,
          dueDate: form.dueDate || undefined,
          estimateHours: form.estimateHours ? Number(form.estimateHours) : undefined
        });
        onCreated(task);
      } catch (err) {
        alert(getErrorMessage(err, 'Không tạo được task'));
      }
    });
  };

  return (
    <div className="modal-overlay">
      <form className="modal-content" style={{ maxWidth: 680 }} onSubmit={submit}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Tạo task · {project.key}</h3>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          <div className="form-group">
            <label className="form-label">Tiêu đề <span className="form-required">*</span></label>
            <input className="form-input" required autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="API đăng nhập bằng Google" />
          </div>
          <div className="pj-form-grid">
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-input" value={form.sourceId} onChange={(e) => set({ sourceId: e.target.value })}>
                <option value="">— Không —</option>
                {project.sources.map((s: any) => <option key={s.id} value={s.id}>{s.key} · {s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Người làm</label>
              <select className="form-input" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
                <option value="">— Chưa giao —</option>
                {assignable.map((m: any) => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ưu tiên</label>
              <select className="form-input" value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Milestone</label>
              <select className="form-input" value={form.milestoneId} onChange={(e) => set({ milestoneId: e.target.value })}>
                <option value="">— Không —</option>
                {project.milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bắt đầu</label>
              <input type="date" className="form-input" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Deadline</label>
              <input type="date" className="form-input" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Ước lượng (giờ)</label>
              <input type="number" min={0} step={0.5} className="form-input" value={form.estimateHours} onChange={(e) => set({ estimateHours: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả (Markdown) — viết đủ để người hoặc AI làm được ngay</label>
            <textarea className="form-input pj-mono" rows={10} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Tiêu chí nghiệm thu (mỗi dòng một tiêu chí)</label>
            <textarea className="form-input" rows={3} value={form.criteria} placeholder={'Đăng nhập Google trả JWT\nEmail chưa xác minh bị từ chối'} onChange={(e) => set({ criteria: e.target.value })} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy ? 'Đang tạo...' : 'Tạo task'}</button>
        </div>
      </form>
    </div>
  );
};

const TaskCard: React.FC<{ task: any; onOpen: () => void; draggable?: boolean; showStatus?: boolean }> = ({ task, onOpen, draggable, showStatus }) => (
  <div
    className="tw-card"
    draggable={draggable}
    onDragStart={(e) => e.dataTransfer.setData('text/task', task.id)}
    onClick={onOpen}
  >
    <div className="flex align-center gap-2" style={{ marginBottom: 4 }}>
      <span className="pj-task-key">{task.key}</span>
      {task.source && <span className="tw-tag neutral">{task.source.key}</span>}
      {showStatus && <TeamStatusBadge status={task.status} />}
    </div>
    <div style={{ fontWeight: 500 }}>{task.title}</div>
    <div className="tw-card-meta">
      <Avatar name={task.assignee?.fullName} size={18} />
      <PriorityBadge priority={task.priority} />
      {task.dueDate && <span className={task.isOverdue ? 'tw-overdue' : ''}>{formatDate(task.dueDate)}</span>}
      {task.milestone && <span>{task.milestone.name}</span>}
      {task.commentCount > 0 && <span>{task.commentCount} bình luận</span>}
      {task.docCount > 0 && <span>{task.docCount} tài liệu</span>}
    </div>
  </div>
);

export const ProjectTasks: React.FC<ProjectTabProps> = ({ project, openTask, version }) => {
  const { tasks, reload, setTasks } = useTasks(project.id, version);
  const [view, setView] = useState('board');
  const [filters, setFilters] = useState({ q: '', sourceId: '', assigneeId: '', milestoneId: '', showDone: true });
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const canEdit = roleAtLeast(project.myRole, 'MEMBER');

  const filtered = useMemo(() => (tasks || []).filter((t) => {
    const q = filters.q.trim().toLowerCase();
    if (q && !`${t.key} ${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (filters.sourceId && (filters.sourceId === 'none' ? t.sourceId : t.sourceId !== filters.sourceId)) return false;
    if (filters.assigneeId && (filters.assigneeId === 'none' ? t.assigneeId : t.assigneeId !== filters.assigneeId)) return false;
    if (filters.milestoneId && (filters.milestoneId === 'none' ? t.milestoneId : t.milestoneId !== filters.milestoneId)) return false;
    if (!filters.showDone && !OPEN_STATUSES.includes(t.status)) return false;
    return true;
  }), [tasks, filters]);

  const moveTo = async (taskId: string, status: string) => {
    const task = tasks?.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    // Optimistic: board feels instant, reload restores the truth on error
    setTasks((prev) => prev && prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await api.patch(`/api/team-tasks/${taskId}`, { status });
      reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Không đổi được trạng thái'));
      reload();
    }
  };

  if (!tasks) return <div className="loading-container"><span className="spinner" /> Đang tải task...</div>;

  const groups = [
    ...project.sources.map((s: any) => ({ id: s.id, label: `${s.key} · ${s.name}`, lead: s.lead })),
    { id: null, label: 'Chưa gắn source', lead: null }
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="tw-toolbar">
        <div className="pj-search">
          <Search size={14} />
          <input className="form-input" placeholder="Tìm theo mã, tiêu đề..." value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className="form-input" style={{ width: 'auto' }} value={filters.sourceId} onChange={(e) => setFilters({ ...filters, sourceId: e.target.value })}>
          <option value="">Mọi source</option>
          {project.sources.map((s: any) => <option key={s.id} value={s.id}>{s.key}</option>)}
          <option value="none">Chưa gắn source</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={filters.assigneeId} onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}>
          <option value="">Mọi người</option>
          {project.members.map((m: any) => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
          <option value="none">Chưa giao</option>
        </select>
        {project.milestones.length > 0 && (
          <select className="form-input" style={{ width: 'auto' }} value={filters.milestoneId} onChange={(e) => setFilters({ ...filters, milestoneId: e.target.value })}>
            <option value="">Mọi milestone</option>
            {project.milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="none">Không milestone</option>
          </select>
        )}
        <label className="flex align-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={filters.showDone} onChange={(e) => setFilters({ ...filters, showDone: e.target.checked })} /> Hiện task đã xong
        </label>
        <div className="tw-segmented" style={{ marginLeft: 'auto' }}>
          {VIEWS.map((v) => <button key={v.value} className={view === v.value ? 'active' : ''} onClick={() => setView(v.value)}>{v.label}</button>)}
        </div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> Tạo task</button>}
      </div>

      {tasks.length === 0 && (
        <div className="empty-state">
          <div style={{ fontWeight: 600 }}>Chưa có task nào</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tạo task ở đây, hoặc nhờ Claude qua MCP: "tạo task cho dự án {project.key}".</div>
        </div>
      )}

      {tasks.length > 0 && view === 'board' && (
        <div className="tw-board" style={{ overflowX: 'auto' }}>
          {TEAM_STATUS.filter((s) => filters.showDone || OPEN_STATUSES.includes(s.value)).map((s) => {
            const list = filtered.filter((t) => t.status === s.value);
            return (
              <div
                key={s.value}
                className={`tw-column ${dragOver === s.value ? 'drag-over' : ''}`}
                onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(s.value); } }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); moveTo(e.dataTransfer.getData('text/task'), s.value); }}
              >
                <div className="tw-column-header">
                  <span className="tw-column-dot" style={{ backgroundColor: s.color }} /> {s.label}
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontWeight: 400 }}>{list.length}</span>
                </div>
                <div className="tw-column-body">
                  {list.map((t) => <TaskCard key={t.id} task={t} draggable={canEdit} onOpen={() => openTask(t.key)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tasks.length > 0 && view === 'source' && (
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const list = filtered.filter((t) => (t.sourceId || null) === g.id);
            if (g.id === null && list.length === 0) return null;
            const byAssignee = new Map<string, any[]>();
            list.forEach((t) => {
              const k = t.assigneeId || '';
              byAssignee.set(k, [...(byAssignee.get(k) || []), t]);
            });
            return (
              <div key={g.id || 'none'} className="card flex flex-col gap-2">
                <div className="flex align-center justify-between">
                  <b>{g.label}</b>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{g.lead ? `Phụ trách: ${g.lead.fullName} · ` : ''}{list.length} task</span>
                </div>
                {list.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Không có task.</span>}
                {[...byAssignee.entries()].map(([assigneeId, items]) => (
                  <div key={assigneeId || 'none'} className="pj-assignee-group">
                    <div className="flex align-center gap-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      <Avatar name={items[0].assignee?.fullName} size={20} /> {items[0].assignee?.fullName || 'Chưa giao'}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{items.filter((t) => OPEN_STATUSES.includes(t.status)).length} đang mở</span>
                    </div>
                    <div className="pj-card-grid">
                      {items.map((t) => <TaskCard key={t.id} task={t} showStatus onOpen={() => openTask(t.key)} />)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tasks.length > 0 && view === 'list' && (
        <div className="table-container">
          <table>
            <thead><tr><th>Mã</th><th>Tiêu đề</th><th>Source</th><th>Người làm</th><th>Trạng thái</th><th>Ưu tiên</th><th>Deadline</th><th>Milestone</th></tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTask(t.key)}>
                  <td className="pj-task-key">{t.key}</td>
                  <td style={{ fontWeight: 500 }}>{t.title}</td>
                  <td>{t.source?.key || '—'}</td>
                  <td>{t.assignee?.fullName || <span style={{ color: 'var(--text-muted)' }}>Chưa giao</span>}</td>
                  <td><TeamStatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td className={t.isOverdue ? 'tw-overdue' : ''}>{formatDate(t.dueDate) || '—'}</td>
                  <td>{t.milestone?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <TaskFormModal
          project={project}
          initial={{ sourceId: filters.sourceId && filters.sourceId !== 'none' ? filters.sourceId : '' }}
          onClose={() => setCreating(false)}
          onCreated={(task) => { setCreating(false); reload(); openTask(task.key); }}
        />
      )}
    </div>
  );
};
