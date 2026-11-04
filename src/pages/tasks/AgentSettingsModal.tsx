import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { X, FolderGit2, FolderOpen, RefreshCw, CircleCheck, CircleAlert, CircleHelp, FileWarning, Plus, Pencil, Trash2, Sparkles, GitBranch } from 'lucide-react';
import { CHECKOUT_MODES, MERGE_METHODS, REPO_NAME_RE, agentSettingsOf, repoNameFromPath, repoStatusOf, useBusy } from './agent';

interface AgentSettingsModalProps {
  project: any;
  onClose: () => void;
  onSaved: () => void;
  onOpenRunners: () => void;
}

const WORKSPACE_STATUS: Record<string, { label: string; color: string; icon: React.FC<{ size?: number }> }> = {
  OK: { label: 'Hợp lệ', color: 'var(--success)', icon: CircleCheck },
  NO_CONTEXT: { label: 'Thiếu file context', color: 'var(--warning)', icon: FileWarning },
  INVALID: { label: 'Không hợp lệ', color: 'var(--danger)', icon: CircleAlert },
  UNKNOWN: { label: 'Chưa kiểm tra', color: 'var(--text-muted)', icon: CircleHelp }
};

export const WorkspaceBadge: React.FC<{ project: any }> = ({ project }) => {
  const repos: any[] = project?.repos || [];
  if (!repos.length && !project?.workspacePath) return <span className="badge">Chưa gắn repo</span>;
  const missingContext = repos.some((r) => repoStatusOf(r) === 'NO_CONTEXT');
  const meta = project.workspaceStatus === 'OK' ? WORKSPACE_STATUS.OK : missingContext ? WORKSPACE_STATUS.NO_CONTEXT : WORKSPACE_STATUS[project.workspaceStatus] || WORKSPACE_STATUS.UNKNOWN;
  const Icon = meta.icon;
  return (
    <span className="badge" style={{ color: meta.color }} title={project.workspaceMessage || project.workspacePath}>
      <Icon size={12} /> {repos.length || 1} repo: {meta.label}
    </span>
  );
};

const isAbsolutePath = (value: string) => /^(\/|[A-Za-z]:[\\/])/.test(value);
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.8rem' };

const EMPTY_REPO = {
  name: '', path: '', defaultBranch: 'main', contextFile: 'CLAUDE.md', checkoutMode: 'WORKTREE',
  setupCommand: '', testCommand: '', lintCommand: '', buildCommand: ''
};
type RepoDraft = typeof EMPTY_REPO;

const draftOf = (repo: any): RepoDraft => ({
  name: repo.name, path: repo.path, defaultBranch: repo.defaultBranch, contextFile: repo.contextFile, checkoutMode: repo.checkoutMode,
  setupCommand: repo.setupCommand || '', testCommand: repo.testCommand || '', lintCommand: repo.lintCommand || '', buildCommand: repo.buildCommand || ''
});

/** "Chọn…": the runner opens the OS folder dialog (section 14) because the browser cannot read absolute paths */
const useFolderPicker = (projectName: string) => {
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const pick = async (): Promise<string | null> => {
    setNote({ error: false, text: 'Đang mở hộp chọn thư mục trên máy chạy… (có thể mất vài giây, kiểm tra cửa sổ Finder)' });
    let request: any;
    try {
      request = await api.post('/api/agent/folder-picks', { prompt: `Chọn thư mục repo cho ${projectName}` });
    } catch (err) {
      setNote({ error: true, text: getErrorMessage(err, 'Không gửi được yêu cầu chọn thư mục') });
      return null;
    }
    const started = Date.now();
    while (alive.current && Date.now() - started < 150_000) {
      await new Promise((r) => setTimeout(r, 1000));
      let state: any;
      try {
        state = await api.get(`/api/agent/folder-picks/${request.id}`, { noCache: true });
      } catch (err) {
        setNote({ error: true, text: getErrorMessage(err, 'Mất kết nối khi chờ chọn thư mục') });
        return null;
      }
      if (state.status === 'DONE' && state.path) {
        setNote(state.workspace && !state.workspace.ok ? { error: true, text: state.workspace.message } : null);
        return state.path;
      }
      if (state.status === 'CANCELLED') { setNote({ error: false, text: 'Đã huỷ chọn thư mục.' }); return null; }
      if (state.status === 'FAILED' || state.status === 'EXPIRED') {
        setNote({ error: true, text: state.message || (state.status === 'EXPIRED' ? 'Hết thời gian chờ chọn thư mục.' : 'Máy chạy không mở được hộp chọn thư mục.') });
        return null;
      }
      if (state.status === 'PENDING' && Date.now() - started > 15_000) {
        setNote({ error: false, text: 'Máy chạy chưa nhận yêu cầu — kiểm tra vdev-agent có đang chạy trên máy này không.' });
      }
    }
    return null;
  };
  return { pick, note };
};

const RepoForm: React.FC<{
  initial: RepoDraft;
  existingNames: string[];
  busy: boolean;
  projectName: string;
  onCancel: () => void;
  onSave: (draft: RepoDraft) => void;
}> = ({ initial, existingNames, busy, projectName, onCancel, onSave }) => {
  const [draft, setDraft] = useState<RepoDraft>(initial);
  const [nameTouched, setNameTouched] = useState(!!initial.name);
  const [picking, setPicking] = useState(false);
  const picker = useFolderPicker(projectName);
  const set = (patch: Partial<RepoDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setPath = (path: string) => set({ path, ...(nameTouched ? {} : { name: repoNameFromPath(path) }) });

  const pathError = draft.path.trim() && !isAbsolutePath(draft.path.trim()) ? 'Cần đường dẫn tuyệt đối, ví dụ /Users/ban/code/vdev-be' : '';
  const nameError = !draft.name ? '' : !REPO_NAME_RE.test(draft.name) ? 'Chữ thường, số, . _ - (tối đa 40 ký tự)' : existingNames.includes(draft.name) ? 'Tên đã có trong workspace' : '';
  const invalid = !draft.name || !draft.path.trim() || !!pathError || !!nameError || !draft.defaultBranch.trim() || !draft.contextFile.trim();
  const mode = CHECKOUT_MODES.find((m) => m.value === draft.checkoutMode) || CHECKOUT_MODES[0];

  return (
    <div className="tw-repo-form">
      <div className="form-group">
        <label className="form-label">Thư mục repo (trên máy chạy Claude)</label>
        <div className="flex gap-2">
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <FolderGit2 size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input className={`form-input ${pathError ? 'form-input-error' : ''}`} style={{ width: '100%', paddingLeft: 32, ...mono }} placeholder="/Users/ban/code/vdev-be" value={draft.path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
          </div>
          <button className="btn btn-secondary" disabled={picking || busy} onClick={async () => { setPicking(true); const path = await picker.pick(); setPicking(false); if (path) setPath(path); }}>
            <FolderOpen size={14} /> {picking ? 'Đang chờ...' : 'Chọn…'}
          </button>
        </div>
        {pathError && <span className="form-error-text">{pathError}</span>}
        {picker.note && <span style={{ fontSize: '0.78rem', color: picker.note.error ? 'var(--danger)' : 'var(--text-muted)' }}>{picker.note.text}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="form-group">
          <label className="form-label">Tên repo</label>
          <input className={`form-input ${nameError ? 'form-input-error' : ''}`} style={mono} placeholder="vdev-be" value={draft.name} onChange={(e) => { setNameTouched(true); set({ name: e.target.value.toLowerCase() }); }} />
          {nameError && <span className="form-error-text">{nameError}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Nhánh gốc</label>
          <input className="form-input" style={mono} placeholder="main" value={draft.defaultBranch} onChange={(e) => set({ defaultBranch: e.target.value.trim() })} />
        </div>
        <div className="form-group">
          <label className="form-label">File context (bắt buộc)</label>
          <input className="form-input" style={mono} placeholder="CLAUDE.md" value={draft.contextFile} onChange={(e) => set({ contextFile: e.target.value.trim() })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Cách Claude lấy code của nhánh task</label>
        <div className="tw-segmented" style={{ alignSelf: 'flex-start' }}>
          {CHECKOUT_MODES.map((m) => <button key={m.value} type="button" className={draft.checkoutMode === m.value ? 'active' : ''} onClick={() => set({ checkoutMode: m.value })}>{m.label}</button>)}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mode.hint}</span>
      </div>
      {draft.checkoutMode === 'WORKTREE' && (
        <div className="form-group">
          <label className="form-label">Lệnh chuẩn bị worktree (tuỳ chọn)</label>
          <input className="form-input" style={mono} placeholder="pnpm install --frozen-lockfile   hoặc   ln -s {repo}/node_modules node_modules" value={draft.setupCommand} onChange={(e) => set({ setupCommand: e.target.value })} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chạy một lần khi tạo worktree mới. <code>{'{repo}'}</code> = thư mục repo gốc của bạn.</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {([['testCommand', 'Lệnh test', 'pnpm test'], ['lintCommand', 'Lệnh lint', 'pnpm lint'], ['buildCommand', 'Lệnh build', 'pnpm build']] as const).map(([key, label, placeholder]) => (
          <div className="form-group" key={key}>
            <label className="form-label">{label}</label>
            <input className="form-input" style={mono} placeholder={placeholder} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8 }}>
        Runner chạy sau mỗi task cho repo có thay đổi; để trống thì bỏ qua. <code>{'{module}'}</code> / <code>{'{files}'}</code> / <code>{'{files:.py}'}</code> chỉ kiểm phần task đã sửa, ví dụ <code>{'make desktop-test M={module}'}</code>.
      </p>
      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Hủy</button>
        <button className="btn btn-primary btn-sm" disabled={invalid || busy} onClick={() => onSave(draft)}>{busy ? 'Đang lưu...' : 'Lưu repo'}</button>
      </div>
    </div>
  );
};

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({ project, onClose, onSaved, onOpenRunners }) => {
  const initial = agentSettingsOf(project);
  const [repos, setRepos] = useState<any[]>(project.repos || []);
  const [editing, setEditing] = useState<string | null>(null); // repo id, 'new' or null
  const [summary, setSummary] = useState({ status: project.workspaceStatus || 'UNKNOWN', message: project.workspaceMessage || '' });
  const [settings, setSettings] = useState({
    enabled: initial.enabled,
    excludePatterns: (initial.excludePatterns || []).join('\n'),
    contextPaths: (initial.contextPaths || []).join('\n'),
    maxTurnsPerTask: initial.maxTurnsPerTask,
    maxBudgetUsdPerRun: initial.maxBudgetUsdPerRun,
    previewUrl: initial.previewUrl || '',
    previewLoginPath: initial.previewLoginPath || '',
    previewUsername: initial.previewUsername || '',
    previewApplyCommand: initial.previewApplyCommand || '',
    mergeMethod: initial.mergeMethod || 'squash'
  });
  const { busy, run } = useBusy();

  const loadRepos = useCallback(async () => {
    try {
      const list = await api.get(`/api/task-projects/${project.id}/repos`, { noCache: true });
      setRepos(Array.isArray(list) ? list : []);
    } catch {
      // Older backend without /repos: keep what the project came with
    }
  }, [project.id]);
  useEffect(() => { loadRepos(); }, [loadRepos]);

  const contextList = settings.contextPaths.split('\n').map((p: string) => p.trim()).filter(Boolean);
  const contextError = contextList.some((p: string) => p.includes('..') || /^(\/|[A-Za-z]:)/.test(p))
    ? 'Đường dẫn tương đối trong repo, không bắt đầu bằng / và không chứa ..'
    : contextList.length > 20 ? 'Tối đa 20 mục' : '';
  const previewError = settings.previewUrl.trim() && !/^https?:\/\/\S+$/.test(settings.previewUrl.trim()) ? 'Cần URL http(s), ví dụ http://localhost:8069' : '';

  const save = () => run('save', async () => {
    try {
      await api.patch(`/api/task-projects/${project.id}`, {
        agentSettings: {
          enabled: settings.enabled,
          excludePatterns: settings.excludePatterns.split('\n').map((p: string) => p.trim()).filter(Boolean),
          contextPaths: contextList,
          maxTurnsPerTask: Number(settings.maxTurnsPerTask) || initial.maxTurnsPerTask,
          maxBudgetUsdPerRun: Number(settings.maxBudgetUsdPerRun) || initial.maxBudgetUsdPerRun,
          previewUrl: settings.previewUrl.trim() || null,
          previewLoginPath: settings.previewLoginPath.trim() || null,
          previewUsername: settings.previewUsername.trim() || null,
          previewApplyCommand: settings.previewApplyCommand.trim() || null,
          mergeMethod: settings.mergeMethod
        }
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu cài đặt thất bại'));
    }
  });

  const saveRepo = (draft: RepoDraft, repoId?: string) => run(`repo-${repoId || 'new'}`, async () => {
    const body = { ...draft, path: draft.path.trim() };
    try {
      if (repoId) await api.patch(`/api/task-projects/${project.id}/repos/${repoId}`, body);
      else await api.post(`/api/task-projects/${project.id}/repos`, body);
      setEditing(null);
      await loadRepos();
      onSaved();
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu repo thất bại'));
    }
  });

  const removeRepo = (repo: any) => {
    if (!window.confirm(`Bỏ repo "${repo.name}" khỏi workspace? (thư mục và code trên máy không bị xoá)`)) return;
    run(`del-${repo.id}`, async () => {
      try {
        await api.delete(`/api/task-projects/${project.id}/repos/${repo.id}`);
        await loadRepos();
        onSaved();
      } catch (err) {
        alert(getErrorMessage(err, 'Xoá repo thất bại'));
      }
    });
  };

  // The check runs on the runner machine: git, remote, gh login, context file on origin
  const verify = () => run('verify', async () => {
    try {
      const result = await api.post(`/api/task-projects/${project.id}/workspace/verify`, {});
      setSummary({ status: result.workspaceStatus, message: result.workspaceMessage || '' });
      if (Array.isArray(result.repos)) setRepos(result.repos);
      else await loadRepos();
      onSaved();
    } catch (err) {
      alert(getErrorMessage(err, 'Kiểm tra repo thất bại'));
    }
  });

  const initContext = (repo: any) => run(`ctx-${repo.id}`, async () => {
    try {
      await api.post(`/api/task-projects/${project.id}/repos/${repo.id}/init-context`, {});
      alert(`Đã giao Claude viết ${repo.contextFile} cho ${repo.name}. Task mới nằm ở tab Kế hoạch — review rồi Merge PR, sau đó bấm Kiểm tra lại.`);
      onSaved();
    } catch (err) {
      alert(getErrorMessage(err, 'Không giao được việc tạo file context'));
    }
  });

  const summaryMeta = WORKSPACE_STATUS[summary.status] || WORKSPACE_STATUS.UNKNOWN;
  const SummaryIcon = summaryMeta.icon;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Workspace & Claude</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="flex align-center gap-2" style={{ marginBottom: 6 }}>
            <label className="form-label" style={{ margin: 0, flexGrow: 1 }}>Repo của workspace — một task có thể sửa nhiều repo, mỗi repo một PR</label>
            <button className="btn btn-secondary btn-sm" disabled={!repos.length || busy !== null} onClick={verify}>
              <RefreshCw size={13} className={busy === 'verify' ? 'spin' : ''} /> {busy === 'verify' ? 'Đang kiểm tra...' : 'Kiểm tra'}
            </button>
          </div>
          {repos.length > 0 && (
            <div className="flex align-center gap-2" style={{ fontSize: '0.78rem', color: summaryMeta.color, marginBottom: 8 }}>
              <SummaryIcon size={13} /> {summaryMeta.label}{summary.message ? ` · ${summary.message}` : ''}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {repos.map((repo) => {
              const status = repoStatusOf(repo);
              const meta = WORKSPACE_STATUS[status];
              const Icon = meta.icon;
              if (editing === repo.id) {
                return <RepoForm key={repo.id} initial={draftOf(repo)} existingNames={repos.filter((r) => r.id !== repo.id).map((r) => r.name)} busy={busy === `repo-${repo.id}`} projectName={project.name} onCancel={() => setEditing(null)} onSave={(d) => saveRepo(d, repo.id)} />;
              }
              return (
                <div key={repo.id} className="tw-repo-row">
                  <div style={{ minWidth: 0, flexGrow: 1 }}>
                    <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
                      <b style={mono}>{repo.name}</b>
                      <span className="badge" style={{ color: meta.color }}><Icon size={11} /> {meta.label}</span>
                      <span className="badge"><GitBranch size={11} /> {repo.defaultBranch}</span>
                      <span className="badge">{repo.checkoutMode === 'IN_PLACE' ? 'Trong thư mục' : 'Worktree'}</span>
                    </div>
                    <div style={{ ...mono, fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginTop: 2 }}>{repo.path}</div>
                    {repo.message && <div style={{ fontSize: '0.75rem', color: status === 'OK' ? 'var(--text-muted)' : meta.color, marginTop: 2 }}>{repo.message}</div>}
                    {status === 'NO_CONTEXT' && (
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={busy !== null} onClick={() => initContext(repo)}>
                        <Sparkles size={13} /> {busy === `ctx-${repo.id}` ? 'Đang giao...' : `Nhờ Claude tạo ${repo.contextFile}`}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1" style={{ flexShrink: 0 }}>
                    <button className="icon-btn" title="Sửa repo" disabled={busy !== null} onClick={() => setEditing(repo.id)}><Pencil size={14} /></button>
                    <button className="icon-btn" title="Bỏ repo khỏi workspace" disabled={busy !== null} onClick={() => removeRepo(repo)}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
            {editing === 'new' ? (
              <RepoForm initial={EMPTY_REPO} existingNames={repos.map((r) => r.name)} busy={busy === 'repo-new'} projectName={project.name} onCancel={() => setEditing(null)} onSave={(d) => saveRepo(d)} />
            ) : (
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={busy !== null || editing !== null} onClick={() => setEditing('new')}>
                <Plus size={14} /> Thêm repo
              </button>
            )}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '8px 0 16px' }}>
            Mỗi repo phải là git repo có remote GitHub, máy chạy đã <code>gh auth login</code>, và có file context (vd <code>CLAUDE.md</code>) trên nhánh gốc ở origin — Claude đọc nó trước mỗi kế hoạch và tự đánh giá có cần cập nhật sau mỗi task.
            {' '}Máy chạy (<button className="icon-btn" style={{ padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }} onClick={onOpenRunners}>quản lý máy chạy</button>) cần đang bật để chọn thư mục và kiểm tra.
          </p>

          <label className="flex align-center gap-2" style={{ fontSize: '0.875rem', margin: '4px 0 16px' }}>
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            Cho phép Claude lập kế hoạch và làm task trong workspace này
          </label>

          <div className="form-group">
            <label className="form-label">Khi bấm Merge trên VDEV</label>
            <select className="form-input" value={settings.mergeMethod} onChange={(e) => setSettings({ ...settings, mergeMethod: e.target.value as any })}>
              {MERGE_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Merge trên GitHub cũng được: runner tự thấy, đóng task và xoá nhánh.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Tài liệu trong repo Claude luôn đọc trước (mỗi dòng một đường dẫn, ngoài file context)</label>
            <textarea className={`form-input ${contextError ? 'form-input-error' : ''}`} rows={3} style={{ ...mono, resize: 'vertical' }} placeholder={'src/doc/\nDesignGuideline.md'} value={settings.contextPaths} onChange={(e) => setSettings({ ...settings, contextPaths: e.target.value })} />
            {contextError && <span className="form-error-text">{contextError}</span>}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ảnh, PDF, file yêu cầu ngoài code thì thêm ở “Tài liệu của project” trong tab Kế hoạch.</span>
          </div>

          <div className="form-group">
            <label className="form-label">File không bao giờ gửi lên server / commit (mỗi dòng một mẫu)</label>
            <textarea className="form-input" rows={4} style={{ ...mono, resize: 'vertical' }} value={settings.excludePatterns} onChange={(e) => setSettings({ ...settings, excludePatterns: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">Chụp màn hình trước / sau cho task sửa giao diện (repo đầu tiên)</label>
            <div className="grid grid-cols-2 gap-2">
              <input className={`form-input ${previewError ? 'form-input-error' : ''}`} style={mono} placeholder="URL app, vd http://localhost:8069" value={settings.previewUrl} onChange={(e) => setSettings({ ...settings, previewUrl: e.target.value })} />
              <input className="form-input" style={mono} placeholder="Trang đăng nhập, vd /web/login" value={settings.previewLoginPath} onChange={(e) => setSettings({ ...settings, previewLoginPath: e.target.value })} />
              <input className="form-input" style={mono} placeholder="Tài khoản, vd dev@satori.local" value={settings.previewUsername} onChange={(e) => setSettings({ ...settings, previewUsername: e.target.value })} />
              <input className="form-input" style={mono} placeholder="Lệnh áp dụng trước khi chụp, vd make desktop-update M={module}" value={settings.previewApplyCommand} onChange={(e) => setSettings({ ...settings, previewApplyCommand: e.target.value })} />
            </div>
            {previewError && <span className="form-error-text">{previewError}</span>}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Để trống URL thì không chụp. App phải chạy từ thư mục repo (chế độ “Ngay trong thư mục”) mới thấy thay đổi của task.
              {settings.previewUsername.trim() && settings.previewUrl.trim() && !previewError && <> Mật khẩu chỉ lưu trên máy chạy: <code>{`vdev-agent app-password --url ${settings.previewUrl.trim()} --user ${settings.previewUsername.trim()}`}</code></>}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="form-label">Số lượt tối đa mỗi task</label>
              <input type="number" min={1} className="form-input" value={settings.maxTurnsPerTask} onChange={(e) => setSettings({ ...settings, maxTurnsPerTask: Number(e.target.value) })} />
            </div>
            <div className="form-group">
              <label className="form-label">Chi phí tối đa mỗi lượt chạy (USD)</label>
              <input type="number" min={0.1} step={0.5} className="form-input" value={settings.maxBudgetUsdPerRun} onChange={(e) => setSettings({ ...settings, maxBudgetUsdPerRun: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={!!contextError || !!previewError || busy !== null} onClick={save}>{busy === 'save' ? 'Đang lưu...' : 'Lưu cài đặt'}</button>
        </div>
      </div>
    </div>
  );
};
