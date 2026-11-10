import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Mail, Plug, Plus, Users as UsersIcon, X } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { hasRole, useAuth } from '../context/AuthContext';
import { useBusy } from './tasks/agent';
import { formatDate } from './tasks/shared';
import { ProgressBar, roleAtLeast, roleLabel } from './projects/shared';
import { ProjectOverview } from './projects/ProjectOverview';
import { ProjectTasks } from './projects/ProjectTasks';
import { ProjectPlan } from './projects/ProjectPlan';
import { TeamDocs } from './projects/TeamDocs';
import { ProjectMembers } from './projects/ProjectMembers';
import { ProjectSettings } from './projects/ProjectSettings';
import { TeamTaskPanel } from './projects/TeamTaskPanel';
import { McpConnectModal } from './projects/McpConnectModal';

const TABS = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'tasks', label: 'Công việc' },
  { value: 'plan', label: 'Kế hoạch' },
  { value: 'docs', label: 'Tài liệu' },
  { value: 'members', label: 'Thành viên' },
  { value: 'settings', label: 'Cài đặt' }
];

const DEFAULT_SOURCES = [
  { key: 'BE', name: 'Backend' },
  { key: 'AD', name: 'Admin web' },
  { key: 'APP', name: 'Mobile app' }
];

const CreateProjectModal: React.FC<{ onClose: () => void; onCreated: (project: any) => void }> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ key: '', name: '', description: '', targetDate: '' });
  const [sources, setSources] = useState(DEFAULT_SOURCES.map((s) => ({ ...s, enabled: true })));
  const { busy, run } = useBusy();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const project = await api.post('/api/team-projects', {
          key: form.key.trim().toUpperCase(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          targetDate: form.targetDate || undefined,
          sources: sources.filter((s) => s.enabled && s.key.trim()).map((s) => ({ key: s.key.trim().toUpperCase(), name: s.name.trim() || s.key }))
        });
        onCreated(project);
      } catch (err) {
        alert(getErrorMessage(err, 'Không tạo được dự án'));
      }
    });
  };

  return (
    <div className="modal-overlay">
      <form className="modal-content" style={{ maxWidth: 560 }} onSubmit={submit}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Tạo dự án nhóm</h3>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          <div className="pj-form-row">
            <div className="form-group" style={{ flex: '0 0 140px' }}>
              <label className="form-label">Mã dự án <span className="form-required">*</span></label>
              <input className="form-input" placeholder="NEXQ" maxLength={10} value={form.key} required
                onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Tên dự án <span className="form-required">*</span></label>
              <input className="form-input" placeholder="NexQ" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -6 }}>Mã dự án là tiền tố của mã task (NEXQ-12), không đổi được sau khi tạo.</span>
          <div className="form-group">
            <label className="form-label">Mô tả tổng quan</label>
            <textarea className="form-input" rows={3} placeholder="Mục tiêu, phạm vi, link tài liệu chính... (Markdown)" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group" style={{ maxWidth: 200 }}>
            <label className="form-label">Ngày mục tiêu</label>
            <input type="date" className="form-input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Source (mảng mã nguồn)</label>
            <div className="flex flex-col gap-2">
              {sources.map((s, i) => (
                <div key={i} className="flex align-center gap-2">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
                  <input className="form-input" style={{ width: 90 }} value={s.key} placeholder="BE"
                    onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, key: e.target.value.toUpperCase() } : x)))} />
                  <input className="form-input" style={{ flex: 1 }} value={s.name} placeholder="Tên"
                    onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="tw-quick-add" onClick={() => setSources([...sources, { key: '', name: '', enabled: true }])}><Plus size={14} /> Thêm source</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy ? 'Đang tạo...' : 'Tạo dự án'}</button>
        </div>
      </form>
    </div>
  );
};

const ProjectList: React.FC<{ onOpen: (key: string) => void; onMcp: () => void }> = ({ onOpen, onMcp }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const { busy, run } = useBusy();

  const load = useCallback(async () => {
    try {
      const [list, mine] = await Promise.all([
        api.get('/api/team-projects', { noCache: true }),
        api.get('/api/team-invites/mine', { noCache: true }).catch(() => [])
      ]);
      setProjects(list || []);
      setInvites(mine || []);
    } catch (err) {
      setProjects([]);
      alert(getErrorMessage(err, 'Không tải được danh sách dự án'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = (invite: any, accept: boolean) =>
    run(invite.id, async () => {
      try {
        await api.post(`/api/team-invites/${invite.id}/${accept ? 'accept' : 'decline'}`, {});
        if (accept) onOpen(invite.project.key);
        else load();
      } catch (err) {
        alert(getErrorMessage(err, 'Không xử lý được lời mời'));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex align-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Dự án nhóm</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Bạn chỉ thấy các dự án mình được mời tham gia.</span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onMcp}><Plug size={16} /> Kết nối MCP</button>
          {hasRole(user, 'ADMIN') && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Tạo dự án</button>}
        </div>
      </div>

      {invites.length > 0 && (
        <div className="card flex flex-col gap-2">
          <div className="flex align-center gap-2" style={{ fontWeight: 600, fontSize: '0.9rem' }}><Mail size={16} /> Lời mời đang chờ</div>
          {invites.map((invite) => (
            <div key={invite.id} className="pj-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{invite.project.name}</b> <span style={{ color: 'var(--text-muted)' }}>({invite.project.key}) · vai trò {roleLabel(invite.role)} · hết hạn {formatDate(invite.expiresAt)}</span>
              </div>
              <button className="btn btn-secondary btn-sm" disabled={busy === invite.id} onClick={() => respond(invite, false)}>Từ chối</button>
              <button className="btn btn-primary btn-sm" disabled={busy === invite.id} onClick={() => respond(invite, true)}>Tham gia</button>
            </div>
          ))}
        </div>
      )}

      {projects === null ? (
        <div className="loading-container"><span className="spinner" /> Đang tải...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={32} className="empty-state-icon" />
          <div style={{ fontWeight: 600 }}>Chưa có dự án nào</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {hasRole(user, 'ADMIN') ? 'Tạo dự án rồi mời thành viên qua email.' : 'Nhờ quản lý dự án mời bạn qua email đang đăng nhập.'}
          </div>
        </div>
      ) : (
        <div className="pj-grid">
          {projects.map((p) => (
            <button key={p.id} className="card card-hover pj-card" onClick={() => onOpen(p.key)}>
              <div className="flex align-center justify-between gap-2">
                <span className="pj-key">{p.key}</span>
                <span className="badge">{roleLabel(p.myRole)}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: '1rem', textAlign: 'left' }}>{p.name}</div>
              <ProgressBar value={p.stats.progress} />
              <div className="pj-card-meta">
                <span>{p.stats.progress}% · {p.stats.done}/{p.stats.total - p.stats.byStatus.CANCELLED} task</span>
                {p.stats.overdue > 0 && <span className="tw-overdue">{p.stats.overdue} trễ hạn</span>}
                {p.myOpenTaskCount > 0 && <span>{p.myOpenTaskCount} việc của tôi</span>}
                <span className="flex align-center gap-1"><UsersIcon size={12} /> {p.memberCount}</span>
                {p.targetDate && <span>Mục tiêu {formatDate(p.targetDate)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <CreateProjectModal onClose={() => setCreating(false)} onCreated={(project) => { setCreating(false); onOpen(project.key); }} />}
    </div>
  );
};

export const Projects: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const projectKey = params.get('project');
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview';
  const taskRef = params.get('task');
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState('');
  const [mcpOpen, setMcpOpen] = useState(false);
  // Bumped after a task changes in the side panel so the open tab refetches
  const [version, setVersion] = useState(0);

  const setParam = useCallback((changes: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      return next;
    });
  }, [setParams]);

  const loadProject = useCallback(async () => {
    if (!projectKey) return;
    try {
      setProject(await api.get(`/api/team-projects/${projectKey}`, { noCache: true }));
      setError('');
    } catch (err) {
      setProject(null);
      setError(getErrorMessage(err, 'Không mở được dự án'));
    }
  }, [projectKey]);

  useEffect(() => {
    setProject(null);
    loadProject();
  }, [loadProject]);

  const openTask = useCallback((ref: string | null) => setParam({ task: ref }), [setParam]);
  const refresh = useCallback(() => { loadProject(); setVersion((v) => v + 1); }, [loadProject]);

  if (!projectKey) {
    return (
      <>
        <ProjectList onOpen={(key) => setParam({ project: key, tab: 'overview', task: null })} onMcp={() => setMcpOpen(true)} />
        {mcpOpen && <McpConnectModal onClose={() => setMcpOpen(false)} />}
      </>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div style={{ fontWeight: 600 }}>{error}</div>
        <button className="btn btn-secondary" onClick={() => setParams({})}><ArrowLeft size={16} /> Về danh sách dự án</button>
      </div>
    );
  }
  if (!project) return <div className="loading-container"><span className="spinner" /> Đang tải dự án...</div>;

  const visibleTabs = TABS.filter((t) => t.value !== 'settings' || roleAtLeast(project.myRole, 'MANAGER'));
  const ctx = { project, reloadProject: refresh, openTask, version };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex align-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="flex align-center gap-2" style={{ minWidth: 0 }}>
          <button className="icon-btn" title="Danh sách dự án" onClick={() => setParams({})}><ArrowLeft size={18} /></button>
          <span className="pj-key">{project.key}</span>
          <h1 style={{ margin: 0, fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</h1>
          <span className="badge">{roleLabel(project.myRole)}</span>
          {project.isArchived && <span className="badge badge-warning">Đã lưu trữ</span>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setMcpOpen(true)}><Plug size={14} /> Kết nối MCP</button>
      </div>

      <div className="tabs pj-tabs">
        {visibleTabs.map((t) => (
          <button key={t.value} className={`tab ${tab === t.value ? 'active' : ''}`} onClick={() => setParam({ tab: t.value })}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <ProjectOverview {...ctx} />}
      {tab === 'tasks' && <ProjectTasks {...ctx} />}
      {tab === 'plan' && <ProjectPlan {...ctx} />}
      {tab === 'docs' && <TeamDocs {...ctx} />}
      {tab === 'members' && <ProjectMembers {...ctx} />}
      {tab === 'settings' && <ProjectSettings {...ctx} onDeleted={() => setParams({})} />}

      {taskRef && (
        <TeamTaskPanel
          key={taskRef}
          taskRef={taskRef}
          project={project}
          onClose={() => openTask(null)}
          onChanged={() => setVersion((v) => v + 1)}
        />
      )}
      {mcpOpen && <McpConnectModal onClose={() => setMcpOpen(false)} projectKey={project.key} />}
    </div>
  );
};

