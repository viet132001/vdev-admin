import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { GitPullRequestArrow } from 'lucide-react';
import { formatRelative } from './agent';

interface ReviewQueueProps {
  projects: any[];
  refreshKey: number;
  onOpenTask: (task: any) => void;
}

// Claude's finished tasks are children of the "Plan: …" task, so the board (root tasks only) does not show them.
// This list gathers every task waiting for review across projects.
export const ReviewQueue: React.FC<ReviewQueueProps> = ({ projects, refreshKey, onOpenTask }) => {
  const [tasks, setTasks] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/tasks?status=IN_REVIEW&limit=100&sort=updatedAt&order=desc', { noCache: true });
      setTasks(res?.data || []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách chờ review'));
      setTasks([]);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (tasks === null) return <div className="loading-container"><span className="spinner"></span></div>;
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <GitPullRequestArrow className="empty-state-icon" size={28} />
        <p>Không có task nào chờ review.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {tasks.map((t) => {
        const project = projects.find((p) => p.id === t.projectId);
        return (
          <div key={t.id} className="tw-list-row" onClick={() => onOpenTask(t)}>
            {t.assignee === 'AGENT' && <span className="tw-agent-badge">Claude</span>}
            <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {project && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{project.name}</span>}
            {t.latestChangeSet && (
              <span className="tw-diff-stat" style={{ whiteSpace: 'nowrap' }}>
                rev {t.latestChangeSet.revision} · <span className="plus">+{t.latestChangeSet.stats?.additions ?? 0}</span> <span className="minus">−{t.latestChangeSet.stats?.deletions ?? 0}</span>
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatRelative(t.updatedAt)}</span>
          </div>
        );
      })}
    </div>
  );
};
