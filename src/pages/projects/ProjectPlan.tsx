import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, formatDate, toDateInput, type ConfirmState } from '../tasks/shared';
import { Avatar, OPEN_STATUSES, ProgressBar, TeamStatusBadge, roleAtLeast, useTasks, type ProjectTabProps } from './shared';

const MilestoneForm: React.FC<{ project: any; milestone?: any; onClose: () => void; onSaved: () => void }> = ({ project, milestone, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: milestone?.name || '',
    description: milestone?.description || '',
    startDate: toDateInput(milestone?.startDate),
    dueDate: toDateInput(milestone?.dueDate)
  });
  const { busy, run } = useBusy();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const body = { name: form.name.trim(), description: form.description.trim() || null, startDate: form.startDate || null, dueDate: form.dueDate || null };
      try {
        if (milestone) await api.patch(`/api/team-projects/${project.id}/milestones/${milestone.id}`, body);
        else await api.post(`/api/team-projects/${project.id}/milestones`, body);
        onSaved();
      } catch (err) {
        alert(getErrorMessage(err, 'Không lưu được milestone'));
      }
    });
  };
  return (
    <div className="modal-overlay">
      <form className="modal-content" style={{ maxWidth: 480 }} onSubmit={submit}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{milestone ? 'Sửa milestone' : 'Thêm milestone'}</h3>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          <div className="form-group">
            <label className="form-label">Tên <span className="form-required">*</span></label>
            <input className="form-input" required value={form.name} placeholder="Sprint 1 — MVP" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Mục tiêu</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="pj-form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Bắt đầu</label>
              <input type="date" className="form-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Hạn chót</label>
              <input type="date" className="form-input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={!!busy}>Lưu</button>
        </div>
      </form>
    </div>
  );
};

export const ProjectPlan: React.FC<ProjectTabProps> = ({ project, reloadProject, openTask, version }) => {
  const { tasks } = useTasks(project.id, version);
  const [editing, setEditing] = useState<any>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const canManage = roleAtLeast(project.myRole, 'MANAGER');
  const today = new Date().setHours(0, 0, 0, 0);

  if (!tasks) return <div className="loading-container"><span className="spinner" /> Đang tải...</div>;

  const groups = [...project.milestones, { id: null, name: 'Chưa xếp milestone' }];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex align-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {project.startDate ? `Bắt đầu ${formatDate(project.startDate)} · ` : ''}{project.targetDate ? `Mục tiêu ${formatDate(project.targetDate)}` : 'Chưa đặt ngày mục tiêu'}
        </span>
        {canManage && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Plus size={14} /> Thêm milestone</button>}
      </div>

      {groups.map((m: any) => {
        const list = tasks.filter((t) => (t.milestoneId || null) === m.id);
        if (m.id === null && list.length === 0) return null;
        const counted = list.filter((t) => t.status !== 'CANCELLED');
        const done = counted.filter((t) => t.status === 'DONE').length;
        const progress = counted.length ? Math.round((done / counted.length) * 100) : 0;
        const late = m.dueDate && new Date(m.dueDate).getTime() < today && progress < 100;
        return (
          <div key={m.id || 'none'} className="card flex flex-col gap-2">
            <div className="flex align-center justify-between gap-2">
              <div style={{ minWidth: 0 }}>
                <b>{m.name}</b>
                <div style={{ fontSize: '0.75rem', color: late ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {m.startDate ? `${formatDate(m.startDate)} → ` : ''}{m.dueDate ? `hạn ${formatDate(m.dueDate)}` : m.id ? 'chưa có hạn' : ''}{late ? ' · trễ kế hoạch' : ''}
                  {' · '}{done}/{counted.length} Done
                </div>
              </div>
              {canManage && m.id && (
                <div className="flex gap-1">
                  <button className="icon-btn" title="Sửa" onClick={() => setEditing(m)}><Pencil size={14} /></button>
                  <button className="icon-btn danger" title="Xoá" onClick={() => setConfirm({
                    title: `Xoá milestone "${m.name}"?`,
                    message: 'Task trong milestone vẫn giữ nguyên, chỉ bỏ gắn milestone.',
                    confirmLabel: 'Xoá',
                    action: async () => {
                      try { await api.delete(`/api/team-projects/${project.id}/milestones/${m.id}`); reloadProject(); }
                      catch (err) { alert(getErrorMessage(err, 'Không xoá được milestone')); }
                    }
                  })}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            {m.description && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{m.description}</span>}
            {m.id && <ProgressBar value={progress} />}
            <div className="flex flex-col">
              {list
                .sort((a, b) => Number(!OPEN_STATUSES.includes(a.status)) - Number(!OPEN_STATUSES.includes(b.status)) || (a.dueDate || '9').localeCompare(b.dueDate || '9'))
                .map((t) => (
                  <button key={t.id} className="pj-mini" onClick={() => openTask(t.key)}>
                    <span className="pj-task-key">{t.key}</span>
                    <span className="pj-mini-title">{t.title}</span>
                    {t.source && <span className="tw-tag neutral">{t.source.key}</span>}
                    <TeamStatusBadge status={t.status} />
                    <Avatar name={t.assignee?.fullName} size={20} />
                    <span className={t.isOverdue ? 'tw-overdue' : ''} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 72, textAlign: 'right' }}>{formatDate(t.dueDate) || '—'}</span>
                  </button>
                ))}
              {list.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có task. Chọn milestone khi tạo / sửa task.</span>}
            </div>
          </div>
        );
      })}

      {editing && (
        <MilestoneForm project={project} milestone={editing.id ? editing : undefined} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadProject(); }} />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
