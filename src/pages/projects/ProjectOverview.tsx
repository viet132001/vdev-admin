import React, { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Markdown } from '../tasks/PlanPanel';
import { formatDate } from '../tasks/shared';
import { Avatar, ProgressBar, TEAM_STATUS, TeamStatusBadge, memberName, type ProjectTabProps } from './shared';

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string; hint?: string }> = ({ label, value, tone, hint }) => (
  <div className="card pj-stat">
    <span className="pj-stat-label">{label}</span>
    <span className="pj-stat-value" style={{ color: tone }}>{value}</span>
    {hint && <span className="pj-stat-hint">{hint}</span>}
  </div>
);

// Status split as one stacked bar; colors come from TEAM_STATUS (CSS variables)
const StatusBar: React.FC<{ byStatus: Record<string, number> }> = ({ byStatus }) => {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (!total) return <div className="pj-statusbar empty" />;
  return (
    <div className="pj-statusbar" role="img" aria-label="Phân bố trạng thái">
      {TEAM_STATUS.filter((s) => byStatus[s.value]).map((s) => (
        <span key={s.value} title={`${s.label}: ${byStatus[s.value]}`}
          style={{ width: `${(byStatus[s.value] / total) * 100}%`, backgroundColor: s.color, opacity: s.value === 'CANCELLED' ? 0.35 : 1 }} />
      ))}
    </div>
  );
};

const TaskMini: React.FC<{ task: any; project: any; onOpen: () => void }> = ({ task, project, onOpen }) => {
  const source = project.sources.find((s: any) => s.id === task.sourceId);
  return (
    <button className="pj-mini" onClick={onOpen}>
      <span className="pj-task-key">{task.key}</span>
      <span className="pj-mini-title">{task.title}</span>
      {source && <span className="tw-tag neutral">{source.key}</span>}
      <Avatar name={task.assigneeId ? memberName(project, task.assigneeId) : null} size={20} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(task.dueDate)}</span>
    </button>
  );
};

export const ProjectOverview: React.FC<ProjectTabProps> = ({ project, openTask, version }) => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    api.get(`/api/team-projects/${project.id}/stats`, { noCache: true })
      .then((data) => alive && setStats(data))
      .catch((err) => alert(getErrorMessage(err, 'Không tải được thống kê')));
    return () => { alive = false; };
  }, [project.id, version]);

  if (!stats) return <div className="loading-container"><span className="spinner" /> Đang tính tiến độ...</div>;
  const { overall } = stats;
  const open = overall.byStatus.TODO + overall.byStatus.IN_PROGRESS + overall.byStatus.IN_REVIEW + overall.byStatus.BLOCKED;
  const members = project.members as any[];
  const maxWeekly = Math.max(1, ...stats.weekly.map((w: any) => Math.max(w.created, w.completed)));

  return (
    <div className="flex flex-col gap-4">
      <div className="pj-stats">
        <Stat label="Tiến độ" value={`${overall.progress}%`} hint={`${overall.done}/${overall.total - overall.byStatus.CANCELLED} task Done`} />
        <Stat label="Đang mở" value={open} hint={`${overall.byStatus.IN_PROGRESS} đang làm · ${overall.byStatus.IN_REVIEW} chờ review`} />
        <Stat label="Trễ hạn" value={overall.overdue} tone={overall.overdue ? 'var(--danger)' : undefined} />
        <Stat label="Bị chặn" value={overall.byStatus.BLOCKED} tone={overall.byStatus.BLOCKED ? 'var(--warning)' : undefined} />
        <Stat label="Giờ còn lại (ước lượng)" value={overall.openEstimateHours} hint={project.targetDate ? `Mục tiêu ${formatDate(project.targetDate)}` : undefined} />
      </div>

      <div className="card flex flex-col gap-2">
        <div className="flex align-center justify-between"><b>Phân bố trạng thái</b><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{overall.total} task</span></div>
        <StatusBar byStatus={overall.byStatus} />
        <div className="pj-legend">
          {TEAM_STATUS.map((s) => (
            <span key={s.value}><span className="tw-column-dot" style={{ backgroundColor: s.color, width: 8, height: 8 }} /> {s.label} {overall.byStatus[s.value]}</span>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <b>Theo source — ai đang làm gì</b>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Source</th><th>Phụ trách</th><th style={{ minWidth: 140 }}>Tiến độ</th>
                {members.map((m) => <th key={m.userId} title={m.email} style={{ textAlign: 'center' }}><Avatar name={m.fullName} size={22} /></th>)}
                <th style={{ textAlign: 'center' }}>Chưa giao</th><th style={{ textAlign: 'center' }}>Trễ</th>
              </tr>
            </thead>
            <tbody>
              {stats.sources.map((s: any) => {
                const cell = (assigneeId: string | null) => {
                  const a = s.assignees.find((x: any) => x.assigneeId === assigneeId);
                  const openCount = a ? a.byStatus.TODO + a.byStatus.IN_PROGRESS + a.byStatus.IN_REVIEW + a.byStatus.BLOCKED : 0;
                  return <td style={{ textAlign: 'center', color: openCount ? 'var(--text-main)' : 'var(--text-muted)' }} title="Task đang mở">{openCount || '·'}</td>;
                };
                return (
                  <tr key={s.sourceId || 'none'}>
                    <td><b>{s.key || '—'}</b> <span style={{ color: 'var(--text-muted)' }}>{s.name}</span></td>
                    <td>{s.lead?.fullName || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>
                      <div className="flex align-center gap-2"><div style={{ flex: 1 }}><ProgressBar value={s.progress} /></div><span style={{ fontSize: '0.75rem' }}>{s.progress}%</span></div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.done}/{s.total - s.byStatus.CANCELLED} Done</span>
                    </td>
                    {members.map((m) => <React.Fragment key={m.userId}>{cell(m.userId)}</React.Fragment>)}
                    {cell(null)}
                    <td style={{ textAlign: 'center' }} className={s.overdue ? 'tw-overdue' : ''}>{s.overdue || '·'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pj-two-col">
        <div className="card flex flex-col gap-2">
          <b>Khối lượng theo người</b>
          {stats.members.map((m: any) => {
            const openCount = m.byStatus.TODO + m.byStatus.IN_PROGRESS + m.byStatus.IN_REVIEW + m.byStatus.BLOCKED;
            return (
              <div key={m.userId || 'none'} className="pj-row">
                <Avatar name={m.userId ? m.fullName : null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{m.fullName}</div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {openCount} đang mở · {m.byStatus.IN_PROGRESS} đang làm · {m.done} Done{m.openEstimateHours ? ` · còn ${m.openEstimateHours}h` : ''}
                  </span>
                </div>
                {m.overdue > 0 && <span className="tw-overdue" style={{ fontSize: '0.75rem' }}>{m.overdue} trễ</span>}
                <div style={{ width: 80 }}><ProgressBar value={m.progress} /></div>
              </div>
            );
          })}
        </div>

        <div className="card flex flex-col gap-2">
          <b>Kế hoạch (milestone)</b>
          {stats.milestones.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa có milestone. Thêm ở tab Kế hoạch.</span>}
          {stats.milestones.map((m: any) => (
            <div key={m.milestoneId} className="flex flex-col gap-1">
              <div className="flex align-center justify-between gap-2" style={{ fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 500 }}>{m.name}</span>
                <span style={{ fontSize: '0.75rem', color: m.isLate ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {m.dueDate ? `Hạn ${formatDate(m.dueDate)}` : 'Chưa có hạn'}{m.isLate ? ' · trễ' : ''}
                </span>
              </div>
              <ProgressBar value={m.progress} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.done}/{m.total - m.byStatus.CANCELLED} Done · {m.overdue} task trễ</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pj-two-col">
        <div className="card flex flex-col gap-1">
          <b style={{ color: stats.overdue.length ? 'var(--danger)' : undefined }}>Trễ hạn ({stats.overdue.length})</b>
          {stats.overdue.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Không có task trễ hạn.</span>}
          {stats.overdue.map((t: any) => <TaskMini key={t.id} task={t} project={project} onOpen={() => openTask(t.key)} />)}
        </div>
        <div className="card flex flex-col gap-1">
          <b>Đến hạn trong 7 ngày ({stats.dueSoon.length})</b>
          {stats.dueSoon.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Không có task sắp đến hạn.</span>}
          {stats.dueSoon.map((t: any) => <TaskMini key={t.id} task={t} project={project} onOpen={() => openTask(t.key)} />)}
        </div>
      </div>

      {stats.blocked.length > 0 && (
        <div className="card flex flex-col gap-1">
          <b>Bị chặn ({stats.blocked.length})</b>
          {stats.blocked.map((t: any) => (
            <div key={t.id} className="flex align-center gap-2"><TeamStatusBadge status="BLOCKED" /><div style={{ flex: 1 }}><TaskMini task={t} project={project} onOpen={() => openTask(t.key)} /></div></div>
          ))}
        </div>
      )}

      <div className="card flex flex-col gap-2">
        <div className="flex align-center justify-between">
          <b>8 tuần gần nhất</b>
          <span className="pj-legend"><span><span className="pj-swatch" style={{ backgroundColor: 'var(--border-strong)' }} /> Tạo mới</span><span><span className="pj-swatch" style={{ backgroundColor: 'var(--success)' }} /> Done</span></span>
        </div>
        <div className="pj-weekly">
          {stats.weekly.map((w: any) => (
            <div key={w.weekStart} className="pj-week" title={`Tuần từ ${formatDate(w.weekStart)}: tạo ${w.created}, Done ${w.completed}`}>
              <div className="pj-week-bars">
                <span style={{ height: `${(w.created / maxWeekly) * 100}%`, backgroundColor: 'var(--border-strong)', visibility: w.created ? 'visible' : 'hidden' }} />
                <span style={{ height: `${(w.completed / maxWeekly) * 100}%`, backgroundColor: 'var(--success)', visibility: w.completed ? 'visible' : 'hidden' }} />
              </div>
              <span className="pj-week-label">{new Date(w.weekStart).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }).replace('-', '/')}</span>
              <span className="pj-week-label">{w.created}/{w.completed}</span>
            </div>
          ))}
        </div>
      </div>

      {project.description && (
        <div className="card"><b>Mô tả dự án</b><div style={{ marginTop: 6 }}><Markdown text={project.description} /></div></div>
      )}
    </div>
  );
};
