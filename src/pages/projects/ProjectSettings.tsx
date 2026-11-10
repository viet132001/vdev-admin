import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, toDateInput, type ConfirmState } from '../tasks/shared';
import { roleAtLeast, type ProjectTabProps } from './shared';

const EMPTY_SOURCE = { key: '', name: '', description: '', repoUrl: '', techStack: '', leadId: '' };

const SourceForm: React.FC<{ project: any; source?: any; onClose: () => void; onSaved: () => void }> = ({ project, source, onClose, onSaved }) => {
  const [form, setForm] = useState(source ? {
    key: source.key, name: source.name, description: source.description || '', repoUrl: source.repoUrl || '', techStack: source.techStack || '', leadId: source.leadId || ''
  } : EMPTY_SOURCE);
  const { busy, run } = useBusy();
  const leads = project.members.filter((m: any) => roleAtLeast(m.role, 'MEMBER'));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const body = {
        key: form.key.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() || null,
        repoUrl: form.repoUrl.trim() || null, techStack: form.techStack.trim() || null, leadId: form.leadId || null
      };
      try {
        if (source) await api.patch(`/api/team-projects/${project.id}/sources/${source.id}`, body);
        else await api.post(`/api/team-projects/${project.id}/sources`, body);
        onSaved();
      } catch (err) {
        alert(getErrorMessage(err, 'Không lưu được source'));
      }
    });
  };
  return (
    <div className="modal-overlay">
      <form className="modal-content" style={{ maxWidth: 540 }} onSubmit={submit}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{source ? `Sửa source ${source.key}` : 'Thêm source'}</h3>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          <div className="pj-form-row">
            <div className="form-group" style={{ flex: '0 0 120px' }}>
              <label className="form-label">Mã <span className="form-required">*</span></label>
              <input className="form-input" required maxLength={16} placeholder="BE" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tên <span className="form-required">*</span></label>
              <input className="form-input" required placeholder="Backend NestJS" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Repo</label>
            <input className="form-input" placeholder="https://github.com/org/repo" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Công nghệ</label>
            <input className="form-input" placeholder="NestJS, Prisma, PostgreSQL" value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phụ trách</label>
            <select className="form-input" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">— Không —</option>
              {leads.map((m: any) => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Phạm vi / ghi chú cho AI (Markdown)</label>
            <textarea className="form-input pj-mono" rows={5} placeholder="Cấu trúc thư mục, lệnh chạy, quy ước... Được gửi kèm mọi task của source qua MCP."
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

export const ProjectSettings: React.FC<ProjectTabProps & { onDeleted: () => void }> = ({ project, reloadProject, onDeleted }) => {
  const [form, setForm] = useState({
    name: project.name, description: project.description || '', startDate: toDateInput(project.startDate), targetDate: toDateInput(project.targetDate)
  });
  const [editingSource, setEditingSource] = useState<any>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { busy, run } = useBusy();
  const isOwner = project.myRole === 'OWNER';

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      try {
        await api.patch(`/api/team-projects/${project.id}`, {
          name: form.name.trim(), description: form.description.trim() || null, startDate: form.startDate || null, targetDate: form.targetDate || null
        });
        reloadProject();
      } catch (err) {
        alert(getErrorMessage(err, 'Không lưu được dự án'));
      }
    });
  };

  const toggleArchive = () =>
    run('archive', async () => {
      try {
        await api.patch(`/api/team-projects/${project.id}`, { isArchived: !project.isArchived });
        reloadProject();
      } catch (err) {
        alert(getErrorMessage(err, 'Không cập nhật được'));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <form className="card flex flex-col gap-3" onSubmit={save}>
        <b>Thông tin dự án</b>
        <div className="form-group">
          <label className="form-label">Tên</label>
          <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Mô tả tổng quan (Markdown) — Claude đọc khi gọi project_overview</label>
          <textarea className="form-input pj-mono" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="pj-form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Bắt đầu</label>
            <input type="date" className="form-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Mục tiêu</label>
            <input type="date" className="form-input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          </div>
        </div>
        <div><button className="btn btn-primary btn-sm" type="submit" disabled={busy === 'save'}>Lưu thay đổi</button></div>
      </form>

      <div className="card flex flex-col gap-2">
        <div className="flex align-center justify-between">
          <b>Source ({project.sources.length})</b>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditingSource({})}><Plus size={14} /> Thêm source</button>
        </div>
        {project.sources.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Thêm BE / AD / APP... để chia task theo mảng mã nguồn.</span>}
        {project.sources.map((s: any) => (
          <div key={s.id} className="pj-row">
            <span className="pj-key">{s.key}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{s.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {[s.lead && `Phụ trách ${s.lead.fullName}`, s.techStack, s.repoUrl].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <button className="icon-btn" title="Sửa" onClick={() => setEditingSource(s)}><Pencil size={14} /></button>
            <button className="icon-btn danger" title="Xoá" onClick={() => setConfirm({
              title: `Xoá source ${s.key}?`, message: 'Task và tài liệu của source vẫn giữ lại, chỉ bỏ gắn source.', confirmLabel: 'Xoá',
              action: async () => {
                try { await api.delete(`/api/team-projects/${project.id}/sources/${s.id}`); reloadProject(); }
                catch (err) { alert(getErrorMessage(err, 'Không xoá được source')); }
              }
            })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="card flex flex-col gap-2">
        <b>Lưu trữ & xoá</b>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy === 'archive'} onClick={toggleArchive}>{project.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ dự án'}</button>
          {isOwner && (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirm({
              title: `Xoá dự án ${project.key}?`,
              message: 'Mọi thành viên mất quyền truy cập dự án, task và tài liệu. Không khôi phục được trên giao diện.',
              confirmLabel: 'Xoá dự án',
              action: async () => {
                try { await api.delete(`/api/team-projects/${project.id}`); onDeleted(); }
                catch (err) { alert(getErrorMessage(err, 'Không xoá được dự án')); }
              }
            })}>Xoá dự án</button>
          )}
        </div>
      </div>

      {editingSource && (
        <SourceForm project={project} source={editingSource.id ? editingSource : undefined} onClose={() => setEditingSource(null)}
          onSaved={() => { setEditingSource(null); reloadProject(); }} />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
