import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Plus, Ellipsis, Pencil, Trash2, ArrowLeft, ArrowRight, Calendar, ListChecks, MessageSquare, Network } from 'lucide-react';
import {
  COLOR_PRESETS, STATUS_OPTIONS, Popover, PriorityBadge, TagChip, matchesFilters, formatDate, isOverdue,
  type ConfirmState, type TaskFilters
} from './shared';

interface TaskBoardProps {
  projectId: string;
  filters: TaskFilters;
  refreshKey: number;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
  onConfirm: (state: ConfirmState) => void;
}

interface DropTarget {
  columnId: string;
  index: number;
}

export const TaskCard: React.FC<{ task: any; onClick: () => void }> = ({ task, onClick }) => (
  <div onClick={onClick}>
    <div style={{ fontWeight: 500, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      {task.icon && <span>{task.icon}</span>}
      <span style={{ textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none', wordBreak: 'break-word' }}>{task.title}</span>
    </div>
    {(task.tags?.length > 0 || task.priority !== 'NONE') && (
      <div className="tw-card-meta">
        <PriorityBadge priority={task.priority} />
        {(task.tags || []).map((tag: any) => <TagChip key={tag.id} tag={tag} />)}
      </div>
    )}
    {(task.deadline || task.subtaskProgress?.total > 0 || task.childCount > 0 || task.commentCount > 0) && (
      <div className="tw-card-meta">
        {task.deadline && (
          <span className={`flex align-center ${isOverdue(task) ? 'tw-overdue' : ''}`} style={{ gap: '3px' }}>
            <Calendar size={11} />{formatDate(task.deadline)}
          </span>
        )}
        {task.subtaskProgress?.total > 0 && (
          <span className="flex align-center" style={{ gap: '3px' }}>
            <ListChecks size={11} />{task.subtaskProgress.completed}/{task.subtaskProgress.total}
          </span>
        )}
        {task.childCount > 0 && <span className="flex align-center" style={{ gap: '3px' }}><Network size={11} />{task.childCount}</span>}
        {task.commentCount > 0 && <span className="flex align-center" style={{ gap: '3px' }}><MessageSquare size={11} />{task.commentCount}</span>}
      </div>
    )}
  </div>
);

export const TaskBoard: React.FC<TaskBoardProps> = ({ projectId, filters, refreshKey, onOpenTask, onChanged, onConfirm }) => {
  const [board, setBoard] = useState<any | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [menuColumnId, setMenuColumnId] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<{ id: string; name: string } | null>(null);
  const [quickAddColumnId, setQuickAddColumnId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [deleteColumn, setDeleteColumn] = useState<{ column: any; moveTo: string } | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const data = await api.get(`/api/task-projects/${projectId}/board`, { noCache: true });
      setBoard(data);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được bảng'));
    }
  }, [projectId]);

  useEffect(() => {
    setBoard(null);
  }, [projectId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard, refreshKey]);

  const reload = async () => {
    await loadBoard();
    onChanged();
  };

  // ---------- drag & drop ----------

  const handleCardDragOver = (e: React.DragEvent, columnId: string, index: number) => {
    if (!dragTaskId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const next = { columnId, index: after ? index + 1 : index };
    if (!dropTarget || dropTarget.columnId !== next.columnId || dropTarget.index !== next.index) setDropTarget(next);
  };

  const handleColumnDragOver = (e: React.DragEvent, columnId: string, length: number) => {
    if (!dragTaskId) return;
    e.preventDefault();
    if (!dropTarget || dropTarget.columnId !== columnId) setDropTarget({ columnId, index: length });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = dragTaskId;
    const target = dropTarget;
    setDragTaskId(null);
    setDropTarget(null);
    if (!taskId || !target || !board) return;

    const column = board.columns.find((c: any) => c.id === target.columnId);
    const visible = column.tasks.filter((t: any) => matchesFilters(t, filters));
    // Neighbours come from the full list so filtered-out tasks keep their place
    const full = column.tasks.filter((t: any) => t.id !== taskId);
    const indexInFull = (id: string) => full.findIndex((t: any) => t.id === id);
    const after = visible.slice(target.index).find((t: any) => t.id !== taskId);
    const before = visible.slice(0, target.index).reverse().find((t: any) => t.id !== taskId);
    const next = after || (before ? full[indexInFull(before.id) + 1] : full[0]);
    const prev = after ? full[indexInFull(after.id) - 1] : before;

    const sourceColumn = board.columns.find((c: any) => c.tasks.some((t: any) => t.id === taskId));
    const sameSpot = sourceColumn?.id === column.id && (() => {
      const idx = column.tasks.findIndex((t: any) => t.id === taskId);
      return column.tasks[idx - 1]?.id === prev?.id && column.tasks[idx + 1]?.id === next?.id;
    })();
    if (sameSpot) return;

    // Optimistic update
    const moving = [...board.columns, { tasks: board.unassigned }].flatMap((c: any) => c.tasks).find((t: any) => t.id === taskId);
    const optimistic = {
      ...board,
      unassigned: board.unassigned.filter((t: any) => t.id !== taskId),
      columns: board.columns.map((c: any) => {
        const rest = c.tasks.filter((t: any) => t.id !== taskId);
        if (c.id !== column.id) return { ...c, tasks: rest };
        const at = next ? rest.findIndex((t: any) => t.id === next.id) : rest.length;
        rest.splice(at < 0 ? rest.length : at, 0, { ...moving, columnId: column.id, status: column.category });
        return { ...c, tasks: rest };
      })
    };
    setBoard(optimistic);

    try {
      const payload: any = {};
      if (sourceColumn?.id !== column.id) payload.columnId = column.id;
      if (prev) payload.prevId = prev.id;
      if (next) payload.nextId = next.id;
      if (!payload.columnId && !prev && !next) payload.columnId = column.id;
      await api.post(`/api/tasks/${taskId}/move`, payload);
    } catch (err) {
      alert(getErrorMessage(err, 'Di chuyển công việc thất bại'));
    }
    await reload();
  };

  // ---------- columns ----------

  const addColumn = async () => {
    try {
      await api.post(`/api/task-projects/${projectId}/columns`, { name: 'Cột mới', color: '#71717a', category: 'IN_PROGRESS' });
      await reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Thêm cột thất bại'));
    }
  };

  const updateColumn = async (columnId: string, patch: any) => {
    try {
      await api.patch(`/api/task-projects/${projectId}/columns/${columnId}`, patch);
      await reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật cột thất bại'));
    }
  };

  const moveColumn = async (columnId: string, dir: -1 | 1) => {
    const ids = board.columns.map((c: any) => c.id);
    const i = ids.indexOf(columnId);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.patch(`/api/task-projects/${projectId}/columns/reorder`, { ids });
      await reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Sắp xếp cột thất bại'));
    }
  };

  const confirmDeleteColumn = async () => {
    if (!deleteColumn) return;
    try {
      const qs = deleteColumn.moveTo ? `?moveToColumnId=${deleteColumn.moveTo}` : '';
      await api.delete(`/api/task-projects/${projectId}/columns/${deleteColumn.column.id}${qs}`);
      setDeleteColumn(null);
      await reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Xóa cột thất bại'));
    }
  };

  const quickAdd = async (columnId: string) => {
    if (!quickAddTitle.trim()) {
      setQuickAddColumnId(null);
      return;
    }
    try {
      await api.post('/api/tasks', { title: quickAddTitle.trim(), projectId, columnId });
      setQuickAddTitle('');
      await reload();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo công việc thất bại'));
    }
  };

  if (!board) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải bảng...</span></div>;
  }

  const renderTasks = (column: any, droppable: boolean) => {
    const tasks = column.tasks.filter((t: any) => matchesFilters(t, filters));
    const showLineAt = droppable && dropTarget && dropTarget.columnId === column.id ? dropTarget.index : -1;
    return (
      <>
        {tasks.map((task: any, index: number) => (
          <React.Fragment key={task.id}>
            {showLineAt === index && <div className="tw-drop-line" />}
            <div
              className={`tw-card ${dragTaskId === task.id ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragTaskId(task.id); }}
              onDragEnd={() => { setDragTaskId(null); setDropTarget(null); }}
              onDragOver={droppable ? (e) => handleCardDragOver(e, column.id, index) : undefined}
            >
              <TaskCard task={task} onClick={() => onOpenTask(task.id)} />
            </div>
          </React.Fragment>
        ))}
        {showLineAt === tasks.length && <div className="tw-drop-line" />}
      </>
    );
  };

  return (
    <div className="tw-board">
      {board.columns.map((column: any, colIndex: number) => (
        <div
          key={column.id}
          className={`tw-column ${dropTarget?.columnId === column.id ? 'drag-over' : ''}`}
          onDragOver={(e) => handleColumnDragOver(e, column.id, column.tasks.filter((t: any) => matchesFilters(t, filters)).length)}
          onDrop={handleDrop}
        >
          <div className="tw-column-header" style={{ position: 'relative' }}>
            <span className="tw-column-dot" style={{ backgroundColor: column.color || 'var(--text-muted)' }} />
            {editingColumn && editingColumn.id === column.id ? (
              <input
                autoFocus
                className="form-input"
                style={{ padding: '2px 6px', fontSize: '0.85rem', flexGrow: 1 }}
                value={editingColumn.name}
                onChange={(e) => setEditingColumn({ id: column.id, name: e.target.value })}
                onBlur={() => {
                  if (editingColumn.name.trim() && editingColumn.name !== column.name) updateColumn(column.id, { name: editingColumn.name.trim() });
                  setEditingColumn(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingColumn(null);
                }}
              />
            ) : (
              <span style={{ flexGrow: 1, cursor: 'text' }} onDoubleClick={() => setEditingColumn({ id: column.id, name: column.name })}>
                {column.name}
                <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>{column.tasks.length}</span>
              </span>
            )}
            <button className="icon-btn" title="Thêm công việc" onClick={() => { setQuickAddColumnId(column.id); setQuickAddTitle(''); }}><Plus size={14} /></button>
            <button className="icon-btn" title="Tùy chọn cột" onClick={() => setMenuColumnId(menuColumnId === column.id ? null : column.id)}><Ellipsis size={14} /></button>
            {menuColumnId === column.id && (
              <Popover onClose={() => setMenuColumnId(null)} style={{ top: '100%', right: 8, width: 230 }}>
                <button className="tw-popover-item" onClick={() => { setEditingColumn({ id: column.id, name: column.name }); setMenuColumnId(null); }}>
                  <Pencil size={14} /> Đổi tên
                </button>
                <div style={{ padding: '6px 10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nhóm trạng thái</div>
                <select
                  className="form-input"
                  style={{ margin: '0 6px 6px', padding: '5px 8px', fontSize: '0.8rem' }}
                  value={column.category}
                  onChange={(e) => { updateColumn(column.id, { category: e.target.value }); setMenuColumnId(null); }}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div style={{ padding: '0 10px 4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Màu</div>
                <div className="flex" style={{ flexWrap: 'wrap', gap: '6px', padding: '0 10px 8px' }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { updateColumn(column.id, { color: c }); setMenuColumnId(null); }}
                      style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: column.color === c ? '2px solid var(--text-main)' : '2px solid transparent' }}
                    />
                  ))}
                </div>
                <button className="tw-popover-item" disabled={colIndex === 0} onClick={() => { moveColumn(column.id, -1); setMenuColumnId(null); }}>
                  <ArrowLeft size={14} /> Chuyển sang trái
                </button>
                <button className="tw-popover-item" disabled={colIndex === board.columns.length - 1} onClick={() => { moveColumn(column.id, 1); setMenuColumnId(null); }}>
                  <ArrowRight size={14} /> Chuyển sang phải
                </button>
                <button
                  className="tw-popover-item danger"
                  onClick={() => {
                    setMenuColumnId(null);
                    if (board.columns.length <= 1) {
                      onConfirm({ title: 'Không thể xóa', message: 'Project phải còn ít nhất một cột.', confirmLabel: 'Đã hiểu', action: () => {} });
                      return;
                    }
                    setDeleteColumn({ column, moveTo: board.columns.find((c: any) => c.id !== column.id).id });
                  }}
                >
                  <Trash2 size={14} /> Xóa cột
                </button>
              </Popover>
            )}
          </div>

          <div className="tw-column-body">
            {renderTasks(column, true)}
            {quickAddColumnId === column.id ? (
              <div className="tw-card" style={{ cursor: 'default' }}>
                <input
                  autoFocus
                  className="form-input"
                  style={{ width: '100%', padding: '4px 6px', fontSize: '0.85rem', border: 'none', boxShadow: 'none' }}
                  placeholder="Tên công việc, Enter để lưu..."
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') quickAdd(column.id);
                    if (e.key === 'Escape') { setQuickAddTitle(''); setQuickAddColumnId(null); }
                  }}
                  onBlur={() => { if (!quickAddTitle.trim()) setQuickAddColumnId(null); }}
                />
              </div>
            ) : (
              <button className="tw-quick-add" onClick={() => { setQuickAddColumnId(column.id); setQuickAddTitle(''); }}>
                <Plus size={14} /> Mới
              </button>
            )}
          </div>
        </div>
      ))}

      {board.unassigned.length > 0 && (
        <div className="tw-column" style={{ opacity: 0.85 }}>
          <div className="tw-column-header">
            <span className="tw-column-dot" style={{ backgroundColor: 'var(--text-muted)' }} />
            <span style={{ flexGrow: 1 }}>Chưa phân cột <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{board.unassigned.length}</span></span>
          </div>
          <div className="tw-column-body">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 4px' }}>Trạng thái của các task này chưa có cột tương ứng. Kéo sang một cột để phân loại.</p>
            {renderTasks({ id: '__unassigned', tasks: board.unassigned }, false)}
          </div>
        </div>
      )}

      <button className="tw-quick-add" style={{ width: 200, flexShrink: 0, padding: '10px 12px' }} onClick={addColumn}>
        <Plus size={14} /> Thêm cột
      </button>

      {deleteColumn && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header"><h3 style={{ margin: 0 }}>Xóa cột “{deleteColumn.column.name}”</h3></div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                {deleteColumn.column.tasks.length} công việc trong cột sẽ được chuyển sang:
              </p>
              <select className="form-input" style={{ width: '100%' }} value={deleteColumn.moveTo} onChange={(e) => setDeleteColumn({ ...deleteColumn, moveTo: e.target.value })}>
                {board.columns.filter((c: any) => c.id !== deleteColumn.column.id).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteColumn(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={confirmDeleteColumn}>Xóa cột</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
