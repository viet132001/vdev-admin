import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import {
  X, Trash2, Circle, CircleCheck, Calendar, Flag, Tag, FolderKanban, Network, Unlink, ListChecks, MessageSquare,
  Plus, Send, Pencil, GripVertical, Clock3, FileText, ChevronRight, Loader
} from 'lucide-react';
import { BlockEditor, parseContent, type Block } from './BlockEditor';
import {
  COLOR_PRESETS, PRIORITY_OPTIONS, STATUS_OPTIONS, Popover, StatusBadge, TagChip, formatDate, isOverdue, toDateInput,
  type ConfirmState
} from './shared';

interface TaskDetailProps {
  taskId: string;
  projects: any[];
  tags: any[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
  onTagsChanged: () => void;
  onConfirm: (state: ConfirmState) => void;
}

const CONTENT_SAVE_DELAY = 800;

export const TaskDetail: React.FC<TaskDetailProps> = ({ taskId, projects, tags, onClose, onOpenTask, onChanged, onTagsChanged, onConfirm }) => {
  const [task, setTask] = useState<any | null>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [editingIcon, setEditingIcon] = useState(false);
  const [description, setDescription] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [contentState, setContentState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newChild, setNewChild] = useState('');
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: string; content: string } | null>(null);
  const [dragSubtaskId, setDragSubtaskId] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);
  const pendingBlocks = useRef<Block[] | null>(null);
  const dirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [subtaskHandleId, setSubtaskHandleId] = useState<string | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const data = await api.get(`/api/tasks/${taskId}`, { noCache: true });
      setTask(data);
      setTitle(data.title || '');
      setIcon(data.icon || '');
      setDescription(data.description || '');
      if (!dirtyRef.current) setBlocks(parseContent(data.content));
      if (data.projectId) {
        const project = await api.get(`/api/task-projects/${data.projectId}`);
        setColumns(project.columns || []);
      } else {
        setColumns([]);
      }
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được công việc'));
      onCloseRef.current();
    }
  }, [taskId]);

  const loadComments = useCallback(async () => {
    try {
      const data = await api.get(`/api/tasks/${taskId}/comments`, { noCache: true });
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load comments', err);
    }
  }, [taskId]);

  // ---------- content autosave ----------

  const flushContent = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const toSave = pendingBlocks.current;
    if (!toSave) return;
    pendingBlocks.current = null;
    setContentState('saving');
    try {
      await api.patch(`/api/tasks/${taskId}`, { content: { blocks: toSave } });
      if (!pendingBlocks.current) {
        dirtyRef.current = false;
        setContentState('saved');
      }
    } catch (err) {
      setContentState('dirty');
      alert(getErrorMessage(err, 'Lưu nội dung thất bại'));
    }
  }, [taskId]);

  useEffect(() => {
    setTask(null);
    setBlocks([]);
    dirtyRef.current = false;
    loadTask();
    loadComments();
    return () => {
      // Save unsaved content when switching task or closing
      flushContent();
    };
  }, [loadTask, loadComments, flushContent]);

  const handleBlocksChange = (next: Block[]) => {
    setBlocks(next);
    pendingBlocks.current = next;
    dirtyRef.current = true;
    setContentState('dirty');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushContent, CONTENT_SAVE_DELAY);
  };

  const close = async () => {
    await flushContent();
    onChanged();
    onClose();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ---------- task fields ----------

  const patchTask = async (patch: any) => {
    try {
      await api.patch(`/api/tasks/${taskId}`, patch);
      await loadTask();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật công việc thất bại'));
    }
  };

  const moveTask = async (payload: any) => {
    try {
      await api.post(`/api/tasks/${taskId}/move`, payload);
      await loadTask();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Di chuyển công việc thất bại'));
    }
  };

  const saveTitle = () => {
    if (!task) return;
    if (!title.trim()) { setTitle(task.title); return; }
    if (title.trim() !== task.title) patchTask({ title: title.trim() });
  };

  const toggleTag = (tagId: string) => {
    const current = (task.tags || []).map((t: any) => t.id);
    const next = current.includes(tagId) ? current.filter((id: string) => id !== tagId) : [...current, tagId];
    patchTask({ tagIds: next });
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    try {
      const tag = existing || (await api.post('/api/task-tags', { name, color: COLOR_PRESETS[tags.length % COLOR_PRESETS.length] }));
      setNewTagName('');
      onTagsChanged();
      if (!(task.tags || []).some((t: any) => t.id === tag.id)) {
        await patchTask({ tagIds: [...(task.tags || []).map((t: any) => t.id), tag.id] });
      }
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo tag thất bại'));
    }
  };

  const deleteTask = () => {
    onConfirm({
      title: 'Xóa công việc',
      message: task.childCount > 0
        ? `Công việc này có ${task.childCount} task con. Toàn bộ sẽ bị xóa (xóa mềm).`
        : 'Bạn có chắc chắn muốn xóa công việc này?',
      confirmLabel: 'Xóa',
      action: async () => {
        try {
          pendingBlocks.current = null;
          await api.delete(`/api/tasks/${taskId}`);
          onChanged();
          onClose();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa công việc thất bại'));
        }
      }
    });
  };

  // ---------- subtasks (checklist) ----------

  const subtaskAction = async (fn: () => Promise<any>, fallback: string) => {
    try {
      await fn();
      await loadTask();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, fallback));
    }
  };

  const addSubtask = () => {
    const t = newSubtask.trim();
    if (!t) return;
    setNewSubtask('');
    subtaskAction(() => api.post(`/api/tasks/${taskId}/subtasks`, { title: t }), 'Thêm checklist thất bại');
  };

  const dropSubtask = (targetId: string) => {
    if (!dragSubtaskId || dragSubtaskId === targetId) return;
    const ids = task.subtasks.map((s: any) => s.id).filter((id: string) => id !== dragSubtaskId);
    ids.splice(ids.indexOf(targetId), 0, dragSubtaskId);
    setTask({ ...task, subtasks: ids.map((id: string) => task.subtasks.find((s: any) => s.id === id)) });
    subtaskAction(() => api.patch(`/api/tasks/${taskId}/subtasks/reorder`, { ids }), 'Sắp xếp checklist thất bại');
  };

  // ---------- children ----------

  const addChild = async () => {
    const t = newChild.trim();
    if (!t) return;
    setNewChild('');
    try {
      await api.post('/api/tasks', { title: t, parentId: taskId });
      await loadTask();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo task con thất bại'));
    }
  };

  const toggleChildDone = async (child: any) => {
    try {
      await api.patch(`/api/tasks/${child.id}`, { status: child.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' });
      await loadTask();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật task con thất bại'));
    }
  };

  // ---------- comments ----------

  const commentAction = async (fn: () => Promise<any>, fallback: string) => {
    try {
      await fn();
      await loadComments();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, fallback));
    }
  };

  const addComment = () => {
    const c = newComment.trim();
    if (!c) return;
    setNewComment('');
    commentAction(() => api.post(`/api/tasks/${taskId}/comments`, { content: c }), 'Gửi bình luận thất bại');
  };

  if (!task) {
    return (
      <div className="tw-drawer-overlay" onMouseDown={close}>
        <div className="tw-drawer" onMouseDown={(e) => e.stopPropagation()}>
          <div className="loading-container" style={{ margin: 'auto' }}><span className="spinner"></span><span>Đang tải...</span></div>
        </div>
      </div>
    );
  }

  const progress = task.subtaskProgress || { total: 0, completed: 0 };
  const currentColumn = columns.find((c) => c.id === task.columnId);

  return (
    <div className="tw-drawer-overlay" onMouseDown={close}>
      <div className="tw-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tw-drawer-top">
          <span className="flex align-center" style={{ gap: '4px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span>{task.project ? task.project.name : 'Inbox'}</span>
            {task.parentId && (
              <>
                <ChevronRight size={12} />
                <button className="icon-btn" style={{ fontSize: '0.8rem' }} onClick={async () => { await flushContent(); onOpenTask(task.parentId); }}>
                  Task cha
                </button>
              </>
            )}
            <ChevronRight size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>{task.title}</span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
            {contentState === 'saving' && <><Loader size={12} /> Đang lưu...</>}
            {contentState === 'dirty' && 'Chưa lưu'}
            {contentState === 'saved' && 'Đã lưu'}
          </span>
          <button className="icon-btn danger" title="Xóa công việc" onClick={deleteTask}><Trash2 size={16} /></button>
          <button className="icon-btn" title="Đóng (Esc)" onClick={close}><X size={18} /></button>
        </div>

        <div className="tw-drawer-body">
          {icon || editingIcon ? (
            <input
              autoFocus={editingIcon}
              className="tw-icon-input"
              value={icon}
              maxLength={4}
              title="Biểu tượng (emoji)"
              onChange={(e) => setIcon(e.target.value)}
              onBlur={() => {
                setEditingIcon(false);
                if ((icon || null) !== (task.icon || null)) patchTask({ icon: icon || null });
              }}
            />
          ) : (
            <button className="icon-btn" style={{ fontSize: '0.78rem', marginBottom: 4 }} onClick={() => setEditingIcon(true)}>
              <Plus size={12} /> Thêm icon
            </button>
          )}
          <input
            className="tw-title-input"
            value={title}
            placeholder="Không có tiêu đề"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />

          <div className="tw-props">
            <div className="tw-prop-label"><Circle size={14} /> Trạng thái</div>
            <div className="tw-prop-value flex align-center gap-2">
              {task.projectId && columns.length > 0 ? (
                <select
                  className="form-input"
                  style={{ color: currentColumn?.color, fontWeight: 600 }}
                  value={task.columnId || ''}
                  onChange={(e) => moveTask({ columnId: e.target.value })}
                >
                  {!currentColumn && <option value="">Chưa phân cột</option>}
                  {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <select className="form-input" value={task.status} onChange={(e) => patchTask({ status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
              <StatusBadge status={task.status} />
            </div>

            <div className="tw-prop-label"><Flag size={14} /> Ưu tiên</div>
            <div className="tw-prop-value">
              <select
                className="form-input"
                style={{ color: PRIORITY_OPTIONS.find((p) => p.value === task.priority)?.color, fontWeight: 600 }}
                value={task.priority}
                onChange={(e) => patchTask({ priority: e.target.value })}
              >
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div className="tw-prop-label"><Calendar size={14} /> Bắt đầu</div>
            <div className="tw-prop-value">
              <input type="date" className="form-input" value={toDateInput(task.startDate)} onChange={(e) => patchTask({ startDate: e.target.value || null })} />
            </div>

            <div className="tw-prop-label"><Calendar size={14} /> Deadline</div>
            <div className="tw-prop-value flex align-center gap-2">
              <input
                type="date"
                className={`form-input ${isOverdue(task) ? 'tw-overdue' : ''}`}
                value={toDateInput(task.deadline)}
                onChange={(e) => patchTask({ deadline: e.target.value || null })}
              />
              {isOverdue(task) && <span className="badge badge-danger">Quá hạn</span>}
            </div>

            <div className="tw-prop-label"><Tag size={14} /> Tags</div>
            <div className="tw-prop-value flex align-center" style={{ gap: '6px', flexWrap: 'wrap', position: 'relative', padding: '4px 0' }}>
              {(task.tags || []).map((tag: any) => <TagChip key={tag.id} tag={tag} onRemove={() => toggleTag(tag.id)} />)}
              <button className="icon-btn" onClick={() => setTagMenuOpen(!tagMenuOpen)}><Plus size={14} /></button>
              {tagMenuOpen && (
                <Popover onClose={() => setTagMenuOpen(false)} style={{ top: '100%', left: 0, width: 240, maxHeight: 300, overflowY: 'auto' }}>
                  <input
                    autoFocus
                    className="form-input"
                    style={{ padding: '5px 8px', fontSize: '0.8rem', marginBottom: '4px' }}
                    placeholder="Tìm hoặc tạo tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createTag(); }}
                  />
                  {tags
                    .filter((t) => !newTagName || t.name.toLowerCase().includes(newTagName.toLowerCase()))
                    .map((t) => (
                      <button key={t.id} className="tw-popover-item" onClick={() => toggleTag(t.id)}>
                        <input type="checkbox" readOnly checked={(task.tags || []).some((x: any) => x.id === t.id)} />
                        <TagChip tag={t} />
                      </button>
                    ))}
                  {newTagName.trim() && !tags.some((t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()) && (
                    <button className="tw-popover-item" onClick={createTag}><Plus size={14} /> Tạo tag “{newTagName.trim()}”</button>
                  )}
                </Popover>
              )}
            </div>

            <div className="tw-prop-label"><FolderKanban size={14} /> Project</div>
            <div className="tw-prop-value">
              <select
                className="form-input"
                value={task.projectId || ''}
                onChange={(e) => moveTask({ projectId: e.target.value || null })}
              >
                <option value="">Inbox</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>)}
              </select>
            </div>

            {task.parentId && (
              <>
                <div className="tw-prop-label"><Network size={14} /> Task cha</div>
                <div className="tw-prop-value flex align-center gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={async () => { await flushContent(); onOpenTask(task.parentId); }}>Mở task cha</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => moveTask({ parentId: null })}><Unlink size={12} /> Tách thành task độc lập</button>
                </div>
              </>
            )}

            <div className="tw-prop-label"><FileText size={14} /> Mô tả ngắn</div>
            <div className="tw-prop-value">
              <input
                className="form-input"
                style={{ width: '100%' }}
                placeholder="Trống"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => { if (description !== (task.description || '')) patchTask({ description: description || null }); }}
              />
            </div>

            <div className="tw-prop-label"><Clock3 size={14} /> Thời gian</div>
            <div className="tw-prop-value" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px 0' }}>
              Tạo {new Date(task.createdAt).toLocaleString('vi-VN')} · Sửa {new Date(task.updatedAt).toLocaleString('vi-VN')}
              {task.completedAt && <> · Hoàn thành {new Date(task.completedAt).toLocaleString('vi-VN')}</>}
            </div>
          </div>

          <hr className="tw-divider" />

          <BlockEditor blocks={blocks} onChange={handleBlocksChange} />

          {/* Checklist */}
          <div className="tw-section-title">
            <ListChecks size={14} /> Checklist
            {progress.total > 0 && <span style={{ fontWeight: 500, textTransform: 'none' }}>{progress.completed}/{progress.total}</span>}
          </div>
          {progress.total > 0 && (
            <div className="progress-bar-container" style={{ height: 6, marginBottom: 8 }}>
              <div className="progress-bar-fill" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
            </div>
          )}
          <div className="flex flex-col" style={{ gap: '2px' }}>
            {(task.subtasks || []).map((st: any) => (
              <div
                key={st.id}
                className="tw-block"
                style={{ alignItems: 'center', opacity: dragSubtaskId === st.id ? 0.4 : 1 }}
                draggable={subtaskHandleId === st.id}
                onDragStart={() => setDragSubtaskId(st.id)}
                onDragEnd={() => { setDragSubtaskId(null); setSubtaskHandleId(null); }}
                onDragOver={(e) => { if (dragSubtaskId) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); dropSubtask(st.id); }}
              >
                <span
                  className="tw-block-handle"
                  style={{ cursor: 'grab', color: 'var(--text-muted)', marginTop: 0 }}
                  onMouseDown={() => setSubtaskHandleId(st.id)}
                  onMouseUp={() => setSubtaskHandleId(null)}
                ><GripVertical size={14} /></span>
                <input
                  type="checkbox"
                  checked={st.isCompleted}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  onChange={() => subtaskAction(() => api.patch(`/api/tasks/${taskId}/subtasks/${st.id}`, { isCompleted: !st.isCompleted }), 'Cập nhật checklist thất bại')}
                />
                <input
                  className="tw-block-input"
                  style={{ textDecoration: st.isCompleted ? 'line-through' : 'none', color: st.isCompleted ? 'var(--text-muted)' : undefined }}
                  defaultValue={st.title}
                  key={`${st.id}-${st.title}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== st.title) subtaskAction(() => api.patch(`/api/tasks/${taskId}/subtasks/${st.id}`, { title: v }), 'Cập nhật checklist thất bại');
                    else e.target.value = st.title;
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <input
                  type="date"
                  className="tw-cell-select"
                  style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
                  value={toDateInput(st.deadline)}
                  onChange={(e) => subtaskAction(() => api.patch(`/api/tasks/${taskId}/subtasks/${st.id}`, { deadline: e.target.value || null }), 'Cập nhật checklist thất bại')}
                />
                <button className="icon-btn danger" onClick={() => subtaskAction(() => api.delete(`/api/tasks/${taskId}/subtasks/${st.id}`), 'Xóa checklist thất bại')}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="tw-block" style={{ alignItems: 'center' }}>
              <span style={{ width: 22 }} />
              <Plus size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                className="tw-block-input"
                placeholder="Thêm mục checklist, Enter để lưu..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
              />
            </div>
          </div>

          {/* Child tasks */}
          <div className="tw-section-title"><Network size={14} /> Task con {task.children?.length > 0 && <span style={{ fontWeight: 500 }}>{task.children.length}</span>}</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'none' }}>
            {(task.children || []).map((child: any) => (
              <div key={child.id} className="tw-list-row" onClick={async () => { await flushContent(); onOpenTask(child.id); }}>
                <button
                  className="icon-btn"
                  style={{ color: child.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-muted)' }}
                  onClick={(e) => { e.stopPropagation(); toggleChildDone(child); }}
                >
                  {child.status === 'COMPLETED' ? <CircleCheck size={16} /> : <Circle size={16} />}
                </button>
                <span style={{ flexGrow: 1, textDecoration: child.status === 'COMPLETED' ? 'line-through' : 'none' }}>
                  {child.icon ? `${child.icon} ` : ''}{child.title}
                </span>
                {child.deadline && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(child.deadline)}</span>}
                <StatusBadge status={child.status} />
              </div>
            ))}
            <div className="tw-list-row" style={{ cursor: 'default' }}>
              <Plus size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ flexGrow: 1, border: 'none', padding: '4px', boxShadow: 'none', background: 'transparent' }}
                placeholder="Thêm task con, Enter để lưu..."
                value={newChild}
                onChange={(e) => setNewChild(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addChild(); }}
              />
            </div>
          </div>

          {/* Comments */}
          <div className="tw-section-title"><MessageSquare size={14} /> Bình luận {comments.length > 0 && <span style={{ fontWeight: 500 }}>{comments.length}</span>}</div>
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {comments.map((c) => (
              <div key={c.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-sidebar)', fontSize: '0.85rem' }}>
                <div className="flex align-center" style={{ gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>{new Date(c.createdAt).toLocaleString('vi-VN')}{c.updatedAt !== c.createdAt ? ' (đã sửa)' : ''}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
                    <button className="icon-btn" onClick={() => setEditingComment({ id: c.id, content: c.content })}><Pencil size={12} /></button>
                    <button
                      className="icon-btn danger"
                      onClick={() => onConfirm({
                        title: 'Xóa bình luận',
                        message: 'Bình luận sẽ bị xóa vĩnh viễn.',
                        confirmLabel: 'Xóa',
                        action: () => commentAction(() => api.delete(`/api/tasks/${taskId}/comments/${c.id}`), 'Xóa bình luận thất bại')
                      })}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
                {editingComment && editingComment.id === c.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      autoFocus
                      className="form-input"
                      style={{ resize: 'vertical', minHeight: 60 }}
                      value={editingComment.content}
                      onChange={(e) => setEditingComment({ id: c.id, content: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          const content = editingComment.content.trim();
                          setEditingComment(null);
                          if (content && content !== c.content) commentAction(() => api.patch(`/api/tasks/${taskId}/comments/${c.id}`, { content }), 'Sửa bình luận thất bại');
                        }}
                      >
                        Lưu
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingComment(null)}>Hủy</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                )}
              </div>
            ))}
            <div className="flex gap-2" style={{ alignItems: 'flex-end' }}>
              <textarea
                className="form-input"
                style={{ flexGrow: 1, resize: 'vertical', minHeight: 42 }}
                rows={1}
                placeholder="Viết bình luận... (Ctrl/⌘ + Enter để gửi)"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }}
              />
              <button className="btn btn-primary" onClick={addComment} disabled={!newComment.trim()}><Send size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
