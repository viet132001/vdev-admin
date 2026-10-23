// localStorage mock for the Task module (/api/tasks, /api/task-projects, /api/task-tags) — mirrors src/doc/tasks-api.md
import { DEFAULT_AGENT_SETTINGS, routeAgent, upgradeAgentDb, type AgentMockCtx } from './taskAgentMock';

const STORAGE_KEY = 'mock_task_module';
const GAP = 1024;
const PRIORITY_ORDER = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const NO_MATCH = Symbol('NO_MATCH');

const genId = () => Math.random().toString(36).substring(2, 10);
const nowIso = () => new Date().toISOString();

const fail = (message: string, errorCode = 'BAD_REQUEST'): never => {
  throw new Error(JSON.stringify({ success: false, message, errorCode, errors: [] }));
};

interface DB {
  projects: any[];
  columns: any[];
  views: any[];
  tasks: any[];
  subtasks: any[];
  comments: any[];
  tags: any[];
  [agentTable: string]: any[]; // Task Agent tables, see taskAgentMock.ts
}

const load = (): DB => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
const save = (db: DB) => localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

const defaultColumns = (projectId: string) => [
  { id: genId(), projectId, name: 'Cần làm', color: '#a1a1aa', category: 'PENDING', position: GAP },
  { id: genId(), projectId, name: 'Đang làm', color: '#3f3f46', category: 'IN_PROGRESS', position: GAP * 2 },
  { id: genId(), projectId, name: 'Chờ review', color: '#71717a', category: 'IN_REVIEW', position: GAP * 3 },
  { id: genId(), projectId, name: 'Done', color: '#15803d', category: 'COMPLETED', position: GAP * 4 }
];

// Same as the BE migration: projects without an IN_REVIEW column get "Chờ review" right before the first Done column
const addReviewColumns = (db: DB) => {
  let changed = false;
  db.projects.forEach((p) => {
    const cols = db.columns.filter((c) => c.projectId === p.id).sort((a, b) => a.position - b.position);
    if (cols.some((c) => c.category === 'IN_REVIEW')) return;
    const doneIndex = cols.findIndex((c) => c.category === 'COMPLETED');
    const done = cols[doneIndex];
    const prev = doneIndex > 0 ? cols[doneIndex - 1] : null;
    const position = !done ? (cols.length ? cols[cols.length - 1].position + GAP : GAP) : prev ? (prev.position + done.position) / 2 : done.position - GAP;
    db.columns.push({ id: genId(), projectId: p.id, name: 'Chờ review', color: '#71717a', category: 'IN_REVIEW', position });
    changed = true;
  });
  return changed;
};

const seed = () => {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const ts = nowIso();
  const projectId = 'tp-1';
  const columns = defaultColumns(projectId);
  const tagBug = { id: 'tag-1', name: 'bug', color: '#b91c1c', createdAt: ts };
  const tagFe = { id: 'tag-2', name: 'frontend', color: '#71717a', createdAt: ts };
  const baseTask = {
    description: null, icon: null, parentId: null, priority: 'NONE', startDate: null, deadline: null,
    completedAt: null, content: null, tagIds: [], createdAt: ts, updatedAt: ts, deletedAt: null
  };
  save({
    projects: [{ id: projectId, name: 'VDEV Workspace', description: 'Dự án mẫu', icon: null, color: '#3f3f46', position: GAP, isArchived: false, createdAt: ts, updatedAt: ts, deletedAt: null }],
    columns,
    views: [{ id: genId(), projectId, name: 'Bảng', type: 'BOARD', config: null, position: GAP }],
    tasks: [
      { ...baseTask, id: 'task-1', title: 'Thiết kế màn hình login', projectId, columnId: columns[1].id, status: 'IN_PROGRESS', priority: 'HIGH', startDate: new Date(Date.now() - 2 * 864e5).toISOString(), deadline: new Date(Date.now() + 3 * 864e5).toISOString(), position: GAP, tagIds: [tagFe.id], content: { blocks: [{ id: 'b1', type: 'paragraph', text: 'Màn hình đăng nhập theo design guideline.' }, { id: 'b2', type: 'todo', text: 'Form validation', checked: false }] } },
      { ...baseTask, id: 'task-2', title: 'Sửa lỗi refresh token', projectId, columnId: columns[0].id, status: 'PENDING', priority: 'URGENT', deadline: new Date(Date.now() + 864e5).toISOString(), position: GAP, tagIds: [tagBug.id] },
      { ...baseTask, id: 'task-3', title: 'Viết test e2e cho Task Module', projectId, columnId: columns[0].id, status: 'PENDING', priority: 'MEDIUM', position: GAP * 2 },
      { ...baseTask, id: 'task-4', title: 'Thiết lập CI', projectId, columnId: columns[3].id, status: 'COMPLETED', completedAt: ts, position: GAP },
      { ...baseTask, id: 'task-5', title: 'Responsive mobile', projectId, columnId: columns[1].id, status: 'IN_PROGRESS', parentId: 'task-1', position: GAP },
      { ...baseTask, id: 'task-6', title: 'Mua sách tham khảo', projectId: null, columnId: null, status: 'PENDING', position: GAP }
    ],
    subtasks: [
      { id: 'st-1', taskId: 'task-1', title: 'Wireframe', isCompleted: true, deadline: null, position: GAP },
      { id: 'st-2', taskId: 'task-1', title: 'Hi-fi design', isCompleted: false, deadline: null, position: GAP * 2 }
    ],
    comments: [],
    tags: [tagBug, tagFe]
  });
};

// ---------- helpers ----------

const byPosition = (a: any, b: any) => a.position - b.position;
const toIso = (v: any) => (v === null || v === undefined || v === '' ? null : new Date(v).toISOString());

const findProject = (db: DB, id: string) => {
  const p = db.projects.find((x) => x.id === id && !x.deletedAt);
  if (!p) fail('Project not found', 'NOT_FOUND');
  return p;
};

const findTask = (db: DB, id: string) => {
  const t = db.tasks.find((x) => x.id === id && !x.deletedAt);
  if (!t) fail('Task not found', 'NOT_FOUND');
  return t;
};

const projectColumns = (db: DB, projectId: string) => db.columns.filter((c) => c.projectId === projectId).sort(byPosition);
const projectViews = (db: DB, projectId: string) => db.views.filter((v) => v.projectId === projectId).sort(byPosition);

const projectDetail = (db: DB, p: any) => ({ ...p, columns: projectColumns(db, p.id), views: projectViews(db, p.id) });

const reorderByIds = (items: any[], ids: string[]) => {
  ids.forEach((id, i) => {
    const item = items.find((x) => x.id === id);
    if (item) item.position = (i + 1) * GAP;
  });
};

const sameList = (a: any, b: any) =>
  (a.projectId || null) === (b.projectId || null) && (a.columnId || null) === (b.columnId || null) && (a.parentId || null) === (b.parentId || null);

const listOf = (db: DB, key: { projectId: any; columnId: any; parentId: any }, excludeId?: string) =>
  db.tasks.filter((t) => !t.deletedAt && t.id !== excludeId && sameList(t, key)).sort(byPosition);

const appendPosition = (db: DB, key: any, excludeId?: string) => {
  const list = listOf(db, key, excludeId);
  return list.length ? list[list.length - 1].position + GAP : GAP;
};

const columnForStatus = (db: DB, projectId: string, status?: string) => {
  const cols = projectColumns(db, projectId);
  if (!status) return cols[0] || null;
  return cols.find((c) => c.category === status) || null;
};

const setStatus = (task: any, status: string) => {
  if (status === 'COMPLETED' && task.status !== 'COMPLETED') task.completedAt = nowIso();
  if (status !== 'COMPLETED') task.completedAt = null;
  task.status = status;
};

const descendants = (db: DB, id: string): any[] => {
  const children = db.tasks.filter((t) => t.parentId === id && !t.deletedAt);
  return children.flatMap((c) => [c, ...descendants(db, c.id)]);
};

const taskCard = (db: DB, t: any) => {
  const subtasks = db.subtasks.filter((s) => s.taskId === t.id).sort(byPosition);
  const { content: _content, tagIds, deletedAt: _deletedAt, ...rest } = t;
  const latest = (db.changeSets || []).filter((cs: any) => cs.taskId === t.id).sort((a: any, b: any) => b.revision - a.revision)[0];
  return {
    assignee: 'USER',
    planId: null,
    ...rest,
    latestChangeSet: latest ? { id: latest.id, revision: latest.revision, stats: latest.stats, createdAt: latest.createdAt } : null,
    subtasks,
    tags: db.tags.filter((tag) => (tagIds || []).includes(tag.id)),
    subtaskProgress: { total: subtasks.length, completed: subtasks.filter((s) => s.isCompleted).length },
    childCount: db.tasks.filter((c) => c.parentId === t.id && !c.deletedAt).length,
    commentCount: db.comments.filter((c) => c.taskId === t.id).length
  };
};

const taskDetail = (db: DB, t: any) => {
  const project = t.projectId ? db.projects.find((p) => p.id === t.projectId) : null;
  return {
    ...taskCard(db, t),
    content: t.content ?? null,
    project: project ? { id: project.id, name: project.name, icon: project.icon, color: project.color } : null,
    column: t.columnId ? db.columns.find((c) => c.id === t.columnId) || null : null,
    children: db.tasks.filter((c) => c.parentId === t.id && !c.deletedAt).sort(byPosition).map((c) => taskCard(db, c))
  };
};

const placeTaskInList = (db: DB, task: any, prevId?: string, nextId?: string) => {
  const list = listOf(db, task, task.id);
  const prev = prevId ? list.find((t) => t.id === prevId) : null;
  const next = nextId ? list.find((t) => t.id === nextId) : null;
  if ((prevId && !prev) || (nextId && !next)) fail('prevId / nextId không thuộc danh sách đích');
  let lo = prev ? prev.position : null;
  let hi = next ? next.position : null;
  if (lo === null && hi === null) {
    task.position = appendPosition(db, task, task.id);
    return;
  }
  if (lo === null) lo = (hi as number) - GAP;
  if (hi === null) hi = lo + GAP * 2;
  if (hi - lo < 2) {
    // Renumber the list, then retry once with fresh positions
    list.forEach((t, i) => { t.position = (i + 1) * GAP; });
    return placeTaskInList(db, task, prevId, nextId);
  }
  task.position = (lo + hi) / 2;
};

// ---------- route handlers ----------

const handleProjects = (db: DB, method: string, parts: string[], query: URLSearchParams, body: any): any => {
  // parts: after /api/task-projects
  if (parts.length === 0) {
    if (method === 'GET') {
      const includeArchived = query.get('includeArchived') === 'true';
      return db.projects
        .filter((p) => !p.deletedAt && (includeArchived || !p.isArchived))
        .sort(byPosition)
        .map((p) => ({ ...p, taskCount: db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt).length }));
    }
    if (method === 'POST') {
      if (!body?.name?.trim()) fail('name is required');
      const ts = nowIso();
      const active = db.projects.filter((p) => !p.deletedAt);
      const p = {
        id: genId(), name: body.name, description: body.description ?? null, icon: body.icon ?? null, color: body.color ?? null,
        position: active.length ? Math.max(...active.map((x) => x.position)) + GAP : GAP,
        isArchived: false, createdAt: ts, updatedAt: ts, deletedAt: null,
        workspacePath: body.workspacePath || null, workspaceStatus: 'UNKNOWN', workspaceMessage: null, workspaceCheckedAt: null,
        agentSettings: { ...DEFAULT_AGENT_SETTINGS, ...(body.agentSettings || {}) }
      };
      db.projects.push(p);
      db.columns.push(...defaultColumns(p.id));
      db.views.push({ id: genId(), projectId: p.id, name: 'Bảng', type: 'BOARD', config: null, position: GAP });
      return projectDetail(db, p);
    }
  }

  if (parts[0] === 'reorder' && parts.length === 1 && method === 'PATCH') {
    reorderByIds(db.projects, body?.ids || []);
    return db.projects.filter((p) => !p.deletedAt).sort(byPosition);
  }

  const project = findProject(db, parts[0]);
  const sub = parts[1];

  if (!sub) {
    if (method === 'GET') return projectDetail(db, project);
    if (method === 'PATCH') {
      ['name', 'description', 'icon', 'color', 'isArchived'].forEach((k) => { if (k in (body || {})) project[k] = body[k]; });
      if ('workspacePath' in (body || {})) {
        const next = body.workspacePath || null;
        if (next && !/^(\/|[A-Za-z]:[\\/])/.test(next)) fail('workspacePath must be an absolute path');
        if (next !== (project.workspacePath ?? null)) Object.assign(project, { workspacePath: next, workspaceStatus: 'UNKNOWN', workspaceMessage: null, workspaceCheckedAt: null });
      }
      if ('docsFolder' in (body || {}) && body.docsFolder !== project.docsFolder) {
        if (project.docsFolder) fail('docsFolder đã được đặt, không đổi được', 'CONFLICT');
        const name = String(body.docsFolder || '').trim();
        if (!name || /[/\\]/.test(name) || name === '..') fail('docsFolder không hợp lệ');
        if (db.projects.some((p) => p.id !== project.id && (p.docsFolder || '').toLowerCase() === name.toLowerCase())) fail('docsFolder trùng với project khác', 'CONFLICT');
        project.docsFolder = name;
      }
      if (body?.agentSettings) project.agentSettings = { ...DEFAULT_AGENT_SETTINGS, ...(project.agentSettings || {}), ...body.agentSettings };
      project.updatedAt = nowIso();
      return projectDetail(db, project);
    }
    if (method === 'DELETE') {
      const ts = nowIso();
      project.deletedAt = ts;
      db.tasks.forEach((t) => { if (t.projectId === project.id && !t.deletedAt) t.deletedAt = ts; });
      return { success: true };
    }
  }

  if (sub === 'board' && method === 'GET') {
    const roots = db.tasks.filter((t) => t.projectId === project.id && !t.parentId && !t.deletedAt).sort(byPosition);
    const columns = projectColumns(db, project.id);
    return {
      project: projectDetail(db, project),
      columns: columns.map((c) => ({ ...c, tasks: roots.filter((t) => t.columnId === c.id).map((t) => taskCard(db, t)) })),
      unassigned: roots.filter((t) => !t.columnId || !columns.some((c) => c.id === t.columnId)).map((t) => taskCard(db, t))
    };
  }

  if (sub === 'columns') {
    const cols = projectColumns(db, project.id);
    if (parts.length === 2 && method === 'POST') {
      const col = {
        id: genId(), projectId: project.id, name: body?.name || 'Cột mới', color: body?.color ?? null,
        category: body?.category || 'PENDING', position: cols.length ? cols[cols.length - 1].position + GAP : GAP
      };
      db.columns.push(col);
      return col;
    }
    if (parts[2] === 'reorder' && method === 'PATCH') {
      reorderByIds(db.columns, body?.ids || []);
      return projectColumns(db, project.id);
    }
    const col = cols.find((c) => c.id === parts[2]);
    if (!col) fail('Column not found', 'NOT_FOUND');
    if (method === 'PATCH') {
      ['name', 'color'].forEach((k) => { if (k in (body || {})) col[k] = body[k]; });
      if (body?.category && body.category !== col.category) {
        col.category = body.category;
        db.tasks.forEach((t) => { if (t.columnId === col.id && !t.deletedAt) setStatus(t, col.category); });
      }
      return col;
    }
    if (method === 'DELETE') {
      if (cols.length <= 1) fail('Không thể xóa cột cuối cùng');
      const remaining = cols.filter((c) => c.id !== col.id);
      const targetId = query.get('moveToColumnId') || remaining[0].id;
      const target = remaining.find((c) => c.id === targetId);
      if (!target) fail('moveToColumnId không hợp lệ');
      db.tasks
        .filter((t) => t.columnId === col.id && !t.deletedAt)
        .sort(byPosition)
        .forEach((t) => {
          t.columnId = target.id;
          setStatus(t, target.category);
          t.position = appendPosition(db, t, t.id);
        });
      db.columns = db.columns.filter((c) => c.id !== col.id);
      return { movedToColumnId: target.id };
    }
  }

  if (sub === 'views') {
    const views = projectViews(db, project.id);
    if (parts.length === 2 && method === 'POST') {
      const view = {
        id: genId(), projectId: project.id, name: body?.name || 'View', type: body?.type || 'BOARD', config: body?.config ?? null,
        position: views.length ? views[views.length - 1].position + GAP : GAP
      };
      db.views.push(view);
      return view;
    }
    if (parts[2] === 'reorder' && method === 'PATCH') {
      reorderByIds(db.views, body?.ids || []);
      return projectViews(db, project.id);
    }
    const view = views.find((v) => v.id === parts[2]);
    if (!view) fail('View not found', 'NOT_FOUND');
    if (method === 'PATCH') {
      ['name', 'type', 'config'].forEach((k) => { if (k in (body || {})) view[k] = body[k]; });
      return view;
    }
    if (method === 'DELETE') {
      db.views = db.views.filter((v) => v.id !== view.id);
      return { success: true };
    }
  }

  return NO_MATCH;
};

const listTasks = (db: DB, query: URLSearchParams) => {
  const page = Math.max(1, parseInt(query.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.get('limit') || '20', 10)));
  const keyword = (query.get('keyword') || '').toLowerCase();
  const sort = query.get('sort') || 'createdAt';
  const order = query.get('order') === 'asc' ? 'asc' : 'desc';

  let tasks = db.tasks.filter((t) => !t.deletedAt);
  if (keyword) tasks = tasks.filter((t) => `${t.title} ${t.description || ''}`.toLowerCase().includes(keyword));
  if (query.get('status')) tasks = tasks.filter((t) => t.status === query.get('status'));
  if (query.get('priority')) tasks = tasks.filter((t) => t.priority === query.get('priority'));
  const projectId = query.get('projectId');
  if (projectId) tasks = tasks.filter((t) => (projectId === 'none' ? !t.projectId : t.projectId === projectId));
  if (query.get('columnId')) tasks = tasks.filter((t) => t.columnId === query.get('columnId'));
  const parentId = query.get('parentId');
  if (parentId) tasks = tasks.filter((t) => (parentId === 'root' ? !t.parentId : t.parentId === parentId));
  if (query.get('tagId')) tasks = tasks.filter((t) => (t.tagIds || []).includes(query.get('tagId')));
  const dueFrom = query.get('dueFrom');
  const dueTo = query.get('dueTo');
  if (dueFrom) tasks = tasks.filter((t) => t.deadline && new Date(t.deadline) >= new Date(dueFrom));
  if (dueTo) tasks = tasks.filter((t) => t.deadline && new Date(t.deadline) <= new Date(`${dueTo.substring(0, 10)}T23:59:59.999Z`));

  const dir = order === 'asc' ? 1 : -1;
  tasks.sort((a, b) => {
    if (sort === 'deadline' || sort === 'startDate') {
      if (!a[sort] && !b[sort]) return 0;
      if (!a[sort]) return 1;
      if (!b[sort]) return -1;
      return (new Date(a[sort]).getTime() - new Date(b[sort]).getTime()) * dir;
    }
    if (sort === 'priority') return (PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)) * dir;
    if (sort === 'title') return a.title.localeCompare(b.title) * dir;
    if (sort === 'position') return (a.position - b.position) * dir;
    return (new Date(a[sort]).getTime() - new Date(b[sort]).getTime()) * dir;
  });

  const total = tasks.length;
  return {
    data: tasks.slice((page - 1) * limit, page * limit).map((t) => taskCard(db, t)),
    total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit))
  };
};

const calendarTasks = (db: DB, query: URLSearchParams) => {
  const from = query.get('from');
  const to = query.get('to');
  if (!from || !to) fail('from / to is required');
  const start = new Date(`${(from as string).substring(0, 10)}T00:00:00.000Z`).getTime();
  const end = new Date(`${(to as string).substring(0, 10)}T23:59:59.999Z`).getTime();
  if ((end - start) / 864e5 > 100) fail('Khoảng tối đa 100 ngày');
  const projectId = query.get('projectId');
  return db.tasks
    .filter((t) => !t.deletedAt && (t.startDate || t.deadline))
    .filter((t) => !projectId || (projectId === 'none' ? !t.projectId : t.projectId === projectId))
    .filter((t) => {
      const s = new Date(t.startDate || t.deadline).getTime();
      const e = new Date(t.deadline || t.startDate).getTime();
      return s <= end && e >= start;
    })
    .map((t) => taskCard(db, t));
};

const createTask = (db: DB, body: any) => {
  if (!body?.title?.trim()) fail('title is required');
  let projectId = body.projectId || null;
  const parentId = body.parentId || null;
  if (parentId) {
    const parent = findTask(db, parentId);
    if (projectId && projectId !== (parent.projectId || null)) fail('Task con phải cùng project với task cha');
    projectId = parent.projectId || null;
  }
  if (projectId) findProject(db, projectId);

  let status = body.status || 'PENDING';
  let columnId: string | null = null;
  if (projectId) {
    if (body.columnId) {
      const col = projectColumns(db, projectId).find((c) => c.id === body.columnId);
      if (!col) fail('columnId không thuộc project');
      columnId = col.id;
      status = col.category;
    } else {
      const col = columnForStatus(db, projectId, body.status);
      columnId = col ? col.id : null;
      if (col) status = col.category;
    }
  }

  const ts = nowIso();
  const task: any = {
    id: genId(), title: body.title, description: body.description ?? null, icon: body.icon ?? null,
    projectId, columnId, parentId, status, priority: body.priority || 'NONE',
    startDate: toIso(body.startDate), deadline: toIso(body.deadline),
    completedAt: status === 'COMPLETED' ? ts : null, content: body.content ?? null,
    tagIds: body.tagIds || [], createdAt: ts, updatedAt: ts, deletedAt: null, position: 0
  };
  task.position = appendPosition(db, task);
  db.tasks.push(task);
  (body.subtasks || []).forEach((s: any, i: number) => {
    db.subtasks.push({ id: genId(), taskId: task.id, title: s.title, isCompleted: false, deadline: toIso(s.deadline), position: (i + 1) * GAP });
  });
  return taskDetail(db, task);
};

const updateTask = (db: DB, task: any, body: any) => {
  ['title', 'description', 'content', 'icon', 'priority'].forEach((k) => { if (k in body) task[k] = body[k]; });
  if ('startDate' in body) task.startDate = toIso(body.startDate);
  if ('deadline' in body) task.deadline = toIso(body.deadline);
  if ('tagIds' in body) task.tagIds = body.tagIds || [];
  if (body.status && body.status !== task.status) {
    setStatus(task, body.status);
    if (task.projectId) {
      const col = columnForStatus(db, task.projectId, body.status);
      task.columnId = col ? col.id : null;
      task.position = appendPosition(db, task, task.id);
    }
  }
  task.updatedAt = nowIso();
  return taskDetail(db, task);
};

const moveTask = (db: DB, task: any, body: any) => {
  const projectChanged = 'projectId' in body && (body.projectId || null) !== (task.projectId || null);

  if ('parentId' in body && body.parentId) {
    if (body.parentId === task.id || descendants(db, task.id).some((d) => d.id === body.parentId)) {
      fail('Không thể đặt task làm con của chính nó hoặc hậu duệ của nó');
    }
    const parent = findTask(db, body.parentId);
    task.parentId = parent.id;
    task.projectId = parent.projectId || null;
  } else if ('parentId' in body) {
    task.parentId = null;
  }

  if (projectChanged && !(body.parentId)) {
    task.projectId = body.projectId || null;
    if (!('parentId' in body)) task.parentId = null;
  }
  if (task.projectId) findProject(db, task.projectId);

  const syncColumn = (t: any) => {
    if (!t.projectId) { t.columnId = null; return; }
    const cols = projectColumns(db, t.projectId);
    if (cols.some((c) => c.id === t.columnId)) return;
    const col = columnForStatus(db, t.projectId, t.status);
    t.columnId = col ? col.id : null;
  };

  if (body.columnId) {
    if (!task.projectId) fail('Task trong Inbox không có cột');
    const col = projectColumns(db, task.projectId).find((c) => c.id === body.columnId);
    if (!col) fail('columnId không thuộc project');
    task.columnId = col.id;
    setStatus(task, col.category);
  } else {
    syncColumn(task);
  }

  if (projectChanged) {
    descendants(db, task.id).forEach((d) => {
      d.projectId = task.projectId;
      syncColumn(d);
      d.position = appendPosition(db, d, d.id);
    });
  }

  placeTaskInList(db, task, body.prevId, body.nextId);
  task.updatedAt = nowIso();
  return taskDetail(db, task);
};

const handleTasks = (db: DB, method: string, parts: string[], query: URLSearchParams, body: any): any => {
  if (parts.length === 0) {
    if (method === 'GET') return listTasks(db, query);
    if (method === 'POST') return createTask(db, body);
  }
  if (parts[0] === 'calendar' && method === 'GET') return calendarTasks(db, query);

  const task = findTask(db, parts[0]);
  const sub = parts[1];

  if (!sub) {
    if (method === 'GET') return taskDetail(db, task);
    if (method === 'PATCH') return updateTask(db, task, body || {});
    if (method === 'DELETE') {
      const ts = nowIso();
      [task, ...descendants(db, task.id)].forEach((t) => { t.deletedAt = ts; });
      return { success: true };
    }
  }

  if (sub === 'move' && method === 'POST') return moveTask(db, task, body || {});

  if (sub === 'subtasks') {
    const subtasks = db.subtasks.filter((s) => s.taskId === task.id).sort(byPosition);
    if (parts.length === 2 && method === 'POST') {
      const st = {
        id: genId(), taskId: task.id, title: body?.title, isCompleted: false, deadline: toIso(body?.deadline),
        position: subtasks.length ? subtasks[subtasks.length - 1].position + GAP : GAP
      };
      db.subtasks.push(st);
      return st;
    }
    if (parts[2] === 'reorder' && method === 'PATCH') {
      reorderByIds(subtasks, body?.ids || []);
      return subtasks.sort(byPosition);
    }
    const st = subtasks.find((s) => s.id === parts[2]);
    if (!st) fail('Subtask not found', 'NOT_FOUND');
    if (method === 'PATCH') {
      ['title', 'isCompleted'].forEach((k) => { if (k in (body || {})) st[k] = body[k]; });
      if ('deadline' in (body || {})) st.deadline = toIso(body.deadline);
      return st;
    }
    if (method === 'DELETE') {
      db.subtasks = db.subtasks.filter((s) => s.id !== st.id);
      return { success: true };
    }
  }

  if (sub === 'comments') {
    if (parts.length === 2 && method === 'GET') {
      return db.comments.filter((c) => c.taskId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    if (parts.length === 2 && method === 'POST') {
      if (!body?.content?.trim()) fail('content is required');
      const ts = nowIso();
      const c = { id: genId(), taskId: task.id, content: body.content, createdAt: ts, updatedAt: ts };
      db.comments.push(c);
      return c;
    }
    const c = db.comments.find((x) => x.id === parts[2] && x.taskId === task.id);
    if (!c) fail('Comment not found', 'NOT_FOUND');
    if (method === 'PATCH') {
      c.content = body?.content ?? c.content;
      c.updatedAt = nowIso();
      return c;
    }
    if (method === 'DELETE') {
      db.comments = db.comments.filter((x) => x.id !== c.id);
      return { success: true };
    }
  }

  return NO_MATCH;
};

const handleTags = (db: DB, method: string, parts: string[], body: any): any => {
  const nameTaken = (name: string, exceptId?: string) =>
    db.tags.some((t) => t.id !== exceptId && t.name.toLowerCase() === String(name).toLowerCase());

  if (parts.length === 0) {
    if (method === 'GET') {
      return db.tags.map((tag) => ({
        ...tag,
        taskCount: db.tasks.filter((t) => !t.deletedAt && (t.tagIds || []).includes(tag.id)).length
      }));
    }
    if (method === 'POST') {
      if (!body?.name?.trim()) fail('name is required');
      if (nameTaken(body.name)) fail('Tag đã tồn tại', 'CONFLICT');
      const tag = { id: genId(), name: body.name, color: body.color ?? null, createdAt: nowIso() };
      db.tags.push(tag);
      return tag;
    }
  }
  const tag = db.tags.find((t) => t.id === parts[0]);
  if (!tag) fail('Tag not found', 'NOT_FOUND');
  if (method === 'PATCH') {
    if (body?.name && nameTaken(body.name, tag.id)) fail('Tag đã tồn tại', 'CONFLICT');
    ['name', 'color'].forEach((k) => { if (k in (body || {})) tag[k] = body[k]; });
    return tag;
  }
  if (method === 'DELETE') {
    db.tags = db.tags.filter((t) => t.id !== tag.id);
    db.tasks.forEach((t) => { t.tagIds = (t.tagIds || []).filter((id: string) => id !== tag.id); });
    return { success: true };
  }
  return NO_MATCH;
};

const route = (method: string, url: string, body?: any): any => {
  const urlObj = new URL(url, 'http://localhost');
  const segments = urlObj.pathname.split('/').filter(Boolean); // ['api', 'tasks', ...]
  if (segments[0] !== 'api') return NO_MATCH;
  const resource = segments[1];
  if (!['tasks', 'task-projects', 'task-tags', 'task-plans', 'agent', 'changesets', 'review-notes'].includes(resource)) return NO_MATCH;

  const db = load();
  let upgraded = addReviewColumns(db);
  upgraded = upgradeAgentDb(db, agentCtx) || upgraded;
  if (upgraded) save(db);

  const agent = routeAgent(db, agentCtx, method, segments, urlObj.searchParams, body);
  if (agent.result !== NO_MATCH) {
    if (method !== 'GET' || agent.mutated) save(db);
    return agent.result;
  }

  const parts = segments.slice(2);
  let result: any = NO_MATCH;
  if (resource === 'tasks') result = handleTasks(db, method, parts, urlObj.searchParams, body);
  else if (resource === 'task-projects') result = handleProjects(db, method, parts, urlObj.searchParams, body);
  else if (resource === 'task-tags') result = handleTags(db, method, parts, body);

  if (result !== NO_MATCH && method !== 'GET') save(db);
  return result;
};

const agentCtx: AgentMockCtx = { NO_MATCH, fail, genId, nowIso, setStatus, columnForStatus, appendPosition, findTask, findProject };

export const mockTasks = (method: string, url: string, body?: any): { handled: boolean; data?: any } => {
  seed();
  const data = route(method, url, body);
  return data === NO_MATCH ? { handled: false } : { handled: true, data };
};
