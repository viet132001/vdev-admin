import React, { useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { X, FolderGit2, RefreshCw, CircleCheck, CircleAlert, CircleHelp } from 'lucide-react';
import { agentSettingsOf, useBusy } from './agent';

interface AgentSettingsModalProps {
  project: any;
  onClose: () => void;
  onSaved: () => void;
  onOpenRunners: () => void;
}

const WORKSPACE_STATUS: Record<string, { label: string; color: string; icon: React.FC<{ size?: number }> }> = {
  OK: { label: 'Hợp lệ', color: 'var(--success)', icon: CircleCheck },
  INVALID: { label: 'Không hợp lệ', color: 'var(--danger)', icon: CircleAlert },
  UNKNOWN: { label: 'Chưa kiểm tra', color: 'var(--text-muted)', icon: CircleHelp }
};

export const WorkspaceBadge: React.FC<{ project: any }> = ({ project }) => {
  if (!project?.workspacePath) return <span className="badge">Chưa gắn thư mục</span>;
  const meta = WORKSPACE_STATUS[project.workspaceStatus] || WORKSPACE_STATUS.UNKNOWN;
  const Icon = meta.icon;
  return (
    <span className="badge" style={{ color: meta.color }} title={project.workspaceMessage || project.workspacePath}>
      <Icon size={12} /> Thư mục: {meta.label}
    </span>
  );
};

const isAbsolutePath = (value: string) => /^(\/|[A-Za-z]:[\\/])/.test(value);

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({ project, onClose, onSaved, onOpenRunners }) => {
  const initial = agentSettingsOf(project);
  const [workspacePath, setWorkspacePath] = useState<string>(project.workspacePath || '');
  const [settings, setSettings] = useState({
    enabled: initial.enabled,
    testCommand: initial.testCommand || '',
    lintCommand: initial.lintCommand || '',
    buildCommand: initial.buildCommand || '',
    excludePatterns: (initial.excludePatterns || []).join('\n'),
    contextPaths: (initial.contextPaths || []).join('\n'),
    maxTurnsPerTask: initial.maxTurnsPerTask,
    maxBudgetUsdPerRun: initial.maxBudgetUsdPerRun
  });
  const [status, setStatus] = useState({
    workspaceStatus: project.workspaceStatus || 'UNKNOWN',
    workspaceMessage: project.workspaceMessage || '',
    workspaceCheckedAt: project.workspaceCheckedAt || null
  });
  const { busy, run } = useBusy();

  const pathChanged = (workspacePath.trim() || null) !== (project.workspacePath || null);
  const contextList = settings.contextPaths.split('\n').map((p: string) => p.trim()).filter(Boolean);
  const contextError = contextList.some((p: string) => p.includes('..') || /^(\/|[A-Za-z]:)/.test(p))
    ? 'Đường dẫn tương đối trong repo, không bắt đầu bằng / và không chứa ..'
    : contextList.length > 20 ? 'Tối đa 20 mục' : '';
  const pathError = workspacePath.trim() && !isAbsolutePath(workspacePath.trim()) ? 'Cần đường dẫn tuyệt đối, ví dụ /Users/ban/code/du-an' : '';

  const payload = () => ({
    workspacePath: workspacePath.trim() || null,
    agentSettings: {
      enabled: settings.enabled,
      testCommand: settings.testCommand.trim() || null,
      lintCommand: settings.lintCommand.trim() || null,
      buildCommand: settings.buildCommand.trim() || null,
      excludePatterns: settings.excludePatterns.split('\n').map((p: string) => p.trim()).filter(Boolean),
      contextPaths: contextList,
      maxTurnsPerTask: Number(settings.maxTurnsPerTask) || initial.maxTurnsPerTask,
      maxBudgetUsdPerRun: Number(settings.maxBudgetUsdPerRun) || initial.maxBudgetUsdPerRun
    }
  });

  const save = () => run('save', async () => {
    try {
      await api.patch(`/api/task-projects/${project.id}`, payload());
      onSaved();
      onClose();
    } catch (err) {
      alert(getErrorMessage(err, 'Lưu cài đặt thất bại'));
    }
  });

  // The check runs on the runner machine, so an edited path is saved first
  const verify = () => run('verify', async () => {
    try {
      if (pathChanged) {
        await api.patch(`/api/task-projects/${project.id}`, payload());
        onSaved();
      }
      const result = await api.post(`/api/task-projects/${project.id}/workspace/verify`, {});
      setStatus({ workspaceStatus: result.workspaceStatus, workspaceMessage: result.workspaceMessage || '', workspaceCheckedAt: result.workspaceCheckedAt });
      onSaved();
    } catch (err) {
      alert(getErrorMessage(err, 'Kiểm tra thư mục thất bại'));
    }
  });

  const meta = WORKSPACE_STATUS[status.workspaceStatus] || WORKSPACE_STATUS.UNKNOWN;
  const StatusIcon = meta.icon;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Thư mục làm việc & Claude</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Thư mục code của project (trên máy chạy Claude)</label>
            <div className="flex gap-2">
              <div style={{ position: 'relative', flexGrow: 1 }}>
                <FolderGit2 size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                <input
                  className={`form-input ${pathError ? 'form-input-error' : ''}`}
                  style={{ width: '100%', paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                  placeholder="/Users/ban/code/du-an"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <button className="btn btn-secondary" disabled={!workspacePath.trim() || !!pathError || busy !== null} onClick={verify}>
                <RefreshCw size={14} className={busy === 'verify' ? 'spin' : ''} /> {busy === 'verify' ? 'Đang kiểm tra...' : 'Kiểm tra'}
              </button>
            </div>
            {pathError && <span className="form-error-text">{pathError}</span>}
            {!pathError && workspacePath.trim() && (
              <span className="flex align-center gap-2" style={{ fontSize: '0.78rem', color: meta.color }}>
                <StatusIcon size={13} />
                {pathChanged ? 'Đường dẫn đã đổi — bấm Kiểm tra để máy chạy xác nhận' : `${meta.label}${status.workspaceMessage ? ` · ${status.workspaceMessage}` : ''}`}
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Thư mục phải là git repo. Máy chạy (<button className="icon-btn" style={{ padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }} onClick={onOpenRunners}>quản lý máy chạy</button>) cần đang bật để kiểm tra.
            </span>
          </div>

          <label className="flex align-center gap-2" style={{ fontSize: '0.875rem', margin: '4px 0 16px' }}>
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            Cho phép Claude lập kế hoạch và làm task trong project này
          </label>

          <div className="grid grid-cols-3 gap-2">
            {([['testCommand', 'Lệnh test', 'npm test'], ['lintCommand', 'Lệnh lint', 'npm run lint'], ['buildCommand', 'Lệnh build', 'npm run build']] as const).map(([key, label, placeholder]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} placeholder={placeholder} value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 }}>
            Claude chỉ được chạy các lệnh này để tự kiểm tra; để trống thì bỏ qua bước đó.
          </p>

          <div className="form-group">
            <label className="form-label">Tài liệu trong repo Claude luôn đọc trước (mỗi dòng một đường dẫn)</label>
            <textarea
              className={`form-input ${contextError ? 'form-input-error' : ''}`}
              rows={3}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', resize: 'vertical' }}
              placeholder={'src/doc/\nDesignGuideline.md'}
              value={settings.contextPaths}
              onChange={(e) => setSettings({ ...settings, contextPaths: e.target.value })}
            />
            {contextError && <span className="form-error-text">{contextError}</span>}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ảnh, PDF, file yêu cầu ngoài code thì thêm ở “Tài liệu của project” trong tab Kế hoạch.</span>
          </div>

          <div className="form-group">
            <label className="form-label">File không bao giờ gửi lên server (mỗi dòng một mẫu)</label>
            <textarea className="form-input" rows={4} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', resize: 'vertical' }} value={settings.excludePatterns} onChange={(e) => setSettings({ ...settings, excludePatterns: e.target.value })} />
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
          <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn btn-primary" disabled={!!pathError || !!contextError || busy !== null} onClick={save}>{busy === 'save' ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
};
