import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { matchesFilters, priorityMeta, statusMeta, toDateInput, ymd, type TaskFilters } from './shared';

interface TaskCalendarProps {
  mode: 'CALENDAR' | 'TIMELINE';
  projectId: string | null; // null = Inbox
  filters: TaskFilters;
  refreshKey: number;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY_MS = 24 * 60 * 60 * 1000;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const taskRange = (t: any) => {
  const start = toDateInput(t.startDate || t.deadline);
  const end = toDateInput(t.deadline || t.startDate);
  return start <= end ? { start, end } : { start: end, end: start };
};

export const TaskCalendar: React.FC<TaskCalendarProps> = ({ mode, projectId, filters, refreshKey, onOpenTask, onChanged }) => {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragTask, setDragTask] = useState<any | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const cancelAddRef = useRef(false);

  const { gridStart, gridEnd } = useMemo(() => {
    if (mode === 'TIMELINE') {
      return { gridStart: month, gridEnd: new Date(month.getFullYear(), month.getMonth() + 1, 0) };
    }
    const offset = (month.getDay() + 6) % 7; // Monday-first
    const start = addDays(month, -offset);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const endOffset = 6 - ((last.getDay() + 6) % 7);
    return { gridStart: start, gridEnd: addDays(last, endOffset) };
  }, [month, mode]);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) list.push(d);
    return list;
  }, [gridStart, gridEnd]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ from: ymd(gridStart), to: ymd(gridEnd), projectId: projectId || 'none' });
    try {
      const data = await api.get(`/api/tasks/calendar?${params.toString()}`, { noCache: true });
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được lịch'));
    } finally {
      setLoading(false);
    }
  }, [gridStart, gridEnd, projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const visibleTasks = tasks.filter((t) => matchesFilters(t, filters));
  const todayKey = ymd(new Date());

  // Shift both dates by the same number of days so the task keeps its duration
  const handleDropOnDay = async (dayKey: string) => {
    const task = dragTask;
    setDragTask(null);
    setDragOverDay(null);
    if (!task) return;
    const anchor = toDateInput(task.deadline || task.startDate);
    const delta = Math.round((parseDay(dayKey).getTime() - parseDay(anchor).getTime()) / DAY_MS);
    if (delta === 0) return;
    const shift = (iso: string | null) => (iso ? ymd(addDays(parseDay(toDateInput(iso)), delta)) : null);
    try {
      await api.patch(`/api/tasks/${task.id}`, {
        ...(task.startDate ? { startDate: shift(task.startDate) } : {}),
        ...(task.deadline ? { deadline: shift(task.deadline) } : {})
      });
      await load();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Đổi ngày thất bại'));
    }
  };

  const createOnDay = async (dayKey: string) => {
    const title = newTitle.trim();
    setAddingDay(null);
    setNewTitle('');
    if (!title || cancelAddRef.current) return;
    try {
      await api.post('/api/tasks', { title, deadline: dayKey, ...(projectId ? { projectId } : {}) });
      await load();
      onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo công việc thất bại'));
    }
  };

  const header = (
    <div className="flex align-center gap-2 mb-2">
      <button className="btn btn-secondary btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
      <button className="btn btn-secondary btn-sm" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Hôm nay</button>
      <button className="btn btn-secondary btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0 8px' }}>Tháng {month.getMonth() + 1}, {month.getFullYear()}</h3>
    </div>
  );

  if (loading) {
    return <div className="loading-container"><span className="spinner"></span><span>Đang tải lịch...</span></div>;
  }

  if (mode === 'TIMELINE') {
    const rows = [...visibleTasks].sort((a, b) => taskRange(a).start.localeCompare(taskRange(b).start));
    const firstKey = ymd(gridStart);
    const lastKey = ymd(gridEnd);
    const colOf = (key: string) => Math.round((parseDay(key).getTime() - gridStart.getTime()) / DAY_MS) + 2;
    return (
      <div>
        {header}
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="tw-timeline" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(26px, 1fr))` }}>
            <div className="tw-tl-head" style={{ position: 'sticky', left: 0, zIndex: 2 }}>Công việc</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="tw-tl-head" style={{ fontWeight: ymd(d) === todayKey ? 700 : 500, color: ymd(d) === todayKey ? 'var(--primary)' : undefined }}>
                {d.getDate()}
              </div>
            ))}
            {rows.length === 0 && (
              <div style={{ gridColumn: `1 / span ${days.length + 1}`, padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Không có công việc nào có ngày trong tháng này.
              </div>
            )}
            {rows.map((task, i) => {
              const { start, end } = taskRange(task);
              const from = start < firstKey ? firstKey : start;
              const to = end > lastKey ? lastKey : end;
              const color = statusMeta(task.status).color;
              return (
                <React.Fragment key={task.id}>
                  <div className="tw-tl-label" style={{ gridRow: i + 2 }} onClick={() => onOpenTask(task.id)}>
                    {task.icon ? `${task.icon} ` : ''}{task.title}
                  </div>
                  <div
                    className="tw-tl-bar"
                    style={{ gridRow: i + 2, gridColumn: `${colOf(from)} / ${colOf(to) + 1}`, backgroundColor: color, margin: '0 2px' }}
                    title={`${task.title}: ${start} → ${end}`}
                    onClick={() => onOpenTask(task.id)}
                  >
                    {task.title}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="tw-calendar">
        {WEEKDAYS.map((w) => <div key={w} className="tw-cal-head">{w}</div>)}
        {days.map((d) => {
          const key = ymd(d);
          const dayTasks = visibleTasks.filter((t) => {
            const { start, end } = taskRange(t);
            return start <= key && key <= end;
          });
          return (
            <div
              key={key}
              className={`tw-cal-cell ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${dragOverDay === key ? 'drag-over' : ''}`}
              onDragOver={(e) => { if (dragTask) { e.preventDefault(); setDragOverDay(key); } }}
              onDragLeave={() => setDragOverDay((cur) => (cur === key ? null : cur))}
              onDrop={(e) => { e.preventDefault(); handleDropOnDay(key); }}
            >
              <div className={`tw-cal-day ${key === todayKey ? 'today' : ''}`}>
                <span>{d.getDate()}</span>
                <button className="icon-btn" title="Thêm công việc" onClick={() => { cancelAddRef.current = false; setAddingDay(key); setNewTitle(''); }}><Plus size={12} /></button>
              </div>
              {dayTasks.map((task) => (
                <div
                  key={task.id}
                  className={`tw-chip ${task.status === 'COMPLETED' ? 'done' : ''}`}
                  style={{ borderLeftColor: priorityMeta(task.priority).color }}
                  draggable
                  onDragStart={() => setDragTask(task)}
                  onDragEnd={() => { setDragTask(null); setDragOverDay(null); }}
                  onClick={() => onOpenTask(task.id)}
                  title={task.title}
                >
                  {task.icon ? `${task.icon} ` : ''}{task.title}
                </div>
              ))}
              {addingDay === key && (
                <input
                  autoFocus
                  className="form-input"
                  style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                  placeholder="Tên công việc..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { cancelAddRef.current = true; (e.target as HTMLInputElement).blur(); }
                  }}
                  onBlur={() => createOnDay(key)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
