import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { Plus, Sparkles, Check, X, RotateCcw, Ban, Pencil, ChevronRight, CircleAlert, Terminal, Library } from 'lucide-react';
import { PLAN_STATUS, RUN_STATUS, RUN_TYPE, agentSettingsOf, formatRelative, isActiveRun, runErrorText, useBusy } from './agent';
import { PRIORITY_OPTIONS, StatusBadge, type ConfirmState } from './shared';
import { AttachmentList, AttachmentPicker, ProjectDocsModal, imagesFromPaste, submitAttachments, type PendingAttachment } from './ProjectDocs';

interface PlanPanelProps {
  project: any;
  refreshKey: number;
  onOpenTask: (id: string) => void;
  onOpenSettings: () => void;
  onChanged: () => void;
  onProjectChanged: () => void;
  onConfirm: (state: ConfirmState) => void;
}

const POLL_MS = 3000;

// Minimal markdown for plan content: headings, bullet / numbered lists, `code`, **bold**
const renderInline = (text: string) =>
  text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="tw-inline-code">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });

export const Markdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="tw-markdown">
    {text.split('\n').map((line, i) => {
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) return <div key={i} className={`tw-md-h${heading[1].length}`}>{renderInline(heading[2])}</div>;
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) return <div key={i} className="tw-md-li">• {renderInline(bullet[1])}</div>;
      const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (numbered) return <div key={i} className="tw-md-li">{numbered[1]}. {renderInline(numbered[2])}</div>;
      return line.trim() ? <p key={i}>{renderInline(line)}</p> : <div key={i} style={{ height: 6 }} />;
    })}
  </div>
);

export const PlanStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = PLAN_STATUS[status] || { label: status, color: 'var(--text-muted)' };
  return <span className="badge" style={{ color: meta.color }}>{meta.label}</span>;
};

export const RunLine: React.FC<{ run: any }> = ({ run }) => {
  if (!run) return null;
  const meta = RUN_STATUS[run.status] || { label: run.status, color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="flex align-center gap-2">
      {isActiveRun(run) && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} />}
      <span>{RUN_TYPE[run.type] || run.type}:</span>
      <span style={{ color: meta.color }}>{meta.label}{run.cancelRequested && run.status === 'RUNNING' ? ' (đang dừng)' : ''}</span>
      {run.error && <span style={{ color: 'var(--danger)' }}>· {runErrorText(run.error)}</span>}
      {typeof run.costUsd === 'number' && <span>· ${run.costUsd.toFixed(2)}</span>}
    </span>
  );
};

const RunLogs: React.FC<{ runId: string; active: boolean }> = ({ runId, active }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const lastSeq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lastSeq.current = 0;
    setLogs([]);
  }, [runId]);

  useEffect(() => {
    let stopped = false;
    const fetchLogs = async () => {
      try {
        const res = await api.get(`/api/agent/runs/${runId}/logs?afterSeq=${lastSeq.current}`, { noCache: true });
        const fresh = res?.logs || [];
        if (!stopped && fresh.length) {
          lastSeq.current = fresh[fresh.length - 1].seq;
          setLogs((prev) => [...prev, ...fresh]);
          requestAnimationFrame(() => box.current?.scrollTo({ top: box.current.scrollHeight }));
        }
      } catch {
        // Logs are best effort; the run status line still shows the outcome
      }
    };
    fetchLogs();
    if (!active) return () => { stopped = true; };
    const timer = setInterval(fetchLogs, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [runId, active]);

  return (
    <div ref={box} className="tw-log">
      {logs.length === 0 && <span style={{ color: 'var(--text-muted)' }}>{active ? 'Đang chờ log…' : 'Không có log.'}</span>}
      {logs.map((l) => (
        <div key={l.seq} className={`tw-log-line ${l.level === 'ERROR' ? 'error' : l.level === 'TOOL' ? 'tool' : ''}`}>
          <span className="tw-log-time">{new Date(l.createdAt).toLocaleTimeString('vi-VN')}</span>{l.message}
        </div>
      ))}
    </div>
  );
};

export const PlanPanel: React.FC<PlanPanelProps> = ({ project, refreshKey, onOpenTask, onOpenSettings, onChanged, onProjectChanged, onConfirm }) => {
  const [plans, setPlans] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', goal: '' });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [rejectAttachments, setRejectAttachments] = useState<PendingAttachment[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const { busy, run } = useBusy();

  const settings = agentSettingsOf(project);
  const workspaceReady = !!project.workspacePath && project.workspaceStatus === 'OK';

  const loadPlans = useCallback(async () => {
    try {
      const list = await api.get(`/api/task-plans?projectId=${project.id}`, { noCache: true });
      setPlans(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách kế hoạch'));
      setPlans([]);
      return [];
    }
  }, [project.id]);

  const loadPlan = useCallback(async (id: string) => {
    try {
      const detail = await api.get(`/api/task-plans/${id}`, { noCache: true });
      setPlan(detail);
      if (detail.parentTaskId) {
        const parent = await api.get(`/api/tasks/${detail.parentTaskId}`, { noCache: true });
        setChildren(parent.children || []);
      } else {
        setChildren([]);
      }
      return detail;
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được kế hoạch'));
      return null;
    }
  }, []);

  useEffect(() => {
    loadPlans().then((list) => {
      setSelectedId((current) => current && list.some((p: any) => p.id === current) ? current : list[0]?.id ?? null);
    });
  }, [loadPlans, refreshKey]);

  useEffect(() => {
    if (selectedId) loadPlan(selectedId);
    else setPlan(null);
  }, [selectedId, loadPlan, refreshKey]);

  // Poll while Claude is working on the selected plan
  const polling = !!plan && (plan.status === 'DRAFTING' || isActiveRun(plan.latestRun));
  useEffect(() => {
    if (!polling || !selectedId) return;
    const timer = setInterval(async () => {
      const detail = await loadPlan(selectedId);
      if (detail && !(detail.status === 'DRAFTING' || isActiveRun(detail.latestRun))) {
        loadPlans();
        onChanged();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, selectedId, loadPlan, loadPlans, onChanged]);

  const afterAction = async (id: string) => {
    await Promise.all([loadPlans(), loadPlan(id)]);
    onChanged();
  };

  const createPlan = () => run('create', async () => {
    if (!form.title.trim() || !form.goal.trim()) return;
    try {
      // Files are written into the local docs folder first; the plan only references them
      const files = await submitAttachments(project, attachments, form.title.trim());
      if (files.length && !project.docsFolder) onProjectChanged();
      const created = await api.post('/api/task-plans', {
        projectId: project.id, title: form.title.trim(), goal: form.goal.trim(), ...(files.length ? { attachments: files } : {})
      });
      setCreateOpen(false);
      setForm({ title: '', goal: '' });
      setAttachments([]);
      await loadPlans();
      setSelectedId(created.id);
    } catch (err) {
      alert(getErrorMessage(err, 'Không gửi được yêu cầu lập kế hoạch'));
    }
  });

  const planAction = (key: string, path: string, body: any = {}, fallback = 'Thao tác thất bại') => run(key, async () => {
    if (!plan) return;
    try {
      await api.post(`/api/task-plans/${plan.id}/${path}`, body);
      await afterAction(plan.id);
      return true;
    } catch (err) {
      alert(getErrorMessage(err, fallback));
      return false;
    }
  });

  const updateItem = (item: any, patch: any) => run(`item-${item.id}`, async () => {
    if (!plan) return;
    try {
      await api.patch(`/api/task-plans/${plan.id}/items/${item.id}`, patch);
      await loadPlan(plan.id);
      setEditingItem(null);
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật mục thất bại'));
    }
  });

  const included = plan?.items?.filter((i: any) => i.included).length ?? 0;
  const canRetry = plan && !isActiveRun(plan.latestRun) && (
    plan.status === 'DRAFTING' || plan.status === 'REJECTED' ||
    (plan.status === 'APPROVED' && children.some((c) => c.assignee === 'AGENT' && (c.status === 'PENDING' || c.status === 'IN_PROGRESS')))
  );
  const childDone = children.filter((c) => c.status === 'COMPLETED').length;

  return (
    <div className="tw-plan-shell">
      {/* Plan list */}
      <div className="tw-plan-list">
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setCreateOpen(true)}>
          <Sparkles size={15} /> Nhờ Claude lập kế hoạch
        </button>
        {(!workspaceReady || !settings.enabled) && (
          <div className="tw-warning">
            <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {!settings.enabled ? 'Claude đang tắt cho project này. ' : 'Thư mục làm việc chưa được xác nhận. '}
              <button className="icon-btn" style={{ padding: 0, textDecoration: 'underline', fontSize: 'inherit' }} onClick={onOpenSettings}>Mở cài đặt</button>
            </span>
          </div>
        )}
        <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => setDocsOpen(true)}><Library size={13} /> Tài liệu của project</button>
        {plans === null && <div className="loading-container" style={{ padding: 16 }}><span className="spinner"></span></div>}
        {plans?.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 4px' }}>Chưa có kế hoạch nào.</p>}
        {plans?.map((p) => (
          <button key={p.id} className={`tw-plan-item ${p.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(p.id)}>
            <span style={{ fontWeight: 500, textAlign: 'left' }}>{p.title}</span>
            <span className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
              <PlanStatusBadge status={p.status} />
              {p.itemCount > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.itemCount} mục</span>}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatRelative(p.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Plan detail */}
      <div className="tw-plan-detail">
        {!plan && plans?.length !== 0 && plans !== null && <div className="loading-container"><span className="spinner"></span></div>}
        {!plan && plans?.length === 0 && (
          <div className="empty-state">
            <Sparkles className="empty-state-icon" size={28} />
            <p style={{ maxWidth: 420 }}>Mô tả việc cần làm, Claude sẽ đọc code trong thư mục của project và đề xuất kế hoạch. Bạn duyệt xong thì Claude tự làm từng task.</p>
          </div>
        )}
        {plan && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{plan.title}</h2>
                <div className="flex align-center gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  <PlanStatusBadge status={plan.status} />
                  <RunLine run={plan.latestRun} />
                </div>
              </div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {plan.status === 'PENDING_APPROVAL' && (
                  <>
                    <button className="btn btn-secondary" disabled={busy !== null} onClick={() => { setFeedback(''); setRejectOpen(true); }}><X size={14} /> Từ chối</button>
                    <button className="btn btn-primary" disabled={busy !== null || included === 0} onClick={() => planAction('approve', 'approve', {}, 'Duyệt kế hoạch thất bại')}>
                      <Check size={14} /> {busy === 'approve' ? 'Đang duyệt...' : `Duyệt ${included} mục`}
                    </button>
                  </>
                )}
                {canRetry && (
                  <button className="btn btn-secondary" disabled={busy !== null} onClick={() => planAction('retry', 'retry', {}, 'Chạy lại thất bại')}>
                    <RotateCcw size={14} /> {busy === 'retry' ? 'Đang gửi...' : 'Chạy lại'}
                  </button>
                )}
                {isActiveRun(plan.latestRun) && plan.latestRun.status === 'RUNNING' && !plan.latestRun.cancelRequested && (
                  <button className="btn btn-secondary" disabled={busy !== null} onClick={() => run('stop', async () => {
                    try {
                      await api.post(`/api/agent/runs/${plan.latestRun.id}/cancel`, {});
                      await loadPlan(plan.id);
                    } catch (err) {
                      alert(getErrorMessage(err, 'Dừng lượt chạy thất bại'));
                    }
                  })}>
                    <Ban size={14} /> {busy === 'stop' ? 'Đang dừng...' : 'Dừng'}
                  </button>
                )}
                {['DRAFTING', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED'].includes(plan.status) && (
                  <button
                    className="btn btn-secondary"
                    disabled={busy !== null}
                    onClick={() => onConfirm({
                      title: 'Hủy kế hoạch',
                      message: 'Lượt chạy đang chờ hoặc đang chạy của kế hoạch sẽ bị dừng. Các task đã tạo vẫn giữ nguyên.',
                      confirmLabel: 'Hủy kế hoạch',
                      action: async () => { await planAction('cancel', 'cancel', {}, 'Hủy kế hoạch thất bại'); }
                    })}
                  >
                    Hủy kế hoạch
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="tw-label">Yêu cầu</div>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{plan.goal}</p>
              <AttachmentList project={project} attachments={(plan.attachments || []).filter((a: any) => a.source !== 'FEEDBACK')} />
            </div>
            {plan.feedback && (
              <div>
                <div className="tw-label">Góp ý lần trước</div>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{plan.feedback}</p>
                <AttachmentList project={project} attachments={(plan.attachments || []).filter((a: any) => a.source === 'FEEDBACK')} />
              </div>
            )}

            {plan.status === 'DRAFTING' && (
              <div className="tw-warning" style={{ color: 'var(--text-muted)' }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, flexShrink: 0 }} />
                {plan.latestRun?.status === 'QUEUED' ? 'Đang chờ máy chạy nhận việc…' : 'Claude đang đọc code và lập kế hoạch…'}
              </div>
            )}

            {plan.content && (
              <div>
                <div className="tw-label">Kế hoạch của Claude</div>
                <Markdown text={plan.content} />
              </div>
            )}

            {plan.items?.length > 0 && (
              <div>
                <div className="tw-label">
                  Các mục ({plan.status === 'PENDING_APPROVAL' ? `${included}/${plan.items.length} được chọn — bỏ chọn mục không muốn làm` : plan.items.length})
                </div>
                <div className="flex flex-col gap-2">
                  {plan.items.map((item: any, index: number) => {
                    const editable = plan.status === 'PENDING_APPROVAL';
                    const editing = editingItem?.id === item.id;
                    const task = children.find((c) => c.id === item.taskId);
                    return (
                      <div key={item.id} className="tw-plan-step" style={{ opacity: item.included ? 1 : 0.5 }}>
                        <div className="flex gap-2" style={{ alignItems: 'flex-start' }}>
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={item.included}
                              disabled={busy !== null}
                              onChange={(e) => updateItem(item, { included: e.target.checked })}
                              style={{ marginTop: 4, accentColor: 'var(--primary)' }}
                            />
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', minWidth: 16 }}>{index + 1}.</span>
                          )}
                          <div style={{ flexGrow: 1, minWidth: 0 }}>
                            {editing ? (
                              <div className="flex flex-col gap-2">
                                <input className="form-input" value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} />
                                <textarea className="form-input" rows={2} value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} />
                                <label className="form-label">Tiêu chí hoàn thành (mỗi dòng một tiêu chí)</label>
                                <textarea className="form-input" rows={3} value={editingItem.criteria} onChange={(e) => setEditingItem({ ...editingItem, criteria: e.target.value })} />
                                <div className="flex gap-2 align-center">
                                  <select className="form-input" value={editingItem.priority} onChange={(e) => setEditingItem({ ...editingItem, priority: e.target.value })}>
                                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                  </select>
                                  <span style={{ flexGrow: 1 }} />
                                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>Hủy</button>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    disabled={busy !== null || !editingItem.title.trim()}
                                    onClick={() => updateItem(item, {
                                      title: editingItem.title.trim(),
                                      description: editingItem.description,
                                      priority: editingItem.priority,
                                      acceptanceCriteria: editingItem.criteria.split('\n').map((c: string) => c.trim()).filter(Boolean)
                                    })}
                                  >
                                    {busy === `item-${item.id}` ? 'Đang lưu...' : 'Lưu'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex align-center gap-2" style={{ flexWrap: 'wrap' }}>
                                  <b style={{ fontSize: '0.875rem' }}>{item.title}</b>
                                  {task && <StatusBadge status={task.status} />}
                                  {editable && (
                                    <button className="icon-btn" title="Sửa mục" onClick={() => setEditingItem({ id: item.id, title: item.title, description: item.description || '', priority: item.priority, criteria: (item.acceptanceCriteria || []).join('\n') })}>
                                      <Pencil size={12} />
                                    </button>
                                  )}
                                  {task && (
                                    <button className="icon-btn" style={{ marginLeft: 'auto', fontSize: '0.75rem' }} onClick={() => onOpenTask(task.id)}>
                                      Mở task <ChevronRight size={12} />
                                    </button>
                                  )}
                                </div>
                                {item.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{item.description}</p>}
                                {item.acceptanceCriteria?.length > 0 && (
                                  <ul className="tw-criteria">
                                    {item.acceptanceCriteria.map((c: string, ci: number) => <li key={ci}>{c}</li>)}
                                  </ul>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {plan.status !== 'PENDING_APPROVAL' && children.length > 0 && (
              <div>
                <div className="tw-label">Tiến độ: {childDone}/{children.length} task Done</div>
                <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${(childDone / children.length) * 100}%` }} /></div>
              </div>
            )}

            {plan.latestRun && (
              <div>
                <button className="icon-btn" style={{ fontSize: '0.8rem', padding: '2px 0' }} onClick={() => setShowLogs(!showLogs)}>
                  <Terminal size={13} /> {showLogs ? 'Ẩn log lượt chạy' : 'Xem log lượt chạy'}
                </button>
                {showLogs && <RunLogs runId={plan.latestRun.id} active={isActiveRun(plan.latestRun)} />}
              </div>
            )}
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Nhờ Claude lập kế hoạch</h3>
              <button className="hamburger-btn" onClick={() => setCreateOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên kế hoạch <span className="form-required">*</span></label>
                <input autoFocus className="form-input" placeholder="VD: Trang quên mật khẩu" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả việc cần làm <span className="form-required">*</span></label>
                <textarea
                  className="form-input"
                  rows={6}
                  style={{ resize: 'vertical' }}
                  placeholder="Càng cụ thể càng tốt: màn hình nào, hành vi mong muốn, ràng buộc…"
                  value={form.goal}
                  onChange={(e) => setForm({ ...form, goal: e.target.value })}
                  onPaste={(e) => { const images = imagesFromPaste(e); if (images.length) setAttachments([...attachments, ...images].slice(0, 10)); }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tài liệu & hình ảnh</label>
                <AttachmentPicker project={project} value={attachments} onChange={setAttachments} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Claude chỉ <b>đọc</b> code ở bước này, chưa sửa gì. Thư mục: <code>{project.workspacePath || 'chưa gắn'}</code>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Hủy</button>
              <button className="btn btn-primary" disabled={busy !== null || !form.title.trim() || !form.goal.trim()} onClick={createPlan}>
                <Plus size={14} /> {busy === 'create' ? 'Đang gửi...' : 'Gửi cho Claude'}
              </button>
            </div>
          </div>
        </div>
      )}

      {docsOpen && <ProjectDocsModal project={project} onClose={() => setDocsOpen(false)} onProjectChanged={onProjectChanged} />}

      {rejectOpen && plan && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Từ chối kế hoạch</h3>
              <button className="hamburger-btn" onClick={() => setRejectOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <label className="form-label">Góp ý để Claude lập lại kế hoạch</label>
              <textarea
                autoFocus
                className="form-input"
                rows={5}
                style={{ width: '100%', resize: 'vertical', marginTop: 6 }}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onPaste={(e) => { const images = imagesFromPaste(e); if (images.length) setRejectAttachments([...rejectAttachments, ...images].slice(0, 10)); }}
                placeholder="VD: Gộp mục 2 và 3, bỏ phần gửi email vì backend đã có…"
              />
              <div style={{ marginTop: 10 }}>
                <AttachmentPicker project={project} value={rejectAttachments} onChange={setRejectAttachments} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectOpen(false)}>Hủy</button>
              <button
                className="btn btn-primary"
                disabled={busy !== null || !feedback.trim()}
                onClick={() => run('reject', async () => {
                  try {
                    const files = await submitAttachments(project, rejectAttachments, plan.title);
                    await api.post(`/api/task-plans/${plan.id}/reject`, { feedback: feedback.trim(), ...(files.length ? { attachments: files } : {}) });
                    setRejectOpen(false);
                    setRejectAttachments([]);
                    await afterAction(plan.id);
                  } catch (err) {
                    alert(getErrorMessage(err, 'Từ chối kế hoạch thất bại'));
                  }
                })}
              >
                {busy === 'reject' ? 'Đang gửi...' : 'Gửi góp ý'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
