// localStorage mock for the Task Agent API — mirrors src/doc/task-agent-mcp.md (sections 5 and 12).
// No real runner exists offline, so the mock simulates one: a created runner counts as online, workspace checks
// succeed for absolute paths, and a plan being drafted turns into a sample plan after a few seconds.

export interface AgentMockCtx {
  NO_MATCH: symbol;
  fail: (message: string, errorCode?: string) => never;
  genId: () => string;
  nowIso: () => string;
  setStatus: (task: any, status: string) => void;
  columnForStatus: (db: any, projectId: string, status?: string) => any;
  appendPosition: (db: any, key: any, excludeId?: string) => number;
  findTask: (db: any, id: string) => any;
  findProject: (db: any, id: string) => any;
}

const GAP = 1024;
const SIMULATED_PLANNING_MS = 4000;

export const DEFAULT_AGENT_SETTINGS = {
  enabled: true,
  testCommand: null,
  lintCommand: null,
  buildCommand: null,
  excludePatterns: ['.env*', '*.pem', '*.key', 'node_modules/', 'dist/'],
  contextPaths: [],
  maxTurnsPerTask: 80,
  maxBudgetUsdPerRun: 5
};

const SAMPLE_PATCH_FORM = `@@ -1,12 +1,24 @@
 import React, { useState } from 'react';
+import { isValidEmail } from '../utils/validate';

 export const LoginForm: React.FC = () => {
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
+  const [error, setError] = useState('');

   const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault();
+    if (!isValidEmail(email)) {
+      setError('Email không hợp lệ');
+      return;
+    }
+    if (password.length < 8) {
+      setError('Mật khẩu tối thiểu 8 ký tự');
+      return;
+    }
     onLogin(email, password);
   };

@@ -20,6 +32,7 @@ export const LoginForm: React.FC = () => {
       <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
-      <button type="submit">Login</button>
+      {error && <p className="form-error-text">{error}</p>}
+      <button type="submit">Đăng nhập</button>
     </form>
   );
 };`;

const SAMPLE_PATCH_UTIL = `@@ -0,0 +1,4 @@
+const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
+
+export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());
+`;

const runSummary = (r: any) => {
  const { tokenHash: _tokenHash, ...rest } = r;
  return rest;
};

/** Adds agent tables + demo data to an existing mock DB. Returns true when the DB changed. */
export const upgradeAgentDb = (db: any, ctx: AgentMockCtx): boolean => {
  if (db.plans) return false;
  const ts = ctx.nowIso();
  db.plans = [];
  db.planItems = [];
  db.runs = [];
  db.runLogs = [];
  db.runners = [];
  db.changeSets = [];
  db.changeFiles = [];
  db.reviewNotes = [];
  db.reviewReplies = [];

  const project = db.projects.find((p: any) => p.id === 'tp-1');
  if (!project) return true;
  Object.assign(project, {
    workspacePath: '/Users/you/code/vdev-admin', workspaceStatus: 'OK', workspaceMessage: 'OK · branch main', workspaceCheckedAt: ts,
    agentSettings: { ...DEFAULT_AGENT_SETTINGS, testCommand: 'npm test', lintCommand: 'npm run lint' }
  });
  db.runners.push({ id: 'runner-1', name: 'MacBook', version: '0.1.0', lastSeenAt: ts, revokedAt: null, createdAt: ts });

  // A plan waiting for approval
  db.plans.push({
    id: 'plan-1', projectId: 'tp-1', title: 'Trang quên mật khẩu', goal: 'Thêm luồng quên mật khẩu: nhập email, nhận link, đặt lại mật khẩu.',
    content: '## Cách làm\n1. Thêm trang nhập email gọi `POST /api/auth/forgot-password`.\n2. Trang đặt lại mật khẩu đọc token từ URL.\n3. Bổ sung validate và thông báo lỗi.',
    status: 'PENDING_APPROVAL', feedback: null, parentTaskId: null, approvedAt: null, createdAt: ts, updatedAt: ts
  });
  [
    ['Trang nhập email quên mật khẩu', 'Form email + gọi API, hiện thông báo đã gửi.', ['Validate email trước khi gửi', 'Hiện thông báo sau khi gửi thành công']],
    ['Trang đặt lại mật khẩu', 'Đọc token trên URL, nhập mật khẩu mới 2 lần.', ['Mật khẩu tối thiểu 8 ký tự', 'Hai ô mật khẩu phải trùng nhau']],
    ['Liên kết từ trang đăng nhập', 'Thêm link "Quên mật khẩu?" dưới form đăng nhập.', ['Link dẫn tới /forgot-password']]
  ].forEach(([title, description, criteria], i) => db.planItems.push({
    id: `pi-${i + 1}`, planId: 'plan-1', title, description, acceptanceCriteria: criteria, priority: 'MEDIUM', position: (i + 1) * GAP, included: true, taskId: null
  }));
  db.runs.push({ id: 'run-1', projectId: 'tp-1', type: 'PLAN', planId: 'plan-1', taskId: null, status: 'SUCCEEDED', runnerId: 'runner-1', claimedAt: ts, heartbeatAt: ts, finishedAt: ts, error: null, costUsd: 0.21, numTurns: 9, claudeSessionId: null, cancelRequested: false, createdAt: ts });

  // An approved plan with one task waiting for review
  const todo = ctx.columnForStatus(db, 'tp-1', 'PENDING');
  const review = ctx.columnForStatus(db, 'tp-1', 'IN_REVIEW');
  db.plans.push({
    id: 'plan-2', projectId: 'tp-1', title: 'Validate form đăng nhập', goal: 'Form đăng nhập cần validate email và mật khẩu trước khi gửi.',
    content: '## Cách làm\nThêm hàm `isValidEmail` dùng chung và hiển thị lỗi ngay dưới form.', status: 'APPROVED', feedback: null,
    parentTaskId: 'agent-parent-1', approvedAt: ts, createdAt: ts, updatedAt: ts
  });
  const baseTask = { description: null, icon: null, priority: 'MEDIUM', startDate: null, deadline: null, completedAt: null, content: null, tagIds: [], createdAt: ts, updatedAt: ts, deletedAt: null, reworkNote: null };
  db.tasks.push(
    { ...baseTask, id: 'agent-parent-1', title: 'Plan: Validate form đăng nhập', description: 'Form đăng nhập cần validate email và mật khẩu trước khi gửi.', projectId: 'tp-1', columnId: todo?.id ?? null, parentId: null, planId: 'plan-2', assignee: 'USER', status: 'PENDING', position: GAP * 10 },
    { ...baseTask, id: 'agent-task-1', title: 'Validate email và mật khẩu', description: 'Chặn submit khi email sai định dạng hoặc mật khẩu ngắn.', projectId: 'tp-1', columnId: review?.id ?? null, parentId: 'agent-parent-1', planId: 'plan-2', assignee: 'AGENT', status: 'IN_REVIEW', position: GAP },
    { ...baseTask, id: 'agent-task-2', title: 'Thông báo lỗi từ server', description: 'Hiện lỗi 401 từ API dưới form.', projectId: 'tp-1', columnId: todo?.id ?? null, parentId: 'agent-parent-1', planId: 'plan-2', assignee: 'AGENT', status: 'PENDING', position: GAP * 2 }
  );
  db.subtasks.push(
    { id: 'ast-1', taskId: 'agent-task-1', title: 'Email sai định dạng thì báo lỗi', isCompleted: true, deadline: null, position: GAP },
    { id: 'ast-2', taskId: 'agent-task-1', title: 'Mật khẩu tối thiểu 8 ký tự', isCompleted: true, deadline: null, position: GAP * 2 }
  );
  db.runs.push({ id: 'run-2', projectId: 'tp-1', type: 'EXECUTE', planId: 'plan-2', taskId: null, status: 'SUCCEEDED', runnerId: 'runner-1', claimedAt: ts, heartbeatAt: ts, finishedAt: ts, error: null, costUsd: 0.64, numTurns: 31, claudeSessionId: null, cancelRequested: false, createdAt: ts });
  db.changeSets.push({
    id: 'cs-1', taskId: 'agent-task-1', runId: 'run-2', revision: 1, baseTree: '4b825dc', headTree: '9a1f3e2',
    stats: { files: 2, additions: 17, deletions: 1 },
    summary: 'Thêm `isValidEmail` dùng chung và validate trước khi gọi `onLogin`; lỗi hiện ngay dưới form.',
    selfReview: {
      criteria: [
        { text: 'Email sai định dạng thì báo lỗi', met: true, evidence: 'LoginForm.tsx:13' },
        { text: 'Mật khẩu tối thiểu 8 ký tự', met: true, evidence: 'LoginForm.tsx:17' }
      ],
      checks: [{ name: 'test', command: 'npm test', passed: true, output: 'Tests: 24 passed, 24 total' }, { name: 'lint', command: 'npm run lint', passed: true, output: '0 problems' }],
      notes: 'Chưa xử lý lỗi trả về từ server — thuộc task "Thông báo lỗi từ server".'
    },
    createdAt: ts
  });
  db.changeFiles.push(
    { id: 'cf-1', changeSetId: 'cs-1', path: 'src/components/LoginForm.tsx', oldPath: null, status: 'M', additions: 13, deletions: 1, isBinary: false, truncated: false, patch: SAMPLE_PATCH_FORM },
    { id: 'cf-2', changeSetId: 'cs-1', path: 'src/utils/validate.ts', oldPath: null, status: 'A', additions: 4, deletions: 0, isBinary: false, truncated: false, patch: SAMPLE_PATCH_UTIL }
  );
  db.comments.push(
    { id: 'ac-1', taskId: 'agent-task-1', content: 'Claude bắt đầu làm task.', authorType: 'AGENT', runId: 'run-2', createdAt: ts, updatedAt: ts },
    { id: 'ac-2', taskId: 'agent-task-1', content: 'Claude đã xong · chờ review (revision 1, 2 file, +17 −1).', authorType: 'AGENT', runId: 'run-2', createdAt: ts, updatedAt: ts }
  );
  return true;
};

// ---------- helpers ----------

const latestRunOf = (db: any, filter: (r: any) => boolean) =>
  db.runs.filter(filter).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))[0] || null;

const enqueue = (db: any, ctx: AgentMockCtx, data: any) => {
  const run = { id: ctx.genId(), status: 'QUEUED', runnerId: null, claimedAt: null, heartbeatAt: null, finishedAt: null, error: null, costUsd: null, numTurns: null, claudeSessionId: null, cancelRequested: false, createdAt: ctx.nowIso(), taskId: null, planId: null, ...data };
  db.runs.push(run);
  return run;
};

const anyRunnerOnline = (db: any) => db.runners.some((r: any) => !r.revokedAt);

const noteStatusOpen = (n: any) => n.status === 'OPEN' || n.status === 'FOLLOW_UP';

// Simulated runner: a plan in DRAFTING for a few seconds gets sample items
const simulatePlanning = (db: any, ctx: AgentMockCtx, plan: any) => {
  if (plan.status !== 'DRAFTING' || Date.now() - new Date(plan.updatedAt).getTime() < SIMULATED_PLANNING_MS) return false;
  db.planItems = db.planItems.filter((i: any) => i.planId !== plan.id);
  const goal = plan.goal.length > 60 ? `${plan.goal.slice(0, 60)}…` : plan.goal;
  [
    ['Phân tích code liên quan', `Đọc các file liên quan tới: ${goal}`, ['Liệt kê file cần sửa']],
    ['Thực hiện thay đổi chính', plan.feedback ? `Làm theo góp ý: ${plan.feedback}` : plan.goal, ['Chạy được trên giao diện', 'Không phá vỡ test hiện có']],
    ['Kiểm tra & dọn dẹp', 'Chạy test / lint, bổ sung xử lý lỗi.', ['Test và lint đều pass']]
  ].forEach(([title, description, criteria], i) => db.planItems.push({
    id: ctx.genId(), planId: plan.id, title: `${title} (mock)`, description, acceptanceCriteria: criteria, priority: 'MEDIUM', position: (i + 1) * GAP, included: true, taskId: null
  }));
  plan.content = `## Kế hoạch (mô phỏng — chế độ offline)\n${plan.goal}`;
  plan.status = 'PENDING_APPROVAL';
  plan.updatedAt = ctx.nowIso();
  const run = latestRunOf(db, (r: any) => r.planId === plan.id && r.type === 'PLAN');
  if (run && (run.status === 'QUEUED' || run.status === 'RUNNING')) Object.assign(run, { status: 'SUCCEEDED', finishedAt: ctx.nowIso(), costUsd: 0.18, numTurns: 7 });
  return true;
};

const planAttachments = (db: any, planId: string) =>
  db.planAttachments
    .filter((a: any) => a.planId === planId)
    .map((a: any) => ({ ...a, document: db.documents.find((d: any) => d.id === a.documentId) || null }));

const attach = (db: any, ctx: AgentMockCtx, plan: any, list: any, source: 'GOAL' | 'FEEDBACK') => {
  if (list === undefined) return;
  if (!Array.isArray(list) || list.length > 10) ctx.fail('attachments: tối đa 10 file');
  list.forEach((a: any) => {
    const doc = db.documents.find((d: any) => d.id === a?.documentId && d.projectId === plan.projectId && !d.deletedAt);
    if (!doc) ctx.fail('documentId không thuộc project');
    db.planAttachments.push({ id: ctx.genId(), planId: plan.id, documentId: doc.id, note: a.note || null, source });
  });
};

const validRelativePath = (p: any) => typeof p === 'string' && !!p.trim() && !p.startsWith('/') && !p.split('/').includes('..');

const planView = (db: any, plan: any) => {
  const parent = plan.parentTaskId ? db.tasks.find((t: any) => t.id === plan.parentTaskId) : null;
  return {
    ...plan,
    attachments: planAttachments(db, plan.id),
    items: db.planItems.filter((i: any) => i.planId === plan.id).sort((a: any, b: any) => a.position - b.position),
    parentTask: parent ? { id: parent.id, title: parent.title, status: parent.status } : null,
    latestRun: (() => { const r = latestRunOf(db, (x: any) => x.planId === plan.id); return r ? runSummary(r) : null; })()
  };
};

const noteView = (db: any, n: any) => ({
  ...n,
  replies: db.reviewReplies.filter((r: any) => r.noteId === n.id).sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt))
});

const agentTask = (db: any, ctx: AgentMockCtx, id: string) => {
  const task = ctx.findTask(db, id);
  if (task.assignee !== 'AGENT') ctx.fail('Task không do Claude thực hiện');
  return task;
};

const moveToStatus = (db: any, ctx: AgentMockCtx, task: any, status: string) => {
  ctx.setStatus(task, status);
  if (task.projectId) {
    const col = ctx.columnForStatus(db, task.projectId, status);
    task.columnId = col ? col.id : null;
    task.position = ctx.appendPosition(db, task, task.id);
  }
  task.updatedAt = ctx.nowIso();
};

const completePlanIfDone = (db: any, ctx: AgentMockCtx, planId: string) => {
  const plan = db.plans.find((p: any) => p.id === planId);
  if (!plan?.parentTaskId || plan.status !== 'APPROVED') return;
  const children = db.tasks.filter((t: any) => t.parentId === plan.parentTaskId && !t.deletedAt && t.status !== 'CANCELLED');
  if (!children.length || children.some((c: any) => c.status !== 'COMPLETED')) return;
  plan.status = 'DONE';
  const parent = db.tasks.find((t: any) => t.id === plan.parentTaskId);
  if (parent) moveToStatus(db, ctx, parent, 'COMPLETED');
};

// ---------- routes ----------

/** Returns ctx.NO_MATCH when the URL is not an agent endpoint. `mutated` tells the caller to persist on GET. */
export const routeAgent = (db: any, ctx: AgentMockCtx, method: string, seg: string[], query: URLSearchParams, body: any): { result: any; mutated?: boolean } => {
  const { NO_MATCH, fail, genId, nowIso } = ctx;
  const [, resource, a, b, c] = seg; // ['api', resource, ...]
  // Tables added after the first agent mock release (section 13)
  db.documents ||= [];
  db.planAttachments ||= [];
  db.agentUserSettings ||= { docsRoot: null, docsRootStatus: 'UNKNOWN', docsRootMessage: null, docsRootCheckedAt: null };

  // User-level agent settings (docs root)
  if (resource === 'agent' && a === 'settings' && !b) {
    if (method === 'GET') return { result: db.agentUserSettings };
    if (method === 'PATCH') {
      const next = body?.docsRoot ? String(body.docsRoot).trim() : null;
      if (next && !/^(\/|[A-Za-z]:[\\/])/.test(next)) fail('docsRoot must be an absolute path');
      // Simulated runner: an absolute path is accepted right away
      db.agentUserSettings = next
        ? { docsRoot: next, docsRootStatus: 'OK', docsRootMessage: 'OK · (mô phỏng offline)', docsRootCheckedAt: nowIso() }
        : { docsRoot: null, docsRootStatus: 'UNKNOWN', docsRootMessage: null, docsRootCheckedAt: null };
      return { result: db.agentUserSettings };
    }
  }

  // Project documents
  if (resource === 'task-projects' && a && b === 'documents') {
    const project = ctx.findProject(db, a);
    if (!c && method === 'GET') {
      const usedByPlans = new Set(db.planAttachments.map((x: any) => x.documentId));
      const includePlan = query.get('includePlan') === 'true';
      return {
        result: db.documents
          .filter((d: any) => d.projectId === project.id && !d.deletedAt && (includePlan || !d.relativePath.startsWith('plans/') || !usedByPlans.has(d.id)))
          .sort((x: any, y: any) => x.relativePath.localeCompare(y.relativePath))
      };
    }
    if (!c && method === 'POST') {
      if (!project.docsFolder) fail('Project chưa có docsFolder', 'CONFLICT');
      if (!validRelativePath(body?.relativePath)) fail('relativePath không hợp lệ');
      if ((body.size ?? 0) > 20 * 1024 * 1024) fail('File tối đa 20MB');
      const doc = {
        id: genId(), projectId: project.id, relativePath: body.relativePath, name: body.name || body.relativePath.split('/').pop(),
        mimeType: body.mimeType || 'application/octet-stream', size: body.size || 0, sha256: body.sha256 || '',
        alwaysInclude: !!body.alwaysInclude, note: body.note || null, missing: false, createdAt: nowIso(), deletedAt: null
      };
      db.documents.push(doc);
      return { result: doc };
    }
    const doc = db.documents.find((d: any) => d.id === c && d.projectId === project.id && !d.deletedAt);
    if (!doc) fail('Document not found', 'NOT_FOUND');
    if (method === 'PATCH') {
      ['alwaysInclude', 'note'].forEach((k) => { if (k in (body || {})) doc[k] = body[k]; });
      return { result: doc };
    }
    if (method === 'DELETE') {
      doc.deletedAt = nowIso();
      return { result: { success: true } };
    }
  }

  // Project workspace
  if (resource === 'task-projects' && a && b === 'workspace' && c === 'verify' && method === 'POST') {
    const project = ctx.findProject(db, a);
    if (!project.workspacePath) fail('Project has no workspacePath');
    if (!anyRunnerOnline(db)) return { result: { workspaceStatus: 'UNKNOWN', workspaceMessage: 'Runner offline', workspaceCheckedAt: project.workspaceCheckedAt ?? null } };
    Object.assign(project, { workspaceStatus: 'OK', workspaceMessage: 'OK · (mô phỏng offline)', workspaceCheckedAt: nowIso() });
    return { result: { workspaceStatus: project.workspaceStatus, workspaceMessage: project.workspaceMessage, workspaceCheckedAt: project.workspaceCheckedAt } };
  }

  // Plans
  if (resource === 'task-plans') {
    if (!a && method === 'GET') {
      let mutated = false;
      const list = db.plans
        .filter((p: any) => (!query.get('projectId') || p.projectId === query.get('projectId')) && (!query.get('status') || p.status === query.get('status')))
        .sort((x: any, y: any) => y.createdAt.localeCompare(x.createdAt));
      list.forEach((p: any) => { if (simulatePlanning(db, ctx, p)) mutated = true; });
      return {
        mutated,
        result: list.map((p: any) => {
          const { items, parentTask: _parentTask, ...rest } = planView(db, p);
          return { ...rest, itemCount: items.length };
        })
      };
    }
    if (!a && method === 'POST') {
      const project = ctx.findProject(db, body?.projectId);
      if (!body?.title?.trim() || !body?.goal?.trim()) fail('title và goal là bắt buộc');
      if ((project.agentSettings ?? DEFAULT_AGENT_SETTINGS).enabled === false) fail('Task Agent is disabled for this project', 'CONFLICT');
      if (!project.workspacePath || project.workspaceStatus !== 'OK') fail('Workspace is not verified — set workspacePath and run the check first', 'CONFLICT');
      if (!anyRunnerOnline(db)) fail('No runner is online', 'CONFLICT');
      const ts = nowIso();
      const plan = { id: genId(), projectId: project.id, title: body.title.trim(), goal: body.goal.trim(), content: null, status: 'DRAFTING', feedback: null, parentTaskId: null, approvedAt: null, createdAt: ts, updatedAt: ts };
      attach(db, ctx, plan, body.attachments, 'GOAL');
      db.plans.push(plan);
      enqueue(db, ctx, { projectId: project.id, type: 'PLAN', planId: plan.id });
      return { result: planView(db, plan) };
    }
    const plan = db.plans.find((p: any) => p.id === a);
    if (!plan) fail('Plan not found', 'NOT_FOUND');
    if (!b && method === 'GET') {
      const mutated = simulatePlanning(db, ctx, plan);
      return { mutated, result: planView(db, plan) };
    }
    const assertStatus = (...allowed: string[]) => { if (!allowed.includes(plan.status)) fail(`Plan is ${plan.status}`, 'CONFLICT'); };
    if (b === 'items' && c && method === 'PATCH') {
      assertStatus('PENDING_APPROVAL');
      const item = db.planItems.find((i: any) => i.id === c && i.planId === plan.id);
      if (!item) fail('Plan item not found', 'NOT_FOUND');
      ['title', 'description', 'acceptanceCriteria', 'priority', 'included'].forEach((k) => { if (k in (body || {})) item[k] = body[k]; });
      return { result: item };
    }
    if (b === 'approve' && method === 'POST') {
      assertStatus('PENDING_APPROVAL');
      const items = db.planItems.filter((i: any) => i.planId === plan.id && i.included).sort((x: any, y: any) => x.position - y.position);
      if (!items.length) fail('Select at least one plan item');
      const ts = nowIso();
      const todo = ctx.columnForStatus(db, plan.projectId, 'PENDING');
      const base = { description: null, icon: null, startDate: null, deadline: null, completedAt: null, content: null, tagIds: [], createdAt: ts, updatedAt: ts, deletedAt: null, reworkNote: null, projectId: plan.projectId, columnId: todo?.id ?? null, planId: plan.id, status: 'PENDING' };
      const parent = { ...base, id: genId(), title: `Plan: ${plan.title}`, description: plan.goal, parentId: null, assignee: 'USER', priority: 'NONE', position: 0 };
      parent.position = ctx.appendPosition(db, parent);
      db.tasks.push(parent);
      items.forEach((item: any, i: number) => {
        const child = { ...base, id: genId(), title: item.title, description: item.description, parentId: parent.id, assignee: 'AGENT', priority: item.priority, position: (i + 1) * GAP };
        db.tasks.push(child);
        item.acceptanceCriteria.forEach((criterion: string, ci: number) => db.subtasks.push({ id: genId(), taskId: child.id, title: criterion, isCompleted: false, deadline: null, position: (ci + 1) * GAP }));
        item.taskId = child.id;
      });
      Object.assign(plan, { status: 'APPROVED', approvedAt: ts, parentTaskId: parent.id, updatedAt: ts });
      enqueue(db, ctx, { projectId: plan.projectId, type: 'EXECUTE', planId: plan.id });
      return { result: planView(db, plan) };
    }
    if (b === 'reject' && method === 'POST') {
      assertStatus('PENDING_APPROVAL');
      if (!body?.feedback?.trim()) fail('feedback là bắt buộc');
      attach(db, ctx, plan, body.attachments, 'FEEDBACK');
      Object.assign(plan, { status: 'REJECTED', feedback: body.feedback.trim(), updatedAt: nowIso() });
      enqueue(db, ctx, { projectId: plan.projectId, type: 'PLAN', planId: plan.id });
      plan.status = 'DRAFTING'; // the simulated runner picks it up immediately
      return { result: planView(db, plan) };
    }
    if (b === 'cancel' && method === 'POST') {
      assertStatus('DRAFTING', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED');
      plan.status = 'CANCELLED';
      db.runs.filter((r: any) => r.planId === plan.id && (r.status === 'QUEUED' || r.status === 'RUNNING')).forEach((r: any) => Object.assign(r, { status: 'CANCELLED', finishedAt: nowIso(), error: 'Cancelled by user' }));
      return { result: planView(db, plan) };
    }
    if (b === 'retry' && method === 'POST') {
      if (db.runs.some((r: any) => r.planId === plan.id && (r.status === 'QUEUED' || r.status === 'RUNNING'))) fail('Plan already has a queued or running run', 'CONFLICT');
      if (plan.status === 'DRAFTING' || plan.status === 'REJECTED') {
        enqueue(db, ctx, { projectId: plan.projectId, type: 'PLAN', planId: plan.id });
        Object.assign(plan, { status: 'DRAFTING', updatedAt: nowIso() });
      } else if (plan.status === 'APPROVED') {
        enqueue(db, ctx, { projectId: plan.projectId, type: 'EXECUTE', planId: plan.id });
      } else fail(`Cannot retry a ${plan.status} plan`, 'CONFLICT');
      return { result: planView(db, plan) };
    }
  }

  // Runs & runners
  if (resource === 'agent') {
    if (a === 'runs' && !b && method === 'GET') {
      return {
        result: db.runs
          .filter((r: any) => (!query.get('projectId') || r.projectId === query.get('projectId')) && (!query.get('status') || r.status === query.get('status')))
          .sort((x: any, y: any) => y.createdAt.localeCompare(x.createdAt))
          .slice(0, 100)
          .map((r: any) => ({
            ...runSummary(r),
            plan: r.planId ? { id: r.planId, title: db.plans.find((p: any) => p.id === r.planId)?.title } : null,
            task: r.taskId ? { id: r.taskId, title: db.tasks.find((t: any) => t.id === r.taskId)?.title } : null,
            runner: r.runnerId ? { id: r.runnerId, name: db.runners.find((x: any) => x.id === r.runnerId)?.name } : null
          }))
      };
    }
    if (a === 'runs' && b && c === 'logs' && method === 'GET') {
      const run = db.runs.find((r: any) => r.id === b);
      if (!run) fail('Run not found', 'NOT_FOUND');
      const after = Number(query.get('afterSeq') || 0);
      return { result: { run: runSummary(run), logs: db.runLogs.filter((l: any) => l.runId === b && l.seq > after) } };
    }
    if (a === 'runs' && b && c === 'cancel' && method === 'POST') {
      const run = db.runs.find((r: any) => r.id === b);
      if (!run) fail('Run not found', 'NOT_FOUND');
      if (run.status === 'QUEUED') Object.assign(run, { status: 'CANCELLED', finishedAt: nowIso(), error: 'Cancelled by user' });
      else if (run.status === 'RUNNING') run.cancelRequested = true;
      else fail(`Run is already ${run.status}`);
      return { result: runSummary(run) };
    }
    if (a === 'runners' && !b && method === 'GET') {
      return { result: db.runners.filter((r: any) => !r.revokedAt).map((r: any) => ({ ...r, online: true })) };
    }
    if (a === 'runners' && !b && method === 'POST') {
      const runner = { id: genId(), name: body?.name?.trim() || 'My computer', version: null, lastSeenAt: nowIso(), revokedAt: null, createdAt: nowIso() };
      db.runners.push(runner);
      return { result: { ...runner, online: true, token: `vdr_mock_${genId()}${genId()}` } };
    }
    if (a === 'runners' && b && method === 'DELETE') {
      const runner = db.runners.find((r: any) => r.id === b && !r.revokedAt);
      if (!runner) fail('Runner not found', 'NOT_FOUND');
      runner.revokedAt = nowIso();
      return { result: { success: true } };
    }
  }

  // Changesets
  if (resource === 'changesets' && a && b === 'files' && method === 'GET') {
    const path = query.get('path');
    const files = db.changeFiles.filter((f: any) => f.changeSetId === a);
    if (!path) return { result: files };
    const file = files.find((f: any) => f.path === path);
    if (!file) fail(`File "${path}" not in this changeset`, 'NOT_FOUND');
    return { result: file };
  }

  // Review notes (section 12 proposal)
  if (resource === 'review-notes' && a) {
    const note = db.reviewNotes.find((n: any) => n.id === a);
    if (!note) fail('Review note not found', 'NOT_FOUND');
    if (b === 'replies' && method === 'POST') {
      if (!body?.body?.trim()) fail('body là bắt buộc');
      db.reviewReplies.push({ id: genId(), noteId: note.id, authorType: 'USER', body: body.body.trim(), revision: null, createdAt: nowIso() });
      if (note.status === 'ADDRESSED' || note.status === 'RESOLVED') { note.status = 'FOLLOW_UP'; note.resolvedAt = null; }
      return { result: noteView(db, note) };
    }
    if (!b && method === 'PATCH') {
      if (body?.status === 'RESOLVED') Object.assign(note, { status: 'RESOLVED', resolvedAt: nowIso() });
      if (typeof body?.body === 'string') {
        if (note.status !== 'OPEN') fail('Chỉ sửa được góp ý đang mở', 'CONFLICT');
        note.body = body.body;
      }
      return { result: noteView(db, note) };
    }
  }

  // Task review
  if (resource === 'tasks' && a && b) {
    if (b === 'changesets' && method === 'GET') {
      ctx.findTask(db, a);
      return {
        result: db.changeSets
          .filter((cs: any) => cs.taskId === a)
          .sort((x: any, y: any) => y.revision - x.revision)
          .map((cs: any) => ({ ...cs, files: db.changeFiles.filter((f: any) => f.changeSetId === cs.id).map(({ patch: _patch, ...f }: any) => f).sort((x: any, y: any) => x.path.localeCompare(y.path)) }))
      };
    }
    if (b === 'review-notes' && method === 'GET') {
      ctx.findTask(db, a);
      return { result: db.reviewNotes.filter((n: any) => n.taskId === a).sort((x: any, y: any) => x.createdAt.localeCompare(y.createdAt)).map((n: any) => noteView(db, n)) };
    }
    if (b === 'review-notes' && method === 'POST') {
      ctx.findTask(db, a);
      if (!body?.body?.trim()) fail('body là bắt buộc');
      if (body.line !== undefined && !body.filePath) fail('line requires filePath');
      const note = { id: genId(), taskId: a, changeSetId: body.changeSetId ?? null, filePath: body.filePath ?? null, line: body.line ?? null, side: body.side ?? null, body: body.body.trim(), status: 'OPEN', addressedInRevision: null, resolvedInRevision: null, resolvedAt: null, createdAt: nowIso() };
      db.reviewNotes.push(note);
      return { result: noteView(db, note) };
    }
    if (b === 'accept' && method === 'POST') {
      const task = agentTask(db, ctx, a);
      if (task.status !== 'IN_REVIEW') fail(`Task is ${task.status}, expected IN_REVIEW`, 'CONFLICT');
      moveToStatus(db, ctx, task, 'COMPLETED');
      db.reviewNotes.filter((n: any) => n.taskId === a && n.status !== 'RESOLVED').forEach((n: any) => Object.assign(n, { status: 'RESOLVED', resolvedAt: nowIso() }));
      db.comments.push({ id: genId(), taskId: a, content: 'Đã duyệt: Done.', authorType: 'SYSTEM', runId: null, createdAt: nowIso(), updatedAt: nowIso() });
      if (task.planId) completePlanIfDone(db, ctx, task.planId);
      return { result: { id: task.id, status: task.status } };
    }
    if (b === 'request-rework' && method === 'POST') {
      const task = agentTask(db, ctx, a);
      if (task.status !== 'IN_REVIEW') fail(`Task is ${task.status}, expected IN_REVIEW`, 'CONFLICT');
      if (db.runs.some((r: any) => r.projectId === task.projectId && r.taskId === a && (r.status === 'QUEUED' || r.status === 'RUNNING'))) fail('Task already has a queued or running run', 'CONFLICT');
      const ts = nowIso();
      if (body?.note?.trim()) {
        db.reviewNotes.push({ id: genId(), taskId: a, changeSetId: null, filePath: null, line: null, side: null, body: body.note.trim(), status: 'OPEN', addressedInRevision: null, resolvedInRevision: null, resolvedAt: null, createdAt: ts });
      }
      if (!db.reviewNotes.some((n: any) => n.taskId === a && noteStatusOpen(n))) fail('Cần ít nhất một góp ý đang mở để yêu cầu làm lại');
      task.reworkNote = body?.note?.trim() || task.reworkNote;
      moveToStatus(db, ctx, task, 'PENDING');
      db.comments.push({ id: genId(), taskId: a, content: 'Yêu cầu làm lại — Claude sẽ xử lý các góp ý đang mở.', authorType: 'SYSTEM', runId: null, createdAt: ts, updatedAt: ts });
      enqueue(db, ctx, { projectId: task.projectId, type: 'REWORK', taskId: a, planId: task.planId });
      return { result: { id: task.id, status: task.status } };
    }
  }

  return { result: NO_MATCH };
};
