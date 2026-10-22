import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Circle, CircleCheck, Plus, ListChecks, MessageSquare, Network } from 'lucide-react';
import {
  PRIORITY_OPTIONS, STATUS_OPTIONS, PriorityBadge, StatusBadge, TagChip, filtersToQuery, formatDate, isOverdue, toDateInput,
  type TaskFilters
} from './shared';

interface TaskTableProps {
  variant: 'LIST' | 'TABLE';
  projectId: string | null; // null = Inbox
  columns: any[];
  filters: TaskFilters;
  sort: string;
  order: 'asc' | 'desc';
  onSortChange: (sort: string, order: 'asc' | 'desc') => void;
  refreshKey: number;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
}

const LIMIT = 50;

export const TaskTable: React.FC<TaskTableProps> = ({
  variant, projectId, columns, filters, sort, order, onSortChange, refreshKey, onOpenTask, onChanged
}) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    const params = filtersToQuery(filters);
    params.set('projectId', projectId || 'none');
    params.set('parentId', 'root');
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    params.set('sort', sort);
    params.set('order', order);
    try {
      const res = await api.get(`/api/tasks?${params.toString()}`, { noCache: true });
      setTasks(res.data || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách công việc'));
    } finally {
      setLoading(false);
    }
  }, [projectId, filters, page, sort, order]);

  useEffect(() => {
    setPage(1);
  }, [projectId, filters, sort, order]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const patchTask = async (id: string, patch: any) => {
    try {
      await api.patch(`/api/tasks/${id}`, patch);
      await load();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật công việc thất bại'));
    }
  };

  const moveToColumn = async (id: string, columnId: string) => {
    try {
      await api.post(`/api/tasks/${id}/move`, { columnId });
      await load();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Di chuyển công việc thất bại'));
    }
  };

  const toggleDone = (task: any) => patchTask(task.id, { status: task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' });

  const createTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await api.post('/api/tasks', { title: newTitle.trim(), ...(projectId ? { projectId } : {}) });
      setNewTitle('');
      await load();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo công việc thất bại'));
    }
  };

  const toggleSort = (field: string) => {
    if (sort === field) onSortChange(field, order === 'asc' ? 'desc' : 'asc');
    else onSortChange(field, 'asc');
  };

  const SortHeader: React.FC<{ field: string; label: string; width?: number }> = ({ field, label, width }) => (
    <th className="sortable" style={{ width }} onClick={() => toggleSort(field)}>
      <span className="flex align-center" style={{ gap: '4px' }}>
        {label}
        {sort === field && (order === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  const statusCell = (task: any) => {
    if (projectId && columns.length > 0) {
      const col = columns.find((c) => c.id === task.columnId);
      return (
        <select
          className="tw-cell-select"
          style={{ color: col?.color || 'var(--text-main)', fontWeight: 600 }}
          value={task.columnId || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => moveToColumn(task.id, e.target.value)}
        >
          {!col && <option value="">Chưa phân cột</option>}
          {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      );
    }
    return (
      <select
        className="tw-cell-select"
        value={task.status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => patchTask(task.id, { status: e.target.value })}
      >
        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    );
  };

  const addRow = (
    <div className="tw-list-row" style={{ cursor: 'default' }}>
      <Plus size={16} style={{ color: 'var(--text-muted)' }} />
      <input
        className="form-input"
        style={{ flexGrow: 1, border: 'none', padding: '4px', boxShadow: 'none', background: 'transparent' }}
        placeholder="Thêm công việc mới, Enter để lưu..."
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') createTask(); }}
      />
    </div>
  );

  const pagination = totalPages > 1 && (
    <div className="flex justify-between align-center" style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
      <span>Trang {page} / {totalPages} (Tổng: {total})</span>
      <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
    </div>
  );

  if (loading) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>;
  }

  if (variant === 'LIST') {
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {tasks.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có công việc nào.</div>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="tw-list-row" onClick={() => onOpenTask(task.id)}>
            <button
              className="icon-btn"
              style={{ color: task.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-muted)' }}
              onClick={(e) => { e.stopPropagation(); toggleDone(task); }}
            >
              {task.status === 'COMPLETED' ? <CircleCheck size={18} /> : <Circle size={18} />}
            </button>
            {task.icon && <span>{task.icon}</span>}
            <span style={{
              flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
              color: task.status === 'COMPLETED' ? 'var(--text-muted)' : 'var(--text-main)'
            }}>
              {task.title}
            </span>
            <PriorityBadge priority={task.priority} />
            {(task.tags || []).slice(0, 2).map((tag: any) => <TagChip key={tag.id} tag={tag} />)}
            {task.subtaskProgress?.total > 0 && (
              <span className="flex align-center" style={{ gap: '3px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <ListChecks size={12} />{task.subtaskProgress.completed}/{task.subtaskProgress.total}
              </span>
            )}
            {task.deadline && (
              <span className={isOverdue(task) ? 'tw-overdue' : ''} style={{ fontSize: '0.75rem', color: isOverdue(task) ? undefined : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {formatDate(task.deadline)}
              </span>
            )}
          </div>
        ))}
        {addRow}
        {pagination}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="tw-table">
        <thead>
          <tr>
            <SortHeader field="title" label="Tên công việc" />
            <th style={{ width: 150 }}>{projectId ? 'Cột / Trạng thái' : 'Trạng thái'}</th>
            <SortHeader field="priority" label="Ưu tiên" width={120} />
            <SortHeader field="startDate" label="Bắt đầu" width={130} />
            <SortHeader field="deadline" label="Deadline" width={130} />
            <th>Tags</th>
            <th style={{ width: 110 }}>Tiến độ</th>
            <SortHeader field="updatedAt" label="Cập nhật" width={110} />
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có công việc nào.</td></tr>
          )}
          {tasks.map((task) => (
            <tr key={task.id} className="tw-row" style={{ cursor: 'pointer' }} onClick={() => onOpenTask(task.id)}>
              <td style={{ fontWeight: 500, minWidth: 220 }}>
                <span className="flex align-center" style={{ gap: '6px' }}>
                  {task.icon && <span>{task.icon}</span>}
                  <span style={{ textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none' }}>{task.title}</span>
                  {task.childCount > 0 && <span className="flex align-center" style={{ gap: '2px', fontSize: '0.7rem', color: 'var(--text-muted)' }}><Network size={11} />{task.childCount}</span>}
                  {task.commentCount > 0 && <span className="flex align-center" style={{ gap: '2px', fontSize: '0.7rem', color: 'var(--text-muted)' }}><MessageSquare size={11} />{task.commentCount}</span>}
                </span>
              </td>
              <td>{statusCell(task)}</td>
              <td>
                <select
                  className="tw-cell-select"
                  style={{ color: PRIORITY_OPTIONS.find((p) => p.value === task.priority)?.color }}
                  value={task.priority}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => patchTask(task.id, { priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="date" className="tw-cell-select" value={toDateInput(task.startDate)} onChange={(e) => patchTask(task.id, { startDate: e.target.value || null })} />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="date"
                  className={`tw-cell-select ${isOverdue(task) ? 'tw-overdue' : ''}`}
                  value={toDateInput(task.deadline)}
                  onChange={(e) => patchTask(task.id, { deadline: e.target.value || null })}
                />
              </td>
              <td><span className="flex" style={{ gap: '4px', flexWrap: 'wrap' }}>{(task.tags || []).map((tag: any) => <TagChip key={tag.id} tag={tag} />)}</span></td>
              <td>
                {task.subtaskProgress?.total > 0 ? (
                  <div className="flex align-center" style={{ gap: '6px' }}>
                    <div className="progress-bar-container" style={{ height: 6 }}>
                      <div className="progress-bar-fill" style={{ width: `${(task.subtaskProgress.completed / task.subtaskProgress.total) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{task.subtaskProgress.completed}/{task.subtaskProgress.total}</span>
                  </div>
                ) : <StatusBadge status={task.status} />}
              </td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(task.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ borderTop: '1px solid var(--border-color)' }}>{addRow}</div>
      {pagination}
    </div>
  );
};
