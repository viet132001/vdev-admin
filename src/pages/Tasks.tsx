import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api';
import {
  Plus, Inbox, Search, Ellipsis, Pencil, Trash2, Archive, ArchiveRestore, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Tag, X, SlidersHorizontal, Sparkles, GitPullRequestArrow, Monitor, FolderGit2
} from 'lucide-react';
import { TaskBoard } from './tasks/TaskBoard';
import { TaskTable } from './tasks/TaskTable';
import { TaskCalendar } from './tasks/TaskCalendar';
import { TaskDetail } from './tasks/TaskDetail';
import { PlanPanel } from './tasks/PlanPanel';
import { ReviewQueue } from './tasks/ReviewQueue';
import { RunnersModal } from './tasks/RunnersModal';
import { AgentSettingsModal, WorkspaceBadge } from './tasks/AgentSettingsModal';
import {
  COLOR_PRESETS, INBOX_VIEWS, PRIORITY_OPTIONS, VIEW_TYPES, ConfirmDialog, Popover, TagChip,
  type ConfirmState, type TaskFilters
} from './tasks/shared';

const INBOX = 'inbox';
const REVIEW = 'review';
// Not a saved view: the Claude plans of a project, shown as the last tab
const PLANS_VIEW = { id: '__plans', name: 'Kế hoạch', type: 'PLANS', config: null, virtual: true };

interface ProjectForm {
  id?: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  workspacePath: string;
}

const emptyProjectForm: ProjectForm = { name: '', description: '', icon: '', color: COLOR_PRESETS[0], workspacePath: '' };

export const Tasks: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get('project') || INBOX;
  const openTaskId = searchParams.get('task');

  const [projects, setProjects] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [project, setProject] = useState<any | null>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [inboxConfig, setInboxConfig] = useState<any>({});

  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm | null>(null);
  const [viewMenuId, setViewMenuId] = useState<string | null>(null);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [renamingView, setRenamingView] = useState<{ id: string; name: string } | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', color: COLOR_PRESETS[0] });
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [pendingPlans, setPendingPlans] = useState<any[]>([]);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState<any | null>(null);
  const [runnersOpen, setRunnersOpen] = useState(false);

  const updateParams = useCallback((patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
      return next;
    });
  }, [setSearchParams]);

  // ---------- data loading ----------

  const loadProjects = useCallback(async () => {
    try {
      const [list, inbox] = await Promise.all([
        api.get(`/api/task-projects?includeArchived=${showArchived}`, { noCache: true }),
        api.get('/api/tasks?projectId=none&limit=1', { noCache: true })
      ]);
      setProjects(Array.isArray(list) ? list : []);
      setInboxCount(inbox?.total ?? null);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
    const [review, plans] = await Promise.allSettled([
      api.get('/api/tasks?status=IN_REVIEW&limit=1', { noCache: true }),
      api.get('/api/task-plans?status=PENDING_APPROVAL', { noCache: true })
    ]);
    setReviewCount(review.status === 'fulfilled' ? review.value?.total ?? null : null);
    setPendingPlans(plans.status === 'fulfilled' && Array.isArray(plans.value) ? plans.value : []);
  }, [showArchived]);

  const loadTags = useCallback(async () => {
    try {
      const list = await api.get('/api/task-tags', { noCache: true });
      setTags(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load tags', err);
    }
  }, []);

  const loadProject = useCallback(async () => {
    if (scope === INBOX || scope === REVIEW) {
      setProject(null);
      return;
    }
    try {
      const detail = await api.get(`/api/task-projects/${scope}`, { noCache: true });
      setProject(detail);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được project'));
      updateParams({ project: null, view: null });
    }
  }, [scope, updateParams]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(handler);
  }, [keyword]);

  // Called by child views whenever task data changes (counts in the sidebar, tag usage...)
  const handleChanged = useCallback(() => {
    loadProjects();
    loadTags();
  }, [loadProjects, loadTags]);

  const refreshViews = () => setRefreshKey((k) => k + 1);

  // ---------- views ----------

  const views: any[] = scope === INBOX ? INBOX_VIEWS : project?.id === scope ? [...(project.views || []), PLANS_VIEW] : [];
  const projectPendingPlans = pendingPlans.filter((p) => p.projectId === scope).length;
  const activeView = views.find((v) => v.id === searchParams.get('view')) || views[0] || null;
  const viewConfig = (scope === INBOX ? inboxConfig[activeView?.id] : activeView?.config) || {};

  const filters: TaskFilters = useMemo(
    () => ({ keyword: debouncedKeyword, priority: viewConfig.priority || '', tagId: viewConfig.tagId || '' }),
    [debouncedKeyword, viewConfig.priority, viewConfig.tagId]
  );

  // Filters / sort live in the view's `config`, so each view remembers its own setup
  const updateViewConfig = async (patch: any) => {
    if (!activeView || activeView.virtual) return;
    const config = { ...viewConfig, ...patch };
    if (scope === INBOX) {
      setInboxConfig({ ...inboxConfig, [activeView.id]: config });
      return;
    }
    setProject({ ...project, views: project.views.map((v: any) => (v.id === activeView.id ? { ...v, config } : v)) });
    try {
      await api.patch(`/api/task-projects/${scope}/views/${activeView.id}`, { config });
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu cấu hình view thất bại'));
    }
  };

  const addView = async (type: string) => {
    setAddViewOpen(false);
    try {
      const label = VIEW_TYPES.find((t) => t.value === type)?.label || 'View';
      const view = await api.post(`/api/task-projects/${scope}/views`, { name: label, type, config: type === 'CALENDAR' ? { dateField: 'deadline' } : null });
      await loadProject();
      updateParams({ view: view.id });
    } catch (err) {
      alert(getErrorMessage(err, 'Thêm view thất bại'));
    }
  };

  const patchView = async (viewId: string, patch: any) => {
    try {
      await api.patch(`/api/task-projects/${scope}/views/${viewId}`, patch);
      await loadProject();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật view thất bại'));
    }
  };

  const moveView = async (viewId: string, dir: -1 | 1) => {
    const ids = views.map((v) => v.id);
    const i = ids.indexOf(viewId);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.patch(`/api/task-projects/${scope}/views/reorder`, { ids });
      await loadProject();
    } catch (err) {
      alert(getErrorMessage(err, 'Sắp xếp view thất bại'));
    }
  };

  const deleteView = (view: any) => {
    setConfirm({
      title: 'Xóa view',
      message: `Xóa view “${view.name}”? Công việc trong project không bị ảnh hưởng.`,
      confirmLabel: 'Xóa',
      action: async () => {
        try {
          await api.delete(`/api/task-projects/${scope}/views/${view.id}`);
          updateParams({ view: null });
          await loadProject();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa view thất bại'));
        }
      }
    });
  };

  // ---------- projects ----------

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm || !projectForm.name.trim()) return;
    const payload = {
      name: projectForm.name.trim(),
      description: projectForm.description.trim() || null,
      icon: projectForm.icon || null,
      color: projectForm.color,
      workspacePath: projectForm.workspacePath.trim() || null
    };
    if (payload.workspacePath && !/^(\/|[A-Za-z]:[\\/])/.test(payload.workspacePath)) {
      alert('Thư mục làm việc phải là đường dẫn tuyệt đối, ví dụ /Users/ban/code/du-an');
      return;
    }
    try {
      if (projectForm.id) {
        await api.patch(`/api/task-projects/${projectForm.id}`, payload);
        if (projectForm.id === scope) await loadProject();
      } else {
        const created = await api.post('/api/task-projects', payload);
        updateParams({ project: created.id, view: null, task: null });
      }
      setProjectForm(null);
      await loadProjects();
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu project thất bại'));
    }
  };

  const toggleArchive = async (p: any) => {
    try {
      await api.patch(`/api/task-projects/${p.id}`, { isArchived: !p.isArchived });
      await loadProjects();
      if (p.id === scope) await loadProject();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật project thất bại'));
    }
  };

  const moveProject = async (projectId: string, dir: -1 | 1) => {
    const ids = projects.map((p) => p.id);
    const i = ids.indexOf(projectId);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setProjects(ids.map((id) => projects.find((p) => p.id === id)));
    try {
      await api.patch('/api/task-projects/reorder', { ids });
    } catch (err) {
      alert(getErrorMessage(err, 'Sắp xếp project thất bại'));
    }
    await loadProjects();
  };

  const deleteProject = (p: any) => {
    setConfirm({
      title: 'Xóa project',
      message: <>Xóa project <b>{p.name}</b> cùng toàn bộ {p.taskCount ?? ''} công việc bên trong? (xóa mềm)</>,
      confirmLabel: 'Xóa project',
      action: async () => {
        try {
          await api.delete(`/api/task-projects/${p.id}`);
          if (p.id === scope) updateParams({ project: null, view: null, task: null });
          await loadProjects();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa project thất bại'));
        }
      }
    });
  };

  // ---------- tasks & tags ----------

  const createTask = async () => {
    try {
      const created = await api.post('/api/tasks', { title: 'Công việc mới', ...(scope !== INBOX ? { projectId: scope } : {}) });
      refreshViews();
      handleChanged();
      updateParams({ task: created.id });
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo công việc thất bại'));
    }
  };

  const openTask = useCallback((id: string) => updateParams({ task: id }), [updateParams]);
  const closeTask = useCallback(() => {
    updateParams({ task: null });
    refreshViews();
  }, [updateParams]);

  const createTag = async () => {
    if (!newTag.name.trim()) return;
    try {
      await api.post('/api/task-tags', { name: newTag.name.trim(), color: newTag.color });
      setNewTag({ name: '', color: COLOR_PRESETS[(tags.length + 1) % COLOR_PRESETS.length] });
      await loadTags();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo tag thất bại'));
    }
  };

  const patchTag = async (id: string, patch: any) => {
    try {
      await api.patch(`/api/task-tags/${id}`, patch);
      await loadTags();
      refreshViews();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật tag thất bại'));
    }
  };

  const deleteTag = (tag: any) => {
    setConfirm({
      title: 'Xóa tag',
      message: `Tag “${tag.name}” sẽ được gỡ khỏi ${tag.taskCount ?? 0} công việc.`,
      confirmLabel: 'Xóa tag',
      action: async () => {
        try {
          await api.delete(`/api/task-tags/${tag.id}`);
          if (viewConfig.tagId === tag.id) updateViewConfig({ tagId: '' });
          await loadTags();
          refreshViews();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa tag thất bại'));
        }
      }
    });
  };

  // ---------- render ----------

  const renderView = () => {
    if (scope === REVIEW) {
      return <ReviewQueue projects={projects} refreshKey={refreshKey} onOpenTask={(t) => updateParams({ task: t.id })} />;
    }
    if (!activeView) {
      return <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>;
    }
    const projectId = scope === INBOX ? null : scope;
    switch (activeView.type) {
      case 'BOARD':
        return projectId ? (
          <TaskBoard projectId={projectId} filters={filters} refreshKey={refreshKey} onOpenTask={openTask} onChanged={handleChanged} onConfirm={setConfirm} />
        ) : null;
      case 'LIST':
      case 'TABLE':
        return (
          <TaskTable
            variant={activeView.type}
            projectId={projectId}
            columns={project?.columns || []}
            filters={filters}
            sort={viewConfig.sort || (activeView.type === 'LIST' ? 'position' : 'createdAt')}
            order={viewConfig.order || (activeView.type === 'LIST' ? 'asc' : 'desc')}
            onSortChange={(sort, order) => updateViewConfig({ sort, order })}
            refreshKey={refreshKey}
            onOpenTask={openTask}
            onChanged={handleChanged}
          />
        );
      case 'CALENDAR':
      case 'TIMELINE':
        return <TaskCalendar mode={activeView.type} projectId={projectId} filters={filters} refreshKey={refreshKey} onOpenTask={openTask} onChanged={handleChanged} />;
      case 'PLANS':
        return project ? (
          <PlanPanel
            project={project}
            refreshKey={refreshKey}
            onOpenTask={openTask}
            onOpenSettings={() => setAgentSettingsOpen(project)}
            onChanged={() => { handleChanged(); refreshViews(); }}
            onProjectChanged={loadProject}
            onConfirm={setConfirm}
          />
        ) : null;
      default:
        return null;
    }
  };

  const activeProjects = projects.filter((p) => !p.isArchived);
  const archivedProjects = projects.filter((p) => p.isArchived);

  const renderProjectItem = (p: any, index: number) => (
    <div key={p.id} style={{ position: 'relative' }}>
      <button
        className={`tw-nav-item ${scope === p.id ? 'active' : ''}`}
        onClick={() => updateParams({ project: p.id, view: null, task: null })}
        style={{ opacity: p.isArchived ? 0.6 : 1 }}
      >
        {p.icon ? <span>{p.icon}</span> : <span className="tw-column-dot" style={{ backgroundColor: p.color || 'var(--text-muted)', margin: '0 3px' }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        <span className="tw-count">
          {pendingPlans.some((pl) => pl.projectId === p.id) && <span className="tw-pending-dot" title="Có kế hoạch chờ duyệt" />}
          {p.taskCount ?? ''}
        </span>
        <span className="tw-nav-actions">
          <span className="icon-btn" role="button" onClick={(e) => { e.stopPropagation(); setProjectMenuId(projectMenuId === p.id ? null : p.id); }}>
            <Ellipsis size={14} />
          </span>
        </span>
      </button>
      {projectMenuId === p.id && (
        <Popover onClose={() => setProjectMenuId(null)} style={{ top: '100%', left: 16 }}>
          <button className="tw-popover-item" onClick={() => { setProjectMenuId(null); setProjectForm({ id: p.id, name: p.name, description: p.description || '', icon: p.icon || '', color: p.color || COLOR_PRESETS[0], workspacePath: p.workspacePath || '' }); }}>
            <Pencil size={14} /> Chỉnh sửa
          </button>
          <button className="tw-popover-item" onClick={() => { setProjectMenuId(null); setAgentSettingsOpen(p); }}>
            <FolderGit2 size={14} /> Thư mục & Claude
          </button>
          {!p.isArchived && (
            <>
              <button className="tw-popover-item" disabled={index === 0} onClick={() => { setProjectMenuId(null); moveProject(p.id, -1); }}><ArrowUp size={14} /> Lên trên</button>
              <button className="tw-popover-item" disabled={index === activeProjects.length - 1} onClick={() => { setProjectMenuId(null); moveProject(p.id, 1); }}><ArrowDown size={14} /> Xuống dưới</button>
            </>
          )}
          <button className="tw-popover-item" onClick={() => { setProjectMenuId(null); toggleArchive(p); }}>
            {p.isArchived ? <><ArchiveRestore size={14} /> Bỏ lưu trữ</> : <><Archive size={14} /> Lưu trữ</>}
          </button>
          <button className="tw-popover-item danger" onClick={() => { setProjectMenuId(null); deleteProject(p); }}><Trash2 size={14} /> Xóa project</button>
        </Popover>
      )}
    </div>
  );

  return (
    <div className="tw-shell">
      {/* Sidebar: Inbox, projects, tags */}
      <aside className="tw-nav">
        <button className={`tw-nav-item ${scope === INBOX ? 'active' : ''}`} onClick={() => updateParams({ project: null, view: null, task: null })}>
          <Inbox size={16} /> Inbox
          <span className="tw-count">{inboxCount ?? ''}</span>
        </button>
        <button className={`tw-nav-item ${scope === REVIEW ? 'active' : ''}`} onClick={() => updateParams({ project: REVIEW, view: null, task: null })}>
          <GitPullRequestArrow size={16} /> Chờ review
          <span className="tw-count">{reviewCount ? <b style={{ color: 'var(--text-main)' }}>{reviewCount}</b> : ''}</span>
        </button>

        <div className="tw-nav-title">
          Projects
          <button className="icon-btn" title="Tạo project" onClick={() => setProjectForm({ ...emptyProjectForm })}><Plus size={14} /></button>
        </div>
        {activeProjects.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 8px' }}>Chưa có project nào.</p>
        )}
        {activeProjects.map(renderProjectItem)}

        {showArchived && archivedProjects.length > 0 && (
          <>
            <div className="tw-nav-title">Đã lưu trữ</div>
            {archivedProjects.map(renderProjectItem)}
          </>
        )}
        <button className="tw-nav-item" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => setShowArchived(!showArchived)}>
          <Archive size={14} /> {showArchived ? 'Ẩn project lưu trữ' : 'Hiện project lưu trữ'}
        </button>

        <div className="tw-nav-title">
          Tags
          <button className="icon-btn" title="Quản lý tag" onClick={() => setTagManagerOpen(true)}><SlidersHorizontal size={14} /></button>
        </div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: '4px', padding: '0 8px' }}>
          {tags.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chưa có tag.</span>}
          {tags.map((t) => (
            <span
              key={t.id}
              style={{ cursor: 'pointer', outline: viewConfig.tagId === t.id ? '2px solid var(--primary)' : 'none', borderRadius: 999 }}
              title="Lọc theo tag"
              onClick={() => updateViewConfig({ tagId: viewConfig.tagId === t.id ? '' : t.id })}
            >
              <TagChip tag={t} />
            </span>
          ))}
        </div>

        <button className="tw-nav-item" style={{ marginTop: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }} onClick={() => setRunnersOpen(true)}>
          <Monitor size={14} /> Claude trên máy này
        </button>
      </aside>

      {/* Main area */}
      <section className="tw-main">
        <header className="flex justify-between align-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 600 }}>
              {scope === INBOX ? 'Inbox' : scope === REVIEW ? 'Chờ review' : project ? `${project.icon ? `${project.icon} ` : ''}${project.name}` : '...'}
              {project?.isArchived && <span className="badge" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Đã lưu trữ</span>}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {scope === INBOX ? 'Công việc chưa thuộc project nào'
                : scope === REVIEW ? 'Task Claude đã làm xong, đang chờ bạn xem thay đổi và chốt Done'
                : project?.description || 'Quản lý công việc theo dạng bảng, danh sách, lịch'}
            </p>
          </div>
          <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
            {project && scope !== INBOX && scope !== REVIEW && (
              <button className="btn btn-secondary" onClick={() => setAgentSettingsOpen(project)} title="Thư mục làm việc & cài đặt Claude">
                <WorkspaceBadge project={project} />
              </button>
            )}
            {scope !== REVIEW && <button className="btn btn-primary" onClick={createTask}><Plus size={16} /> Tạo công việc</button>}
          </div>
        </header>

        {/* View tabs */}
        <div className="tabs" style={{ alignItems: 'center', overflow: 'visible', flexWrap: 'wrap' }}>
          {views.map((v, i) => {
            const meta = VIEW_TYPES.find((t) => t.value === v.type);
            const Icon = v.type === 'PLANS' ? Sparkles : meta?.icon;
            const isActive = activeView?.id === v.id;
            return (
              <div key={v.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {renamingView && renamingView.id === v.id ? (
                  <input
                    autoFocus
                    className="form-input"
                    style={{ padding: '4px 8px', fontSize: '0.85rem', width: 140 }}
                    value={renamingView.name}
                    onChange={(e) => setRenamingView({ id: v.id, name: e.target.value })}
                    onBlur={() => {
                      if (renamingView.name.trim() && renamingView.name !== v.name) patchView(v.id, { name: renamingView.name.trim() });
                      setRenamingView(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenamingView(null);
                    }}
                  />
                ) : (
                  <button
                    className={`tab ${isActive ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => updateParams({ view: v.id })}
                    onDoubleClick={() => scope !== INBOX && !v.virtual && setRenamingView({ id: v.id, name: v.name })}
                  >
                    {Icon && <Icon size={14} />} {v.name}
                    {v.type === 'PLANS' && projectPendingPlans > 0 && <span className="badge" style={{ color: 'var(--warning)' }}>{projectPendingPlans} chờ duyệt</span>}
                  </button>
                )}
                {scope !== INBOX && isActive && !renamingView && !v.virtual && (
                  <button className="icon-btn" onClick={() => setViewMenuId(viewMenuId === v.id ? null : v.id)}><Ellipsis size={14} /></button>
                )}
                {viewMenuId === v.id && (
                  <Popover onClose={() => setViewMenuId(null)} style={{ top: '100%', left: 0 }}>
                    <button className="tw-popover-item" onClick={() => { setViewMenuId(null); setRenamingView({ id: v.id, name: v.name }); }}><Pencil size={14} /> Đổi tên</button>
                    <div style={{ padding: '4px 10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Kiểu hiển thị</div>
                    {VIEW_TYPES.map((t) => {
                      const TIcon = t.icon;
                      return (
                        <button key={t.value} className="tw-popover-item" style={{ fontWeight: v.type === t.value ? 700 : 400 }} onClick={() => { setViewMenuId(null); patchView(v.id, { type: t.value }); }}>
                          <TIcon size={14} /> {t.label}
                        </button>
                      );
                    })}
                    <hr className="tw-divider" style={{ margin: '4px 0' }} />
                    <button className="tw-popover-item" disabled={i === 0} onClick={() => { setViewMenuId(null); moveView(v.id, -1); }}><ArrowLeft size={14} /> Chuyển sang trái</button>
                    <button className="tw-popover-item" disabled={i >= views.filter((x) => !x.virtual).length - 1} onClick={() => { setViewMenuId(null); moveView(v.id, 1); }}><ArrowRight size={14} /> Chuyển sang phải</button>
                    <button className="tw-popover-item danger" disabled={views.filter((x) => !x.virtual).length <= 1} onClick={() => { setViewMenuId(null); deleteView(v); }}><Trash2 size={14} /> Xóa view</button>
                  </Popover>
                )}
              </div>
            );
          })}
          {scope !== INBOX && project && (
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" title="Thêm view" onClick={() => setAddViewOpen(!addViewOpen)}><Plus size={16} /></button>
              {addViewOpen && (
                <Popover onClose={() => setAddViewOpen(false)} style={{ top: '100%', left: 0 }}>
                  {VIEW_TYPES.map((t) => {
                    const TIcon = t.icon;
                    return <button key={t.value} className="tw-popover-item" onClick={() => addView(t.value)}><TIcon size={14} /> {t.label}</button>;
                  })}
                </Popover>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        {scope !== REVIEW && activeView?.type !== 'PLANS' && <div className="tw-toolbar">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 30, width: 220 }} placeholder="Tìm công việc..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <select className="form-input" value={viewConfig.priority || ''} onChange={(e) => updateViewConfig({ priority: e.target.value })}>
            <option value="">Mọi mức ưu tiên</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="form-input" value={viewConfig.tagId || ''} onChange={(e) => updateViewConfig({ tagId: e.target.value })}>
            <option value="">Mọi tag</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {(keyword || viewConfig.priority || viewConfig.tagId) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setKeyword(''); updateViewConfig({ priority: '', tagId: '' }); }}>
              <X size={12} /> Xóa lọc
            </button>
          )}
        </div>}

        <div className="tw-content">{renderView()}</div>
      </section>

      {openTaskId && (
        <TaskDetail
          key={openTaskId}
          taskId={openTaskId}
          projects={projects.filter((p) => !p.isArchived)}
          tags={tags}
          onClose={closeTask}
          onOpenTask={openTask}
          onChanged={handleChanged}
          onTagsChanged={loadTags}
          onConfirm={setConfirm}
        />
      )}

      {/* Project create / edit */}
      {projectForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{projectForm.id ? 'Chỉnh sửa project' : 'Tạo project mới'}</h3>
              <button className="hamburger-btn" onClick={() => setProjectForm(null)}><X size={18} /></button>
            </div>
            <form onSubmit={saveProject}>
              <div className="modal-body">
                <div className="flex gap-2">
                  <div className="form-group" style={{ width: 80 }}>
                    <label className="form-label">Icon</label>
                    <input className="form-input" style={{ textAlign: 'center', fontSize: '1.2rem', padding: '6px' }} maxLength={4} value={projectForm.icon} onChange={(e) => setProjectForm({ ...projectForm, icon: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ flexGrow: 1 }}>
                    <label className="form-label">Tên project <span className="form-required">*</span></label>
                    <input autoFocus required className="form-input" placeholder="VD: Side project" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Mô tả</label>
                  <textarea className="form-input" style={{ resize: 'none', height: 70 }} value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Thư mục code (để Claude làm task — tùy chọn)</label>
                  <input
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                    placeholder="/Users/ban/code/du-an"
                    value={projectForm.workspacePath}
                    onChange={(e) => setProjectForm({ ...projectForm, workspacePath: e.target.value })}
                    spellCheck={false}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lệnh test / lint và các cài đặt khác chỉnh trong “Thư mục & Claude” của project.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Màu</label>
                  <div className="flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    {COLOR_PRESETS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setProjectForm({ ...projectForm, color: c })}
                        style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: projectForm.color === c ? '3px solid var(--text-main)' : '3px solid transparent' }}
                      />
                    ))}
                  </div>
                </div>
                {!projectForm.id && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Project mới có sẵn 4 cột “Cần làm / Đang làm / Chờ review / Done” và một view Bảng.</p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setProjectForm(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{projectForm.id ? 'Lưu' : 'Tạo project'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tag manager */}
      {tagManagerOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Tag size={18} /> Quản lý tag</h3>
              <button className="hamburger-btn" onClick={() => setTagManagerOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body flex flex-col gap-2">
              {tags.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có tag nào.</p>}
              {tags.map((t) => (
                <div key={t.id} className="flex align-center gap-2">
                  <input
                    type="color"
                    value={t.color || '#9CA3AF'}
                    onChange={(e) => patchTag(t.id, { color: e.target.value })}
                    style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                  />
                  <input
                    className="form-input"
                    style={{ flexGrow: 1, padding: '6px 10px' }}
                    defaultValue={t.name}
                    key={`${t.id}-${t.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.name) patchTag(t.id, { name: v });
                      else e.target.value = t.name;
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 70, textAlign: 'right' }}>{t.taskCount ?? 0} task</span>
                  <button className="icon-btn danger" onClick={() => deleteTag(t)}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="flex align-center gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 4 }}>
                <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <input
                  className="form-input"
                  style={{ flexGrow: 1, padding: '6px 10px' }}
                  placeholder="Tên tag mới..."
                  value={newTag.name}
                  onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') createTag(); }}
                />
                <button className="btn btn-primary btn-sm" onClick={createTag}><Plus size={14} /> Thêm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {agentSettingsOpen && (
        <AgentSettingsModal
          project={agentSettingsOpen}
          onClose={() => setAgentSettingsOpen(null)}
          onSaved={() => { loadProjects(); if (agentSettingsOpen.id === scope) loadProject(); }}
          onOpenRunners={() => setRunnersOpen(true)}
        />
      )}

      {runnersOpen && <RunnersModal onClose={() => setRunnersOpen(false)} onConfirm={setConfirm} />}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
