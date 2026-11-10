import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBusy } from '../tasks/agent';
import { Markdown } from '../tasks/PlanPanel';
import { ConfirmDialog, formatDate, type ConfirmState } from '../tasks/shared';
import { roleAtLeast, type ProjectTabProps } from './shared';

const EMPTY = { title: '', content: '', url: '', sourceId: '' };

// Markdown docs stored on the BE so every member (and Claude via MCP get_doc) reads the same text
export const TeamDocs: React.FC<ProjectTabProps> = ({ project, openTask }) => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { busy, run } = useBusy();
  const canEdit = roleAtLeast(project.myRole, 'MEMBER');

  const load = useCallback(async () => {
    try {
      setDocs(await api.get(`/api/team-projects/${project.id}/docs`, { noCache: true }));
    } catch (err) {
      setDocs([]);
      alert(getErrorMessage(err, 'Không tải được tài liệu'));
    }
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const open = (id: string) =>
    run('open', async () => {
      try {
        setSelected(await api.get(`/api/team-docs/${id}`, { noCache: true }));
        setDraft(null);
      } catch (err) {
        alert(getErrorMessage(err, 'Không mở được tài liệu'));
      }
    });

  const save = () =>
    run('save', async () => {
      if (!draft?.title.trim()) return alert('Cần tiêu đề');
      const body = { title: draft.title.trim(), content: draft.content, url: draft.url.trim() || null, sourceId: draft.sourceId || null };
      try {
        const doc = selected
          ? await api.patch(`/api/team-docs/${selected.id}`, body)
          : await api.post(`/api/team-projects/${project.id}/docs`, body);
        setSelected(doc);
        setDraft(null);
        load();
      } catch (err) {
        alert(getErrorMessage(err, 'Không lưu được tài liệu'));
      }
    });

  if (!docs) return <div className="loading-container"><span className="spinner" /> Đang tải...</div>;

  const general = docs.filter((d) => !d.taskId);
  const ofTasks = docs.filter((d) => d.taskId);
  const canDelete = selected && (selected.createdById === user?.id || roleAtLeast(project.myRole, 'MANAGER'));

  // Plain render helper (not a component) so React doesn't remount items on every render
  const docItem = (d: any) => (
    <button key={d.id} className={`tw-nav-item ${selected?.id === d.id ? 'active' : ''}`} onClick={() => open(d.id)}>
      <FileText size={14} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
      {d.source && <span className="tw-count">{d.source.key}</span>}
      {d.task && <span className="tw-count">{d.task.key}</span>}
    </button>
  );

  return (
    <div className="pj-docs">
      <div className="pj-docs-nav">
        {canEdit && <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => { setSelected(null); setDraft({ ...EMPTY }); }}><Plus size={14} /> Tài liệu mới</button>}
        <div className="tw-nav-title">Tài liệu chung ({general.length})</div>
        {general.map(docItem)}
        {general.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 8px' }}>Quy ước code, kiến trúc, đặc tả API...</span>}
        {ofTasks.length > 0 && <div className="tw-nav-title">Theo task ({ofTasks.length})</div>}
        {ofTasks.map(docItem)}
      </div>

      <div className="card pj-docs-main">
        {draft ? (
          <div className="flex flex-col gap-2">
            <input className="form-input" placeholder="Tiêu đề" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <div className="pj-form-row">
              <input className="form-input" style={{ flex: 1 }} placeholder="Link ngoài (tuỳ chọn)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
              <select className="form-input" style={{ width: 'auto' }} value={draft.sourceId} onChange={(e) => setDraft({ ...draft, sourceId: e.target.value })}>
                <option value="">Cả dự án</option>
                {project.sources.map((s: any) => <option key={s.id} value={s.id}>Source {s.key}</option>)}
              </select>
            </div>
            <textarea className="form-input pj-mono" rows={20} placeholder="Nội dung Markdown" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tài liệu gắn source được gửi kèm mọi task của source đó khi Claude đọc task qua MCP.</span>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={busy === 'save'} onClick={save}>Lưu</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>Huỷ</button>
            </div>
          </div>
        ) : selected ? (
          <div className="flex flex-col gap-2">
            <div className="flex align-center justify-between gap-2">
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{selected.title}</h2>
              <div className="flex gap-1">
                {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setDraft({ title: selected.title, content: selected.content, url: selected.url || '', sourceId: selected.sourceId || '' })}>Sửa</button>}
                {canDelete && <button className="icon-btn danger" onClick={() => setConfirm({
                  title: `Xoá tài liệu "${selected.title}"?`, message: 'Tài liệu sẽ bị ẩn khỏi dự án.', confirmLabel: 'Xoá',
                  action: async () => {
                    try { await api.delete(`/api/team-docs/${selected.id}`); setSelected(null); load(); }
                    catch (err) { alert(getErrorMessage(err, 'Không xoá được tài liệu')); }
                  }
                })}><Trash2 size={16} /></button>}
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Cập nhật {formatDate(selected.updatedAt)}{selected.updatedBy ? ` bởi ${selected.updatedBy.fullName}` : ''}
              {selected.source && ` · source ${selected.source.key}`}
              {selected.task && <> · task <a href="#" onClick={(e) => { e.preventDefault(); openTask(selected.task.key); }}>{selected.task.key}</a></>}
            </span>
            {selected.url && <a href={selected.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem' }}>{selected.url}</a>}
            <div style={{ marginTop: 8 }}><Markdown text={selected.content || '(trống)'} /></div>
          </div>
        ) : (
          <div className="empty-state" style={{ border: 'none' }}>
            <FileText size={28} className="empty-state-icon" />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chọn một tài liệu, hoặc tạo tài liệu mới để cả nhóm và AI cùng đọc.</span>
          </div>
        )}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
