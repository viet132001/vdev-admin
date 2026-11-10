import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, FileText, Plus, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBusy } from '../tasks/agent';
import { Markdown } from '../tasks/PlanPanel';
import { ConfirmDialog, PRIORITY_OPTIONS, formatDate, toDateInput, type ConfirmState } from '../tasks/shared';
import { Avatar, TEAM_STATUS, aiPrompt, copyText, roleAtLeast, taskToMarkdown, teamStatusMeta } from './shared';

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'tạo task',
  STATUS: 'đổi trạng thái',
  ASSIGNEEID: 'đổi người làm',
  PRIORITY: 'đổi ưu tiên',
  SOURCEID: 'đổi source',
  MILESTONEID: 'đổi milestone',
  DUEDATE: 'đổi deadline',
  STARTDATE: 'đổi ngày bắt đầu',
  TITLE: 'đổi tiêu đề'
};

export const TeamTaskPanel: React.FC<{
  taskRef: string;
  project: any;
  onClose: () => void;
  onChanged: () => void;
}> = ({ taskRef, project, onClose, onChanged }) => {
  const { user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [error, setError] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState('');
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState('');
  const [comment, setComment] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [openDoc, setOpenDoc] = useState<any>(null);
  const [newDoc, setNewDoc] = useState<{ title: string; content: string; url: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [copied, setCopied] = useState('');
  const { busy, run } = useBusy();

  const canEdit = roleAtLeast(task?.myRole ?? project.myRole, 'MEMBER');
  const assignable = project.members.filter((m: any) => roleAtLeast(m.role, 'MEMBER'));

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/team-tasks/${taskRef}`, { noCache: true });
      setTask(data);
      setTitle(data.title);
      setDesc(data.description || '');
      setCriteria(data.acceptanceCriteria || []);
      setBlockedReason(data.blockedReason || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Không mở được task'));
    }
  }, [taskRef]);

  useEffect(() => { load(); }, [load]);

  const patch = (body: Record<string, any>, key = 'patch') =>
    run(key, async () => {
      try {
        const data = await api.patch(`/api/team-tasks/${task.id}`, body);
        setTask(data);
        setCriteria(data.acceptanceCriteria || []);
        onChanged();
      } catch (err) {
        alert(getErrorMessage(err, 'Không cập nhật được task'));
        load();
      }
    });

  const flash = async (label: string, text: string) => {
    if (await copyText(text)) {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } else {
      alert('Trình duyệt không cho copy, hãy copy thủ công.');
    }
  };

  const addComment = () =>
    run('comment', async () => {
      if (!comment.trim()) return;
      try {
        await api.post(`/api/team-tasks/${task.id}/comments`, { content: comment.trim() });
        setComment('');
        await load();
        onChanged();
      } catch (err) {
        alert(getErrorMessage(err, 'Không gửi được bình luận'));
      }
    });

  const viewDoc = (docId: string) =>
    run('doc', async () => {
      try {
        setOpenDoc(await api.get(`/api/team-docs/${docId}`, { noCache: true }));
      } catch (err) {
        alert(getErrorMessage(err, 'Không mở được tài liệu'));
      }
    });

  const createDoc = () =>
    run('newdoc', async () => {
      if (!newDoc?.title.trim()) return;
      try {
        await api.post(`/api/team-projects/${project.id}/docs`, {
          title: newDoc.title.trim(), content: newDoc.content, url: newDoc.url.trim() || undefined, taskId: task.id
        });
        setNewDoc(null);
        await load();
        onChanged();
      } catch (err) {
        alert(getErrorMessage(err, 'Không tạo được tài liệu'));
      }
    });

  const askDelete = () =>
    setConfirm({
      title: `Xoá task ${task.key}?`,
      message: 'Task, bình luận và lịch sử sẽ bị ẩn khỏi dự án.',
      confirmLabel: 'Xoá task',
      action: async () => {
        try {
          await api.delete(`/api/team-tasks/${task.id}`);
          onChanged();
          onClose();
        } catch (err) {
          alert(getErrorMessage(err, 'Không xoá được task'));
        }
      }
    });

  const memberLabel = (id: string | null) => (id ? project.members.find((m: any) => m.userId === id)?.fullName || 'người cũ' : '—');
  const activityValue = (action: string, value: string | null) => {
    if (value === null) return '—';
    if (action === 'STATUS') return teamStatusMeta(value).label;
    if (action === 'ASSIGNEEID') return memberLabel(value);
    if (action === 'SOURCEID') return project.sources.find((s: any) => s.id === value)?.key || '—';
    if (action === 'MILESTONEID') return project.milestones.find((m: any) => m.id === value)?.name || '—';
    if (action === 'DUEDATE' || action === 'STARTDATE') return formatDate(value);
    return value;
  };

  const canDelete = task && (task.reporterId === user?.id || roleAtLeast(task.myRole, 'MANAGER'));

  return (
    <div className="tw-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tw-drawer">
        <div className="tw-drawer-top">
          <span className="pj-task-key">{task?.key || taskRef}</span>
          <span style={{ flex: 1 }} />
          {task && (
            <>
              <button className="btn btn-secondary btn-sm" title="Prompt cho Claude Code đã kết nối MCP" onClick={() => flash('prompt', aiPrompt(task))}>
                <Bot size={14} /> {copied === 'prompt' ? 'Đã copy' : 'Copy prompt AI'}
              </button>
              <button className="btn btn-secondary btn-sm" title="Toàn bộ nội dung task dạng Markdown" onClick={() => flash('md', taskToMarkdown(task, project))}>
                <Copy size={14} /> {copied === 'md' ? 'Đã copy' : 'Copy nội dung'}
              </button>
              {canDelete && <button className="icon-btn danger" title="Xoá task" onClick={askDelete}><Trash2 size={16} /></button>}
            </>
          )}
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tw-drawer-body">
          {error && <div className="alert-banner alert-banner-danger">{error}</div>}
          {!task && !error && <div className="loading-container"><span className="spinner" /> Đang tải...</div>}
          {task && (
            <>
              <input
                className="tw-title-input"
                value={title}
                disabled={!canEdit}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title.trim() !== task.title && patch({ title: title.trim() })}
                style={{ fontSize: '1.5rem' }}
              />

              <div className="tw-props">
                <span className="tw-prop-label">Trạng thái</span>
                <div className="tw-prop-value">
                  <select className="form-input" disabled={!canEdit} value={task.status} style={{ color: teamStatusMeta(task.status).color }} onChange={(e) => patch({ status: e.target.value })}>
                    {TEAM_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {task.status === 'BLOCKED' && (
                  <>
                    <span className="tw-prop-label">Lý do bị chặn</span>
                    <div className="tw-prop-value">
                      <input className="form-input" disabled={!canEdit} value={blockedReason} placeholder="Đang chờ gì / vướng ở đâu"
                        onChange={(e) => setBlockedReason(e.target.value)}
                        onBlur={() => blockedReason !== (task.blockedReason || '') && patch({ blockedReason: blockedReason || null })} />
                    </div>
                  </>
                )}
                <span className="tw-prop-label">Người làm</span>
                <div className="tw-prop-value">
                  <select className="form-input" disabled={!canEdit} value={task.assigneeId || ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
                    <option value="">— Chưa giao —</option>
                    {assignable.map((m: any) => <option key={m.userId} value={m.userId}>{m.fullName} ({m.email})</option>)}
                  </select>
                </div>
                <span className="tw-prop-label">Source</span>
                <div className="tw-prop-value">
                  <select className="form-input" disabled={!canEdit} value={task.sourceId || ''} onChange={(e) => patch({ sourceId: e.target.value || null })}>
                    <option value="">— Không —</option>
                    {project.sources.map((s: any) => <option key={s.id} value={s.id}>{s.key} · {s.name}</option>)}
                  </select>
                </div>
                <span className="tw-prop-label">Ưu tiên</span>
                <div className="tw-prop-value">
                  <select className="form-input" disabled={!canEdit} value={task.priority} onChange={(e) => patch({ priority: e.target.value })}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <span className="tw-prop-label">Milestone</span>
                <div className="tw-prop-value">
                  <select className="form-input" disabled={!canEdit} value={task.milestoneId || ''} onChange={(e) => patch({ milestoneId: e.target.value || null })}>
                    <option value="">— Không —</option>
                    {project.milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <span className="tw-prop-label">Bắt đầu</span>
                <div className="tw-prop-value">
                  <input type="date" className="form-input" disabled={!canEdit} value={toDateInput(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} />
                </div>
                <span className="tw-prop-label">Deadline</span>
                <div className="tw-prop-value flex align-center gap-2">
                  <input type="date" className="form-input" disabled={!canEdit} value={toDateInput(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} />
                  {task.isOverdue && <span className="tw-overdue" style={{ fontSize: '0.75rem' }}>Trễ hạn</span>}
                </div>
                <span className="tw-prop-label">Ước lượng (giờ)</span>
                <div className="tw-prop-value">
                  <input type="number" min={0} step={0.5} className="form-input" disabled={!canEdit} defaultValue={task.estimateHours ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if (v !== task.estimateHours) patch({ estimateHours: v });
                    }} />
                </div>
                <span className="tw-prop-label">Người tạo</span>
                <div className="tw-prop-value" style={{ fontSize: '0.82rem', padding: '6px 8px' }}>{task.reporter?.fullName} · {formatDate(task.createdAt)}</div>
              </div>

              <div className="tw-section-title">
                Mô tả
                {canEdit && !editingDesc && <button className="btn btn-secondary btn-sm" onClick={() => setEditingDesc(true)}>Sửa</button>}
              </div>
              {editingDesc ? (
                <div className="flex flex-col gap-2">
                  <textarea className="form-input pj-mono" rows={14} value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" disabled={busy === 'desc'}
                      onClick={async () => { await patch({ description: desc }, 'desc'); setEditingDesc(false); }}>Lưu</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setDesc(task.description || ''); setEditingDesc(false); }}>Huỷ</button>
                  </div>
                </div>
              ) : task.description ? (
                <Markdown text={task.description} />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có mô tả. Mô tả càng chi tiết thì AI càng làm đúng.</span>
              )}

              <div className="tw-section-title">Tiêu chí nghiệm thu</div>
              <div className="flex flex-col gap-1">
                {criteria.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có tiêu chí.</span>}
                {criteria.map((c, i) => (
                  <div key={i} className="pj-row" style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                    <span style={{ flex: 1 }}>{c}</span>
                    {canEdit && <button className="icon-btn danger" onClick={() => patch({ acceptanceCriteria: criteria.filter((_, j) => j !== i) })}><X size={14} /></button>}
                  </div>
                ))}
                {canEdit && (
                  <form className="flex gap-2" onSubmit={(e) => {
                    e.preventDefault();
                    if (newCriterion.trim()) { patch({ acceptanceCriteria: [...criteria, newCriterion.trim()] }); setNewCriterion(''); }
                  }}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="Thêm tiêu chí kiểm chứng được..." value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} />
                    <button className="btn btn-secondary btn-sm" type="submit"><Plus size={14} /></button>
                  </form>
                )}
              </div>

              <div className="tw-section-title">
                Tài liệu của task
                {canEdit && !newDoc && <button className="btn btn-secondary btn-sm" onClick={() => setNewDoc({ title: '', content: '', url: '' })}><Plus size={14} /> Thêm</button>}
              </div>
              <div className="flex flex-col gap-1">
                {task.docs.length === 0 && !newDoc && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có tài liệu. Tài liệu chung của dự án nằm ở tab Tài liệu.</span>}
                {task.docs.map((d: any) => (
                  <button key={d.id} className="pj-mini" onClick={() => viewDoc(d.id)}>
                    <FileText size={14} /> <span className="pj-mini-title">{d.title}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(d.updatedAt)}</span>
                  </button>
                ))}
                {newDoc && (
                  <div className="card flex flex-col gap-2">
                    <input className="form-input" placeholder="Tiêu đề tài liệu" value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} />
                    <input className="form-input" placeholder="Link ngoài (Figma, Google Docs...) — tuỳ chọn" value={newDoc.url} onChange={(e) => setNewDoc({ ...newDoc, url: e.target.value })} />
                    <textarea className="form-input pj-mono" rows={8} placeholder="Nội dung Markdown: đặc tả API, luồng màn hình, dữ liệu mẫu..." value={newDoc.content} onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })} />
                    <div className="flex gap-2">
                      <button className="btn btn-primary btn-sm" disabled={busy === 'newdoc'} onClick={createDoc}>Lưu tài liệu</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setNewDoc(null)}>Huỷ</button>
                    </div>
                  </div>
                )}
                {openDoc && (
                  <div className="card flex flex-col gap-2">
                    <div className="flex align-center justify-between">
                      <b>{openDoc.title}</b>
                      <button className="icon-btn" onClick={() => setOpenDoc(null)}><X size={14} /></button>
                    </div>
                    {openDoc.url && <a href={openDoc.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>{openDoc.url}</a>}
                    <Markdown text={openDoc.content || '(trống)'} />
                  </div>
                )}
              </div>

              <div className="tw-section-title">Bình luận ({task.comments.length})</div>
              <div className="flex flex-col gap-2">
                {task.comments.map((c: any) => (
                  <div key={c.id} className="pj-comment">
                    <Avatar name={c.author.fullName} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <b style={{ color: 'var(--text-main)' }}>{c.author.fullName}</b>
                        {c.via === 'MCP' && <span className="badge" style={{ marginLeft: 6 }}>qua Claude</span>}
                        {' · '}{new Date(c.createdAt).toLocaleString('vi-VN')}
                      </div>
                      <Markdown text={c.content} />
                    </div>
                  </div>
                ))}
                {canEdit && (
                  <div className="flex flex-col gap-2">
                    <textarea className="form-input" rows={2} placeholder="Viết bình luận..." value={comment} onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }} />
                    <div><button className="btn btn-primary btn-sm" disabled={!comment.trim() || busy === 'comment'} onClick={addComment}>Gửi</button></div>
                  </div>
                )}
              </div>

              <div className="tw-section-title">Lịch sử</div>
              <div className="flex flex-col gap-1" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {task.activity.map((a: any) => (
                  <div key={a.id}>
                    {new Date(a.createdAt).toLocaleString('vi-VN')} · <b style={{ color: 'var(--text-main)' }}>{memberLabel(a.actorId)}</b>
                    {a.via === 'MCP' ? ' (qua Claude)' : ''} {ACTION_LABEL[a.action] || a.action.toLowerCase()}
                    {a.action !== 'CREATED' && <>: {activityValue(a.action, a.fromValue)} → {activityValue(a.action, a.toValue)}</>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
