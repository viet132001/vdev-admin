import React, { useCallback, useEffect, useState } from 'react';
import { History, KeyRound, Pencil, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { API_BASE_URL, api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, formatDate, type ConfirmState } from '../tasks/shared';
import { CopyBlock } from './McpConnectModal';

// Webhook + integration tokens for other platforms (contract: src/doc/webhooks-api.md, sections 4 and 5b).
// Backend support is pending: while the endpoints are missing the cards show the load error instead of breaking the tab.

const WEBHOOK_EVENTS = [
  { value: 'task.created', label: 'Task được tạo' },
  { value: 'task.updated', label: 'Task được sửa' },
  { value: 'task.status_changed', label: 'Đổi trạng thái' },
  { value: 'task.assigned', label: 'Đổi người làm' },
  { value: 'task.deleted', label: 'Task bị xoá' },
  { value: 'comment.created', label: 'Bình luận mới' },
  { value: 'comment.deleted', label: 'Xoá bình luận' },
  { value: 'doc.saved', label: 'Tài liệu được lưu' },
  { value: 'milestone.saved', label: 'Milestone thay đổi' },
  { value: 'member.joined', label: 'Thành viên mới' }
];

const TOKEN_SCOPES = [
  { value: 'events:read', label: 'Đọc luồng sự kiện' },
  { value: 'tasks:read', label: 'Đọc task' },
  { value: 'tasks:update', label: 'Cập nhật task (không tạo, không xoá)' },
  { value: 'comments:write', label: 'Thêm bình luận' }
];

const shortUrl = (url: string) => (url.length > 56 ? `${url.slice(0, 40)}…${url.slice(-12)}` : url);

const VERIFY_EXAMPLE = `// npm i standardwebhooks
import { Webhook } from 'standardwebhooks';

const wh = new Webhook(process.env.VDEV_WEBHOOK_SECRET); // whsec_...
app.post('/vdev', express.raw({ type: 'application/json' }), (req, res) => {
  const event = wh.verify(req.body, req.headers); // ném lỗi nếu sai chữ ký / quá 5 phút
  res.sendStatus(200);                            // trả 2xx trong 10 giây, xử lý nền
  // dùng header webhook-id để bỏ qua sự kiện đã nhận
});`;

const SecretReveal: React.FC<{ title: string; secret: string; hint: string; onClose: () => void }> = ({ title, secret, hint, onClose }) => (
  <div className="modal-overlay">
    <div className="modal-content" style={{ maxWidth: 560 }}>
      <div className="modal-header">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="modal-body flex flex-col gap-3" style={{ fontSize: '0.88rem' }}>
        <div className="alert-banner alert-banner-success">Chỉ hiện một lần, hãy lưu lại ngay. Mất thì tạo / xoay mới.</div>
        <CopyBlock text={secret} />
        <span style={{ color: 'var(--text-muted)' }}>{hint}</span>
      </div>
      <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Đã lưu</button></div>
    </div>
  </div>
);

const DeliveriesModal: React.FC<{ projectId: string; hook: any; onClose: () => void }> = ({ projectId, hook, onClose }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const { busy, run } = useBusy();
  const base = `/api/team-projects/${projectId}/webhooks/${hook.id}`;
  const load = useCallback(async () => {
    try { setRows(await api.get(`${base}/deliveries`, { noCache: true })); }
    catch (err) { setRows([]); alert(getErrorMessage(err, 'Không tải được lịch sử gửi')); }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Lịch sử gửi</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ fontSize: '0.82rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{hook.url}</div>
          {rows === null && <div className="loading-container"><span className="spinner" /> Đang tải...</div>}
          {rows?.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Chưa có lần gửi nào.</span>}
          {rows?.map((d) => (
            <div key={d.id} className="pj-row">
              <span className={`badge ${d.status === 'OK' ? 'badge-success' : d.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>
                {d.status === 'OK' ? 'Thành công' : d.status === 'FAILED' ? 'Lỗi' : 'Đang chờ'}
              </span>
              <code className="tw-inline-code">{d.eventType || d.eventId}</code>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)' }}>
                {[d.httpStatus && `HTTP ${d.httpStatus}`, d.durationMs != null && `${d.durationMs}ms`, `lần ${d.attempt}`, d.error,
                  d.nextAttemptAt && d.status !== 'OK' && `thử lại ${formatDate(d.nextAttemptAt)}`].filter(Boolean).join(' · ')}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{formatDate(d.createdAt)}</span>
              {d.status === 'FAILED' && (
                <button className="btn btn-secondary btn-sm" disabled={busy === d.id} onClick={() => run(d.id, async () => {
                  try { await api.post(`${base}/deliveries/${d.id}/redeliver`, {}); load(); }
                  catch (err) { alert(getErrorMessage(err, 'Không gửi lại được')); }
                })}>Gửi lại</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const WebhookForm: React.FC<{ project: any; hook?: any; onClose: () => void; onSaved: (created?: any) => void }> = ({ project, hook, onClose, onSaved }) => {
  const [url, setUrl] = useState(hook?.url || '');
  const [events, setEvents] = useState<string[]>(hook?.events || []);
  const [sourceId, setSourceId] = useState(hook?.sourceId || '');
  const [lean, setLean] = useState(!!hook?.lean);
  const { busy, run } = useBusy();
  const toggle = (v: string) => setEvents((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const body = { url: url.trim(), events, sourceId: sourceId || null, lean };
      try {
        if (hook) { await api.patch(`/api/team-projects/${project.id}/webhooks/${hook.id}`, body); onSaved(); }
        else onSaved(await api.post(`/api/team-projects/${project.id}/webhooks`, body));
      } catch (err) {
        alert(getErrorMessage(err, 'Không lưu được webhook'));
      }
    });
  };
  return (
    <div className="modal-overlay">
      <form className="modal-content" style={{ maxWidth: 560 }} onSubmit={submit}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{hook ? 'Sửa webhook' : 'Thêm webhook'}</h3>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-3">
          <div className="form-group">
            <label className="form-label">URL nhận (https) <span className="form-required">*</span></label>
            <input className="form-input" required type="url" pattern="https://.*" placeholder="https://example.com/hooks/vdev" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sự kiện (không chọn = tất cả)</label>
            <div className="flex" style={{ flexWrap: 'wrap', gap: '6px 16px' }}>
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev.value} style={{ display: 'flex', gap: 6, fontSize: '0.85rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={events.includes(ev.value)} onChange={() => toggle(ev.value)} /> {ev.label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Chỉ source</label>
            <select className="form-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Tất cả source</option>
              {project.sources.map((s: any) => <option key={s.id} value={s.id}>{s.key} — {s.name}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: 6, fontSize: '0.85rem', alignItems: 'center' }}>
            <input type="checkbox" checked={lean} onChange={(e) => setLean(e.target.checked)} />
            Bản gọn: không gửi mô tả task và email thành viên, bên nhận gọi lại API khi cần
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={!!busy}>Lưu</button>
        </div>
      </form>
    </div>
  );
};

const WebhooksCard: React.FC<{ project: any }> = ({ project }) => {
  const [hooks, setHooks] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const { busy, run } = useBusy();
  const base = `/api/team-projects/${project.id}/webhooks`;

  const load = useCallback(async () => {
    try { setHooks(await api.get(base, { noCache: true })); setLoadError(''); }
    catch (err) { setHooks([]); setLoadError(getErrorMessage(err, 'Không tải được webhook')); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const act = (key: string, fn: () => Promise<void>, fallback: string) =>
    run(key, async () => { try { await fn(); } catch (err) { alert(getErrorMessage(err, fallback)); } });

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex align-center justify-between">
        <b>Webhook ({hooks?.length ?? 0})</b>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowVerify((v) => !v)}>Cách xác minh chữ ký</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setForm({})}><Plus size={14} /> Thêm webhook</button>
        </div>
      </div>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        VDEV gửi POST có chữ ký (chuẩn Standard Webhooks) tới URL của bạn mỗi khi task trong dự án thay đổi, kể cả thay đổi do Claude qua MCP.
      </span>
      {showVerify && <CopyBlock text={VERIFY_EXAMPLE} />}
      {loadError && <div className="alert-banner">{loadError}</div>}
      {hooks === null && <div className="loading-container"><span className="spinner" /> Đang tải...</div>}
      {hooks?.length === 0 && !loadError && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có webhook.</span>}
      {hooks?.map((h) => (
        <div key={h.id} className="pj-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.url}>{shortUrl(h.url)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {h.events?.length ? `${h.events.length} sự kiện` : 'Tất cả sự kiện'}
              {h.lastDelivery && ` · gần nhất ${h.lastDelivery.status === 'OK' ? 'thành công' : 'lỗi'} ${formatDate(h.lastDelivery.createdAt)}`}
              {h.failureCount > 0 && ` · ${h.failureCount} lỗi liên tiếp`}
            </div>
          </div>
          {h.disabledAt
            ? <span className="badge badge-danger" title="Tắt vì lỗi liên tục">Đã tắt</span>
            : <span className={`badge ${h.active ? 'badge-success' : ''}`}>{h.active ? 'Hoạt động' : 'Tạm dừng'}</span>}
          <button className="icon-btn" title="Gửi thử (ping)" disabled={busy === `t${h.id}`} onClick={() => act(`t${h.id}`, async () => {
            const r = await api.post(`${base}/${h.id}/test`, {});
            alert(r?.ok === false ? `Bên nhận trả lỗi${r.httpStatus ? ` HTTP ${r.httpStatus}` : ''}${r.error ? `: ${r.error}` : ''}` : 'Đã gửi ping, bên nhận phản hồi thành công.');
            load();
          }, 'Không gửi thử được')}><Send size={14} /></button>
          <button className="icon-btn" title="Lịch sử gửi" onClick={() => setHistory(h)}><History size={14} /></button>
          <button className="icon-btn" title="Xoay secret" onClick={() => setConfirm({
            title: 'Xoay secret?', message: 'Secret cũ vẫn hợp lệ thêm 24 giờ để bên nhận kịp đổi.', confirmLabel: 'Xoay',
            action: () => act(`r${h.id}`, async () => {
              const r = await api.post(`${base}/${h.id}/rotate-secret`, {});
              setSecret({ title: 'Secret mới', value: r.secret });
            }, 'Không xoay được secret')
          })}><RefreshCw size={14} /></button>
          <button className="btn btn-secondary btn-sm" disabled={busy === `a${h.id}`} onClick={() => act(`a${h.id}`, async () => {
            await api.patch(`${base}/${h.id}`, { active: h.disabledAt ? true : !h.active });
            load();
          }, 'Không cập nhật được')}>{h.disabledAt ? 'Bật lại' : h.active ? 'Tạm dừng' : 'Bật'}</button>
          <button className="icon-btn" title="Sửa" onClick={() => setForm(h)}><Pencil size={14} /></button>
          <button className="icon-btn danger" title="Xoá" onClick={() => setConfirm({
            title: 'Xoá webhook?', message: `Ngừng gửi sự kiện tới ${h.url}.`, confirmLabel: 'Xoá',
            action: () => act(`d${h.id}`, async () => { await api.delete(`${base}/${h.id}`); load(); }, 'Không xoá được webhook')
          })}><Trash2 size={14} /></button>
        </div>
      ))}

      {form && (
        <WebhookForm project={project} hook={form.id ? form : undefined} onClose={() => setForm(null)}
          onSaved={(created) => {
            setForm(null); load();
            if (created?.secret) setSecret({ title: 'Webhook đã tạo', value: created.secret });
          }} />
      )}
      {secret && (
        <SecretReveal title={secret.title} secret={secret.value} onClose={() => setSecret(null)}
          hint="Bên nhận dùng secret này để xác minh header webhook-signature (xem 'Cách xác minh chữ ký')." />
      )}
      {history && <DeliveriesModal projectId={project.id} hook={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

const TokensCard: React.FC<{ project: any }> = ({ project }) => {
  const [tokens, setTokens] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['events:read', 'tasks:read', 'tasks:update']);
  const [days, setDays] = useState('90');
  const [created, setCreated] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { busy, run } = useBusy();
  const base = `/api/team-projects/${project.id}/integration-tokens`;

  const load = useCallback(async () => {
    try { setTokens(await api.get(base, { noCache: true })); setLoadError(''); }
    catch (err) { setTokens([]); setLoadError(getErrorMessage(err, 'Không tải được token tích hợp')); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        const r = await api.post(base, { name: name.trim(), scopes, expiresInDays: days ? Number(days) : undefined });
        setCreated(r.token); setName(''); load();
      } catch (err) {
        alert(getErrorMessage(err, 'Không tạo được token'));
      }
    });
  };
  const toggle = (v: string) => setScopes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const apiUrl = `${API_BASE_URL.replace(/\/+$/, '')}/api/integrations/v1`;

  return (
    <div className="card flex flex-col gap-2">
      <b>Token tích hợp ({tokens?.length ?? 0})</b>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Cho nền tảng khác kéo và cập nhật task của dự án này qua <code className="tw-inline-code">{apiUrl}</code> (header <code className="tw-inline-code">Authorization: Bearer vdi_…</code>).
        Chỉ đọc và sửa task, không tạo hay xoá; không đặt được Done.
      </span>
      {loadError && <div className="alert-banner">{loadError}</div>}
      <form className="flex flex-col gap-2" onSubmit={create}>
        <div className="pj-form-row">
          <input className="form-input" style={{ flex: 1 }} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nền tảng (vd. n8n, Slack bot)" />
          <select className="form-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">30 ngày</option>
            <option value="90">90 ngày</option>
            <option value="365">1 năm</option>
            <option value="">Không hết hạn</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy === 'create' || scopes.length === 0}><KeyRound size={14} /> Tạo token</button>
        </div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: '6px 16px' }}>
          {TOKEN_SCOPES.map((s) => (
            <label key={s.value} style={{ display: 'flex', gap: 6, fontSize: '0.85rem', alignItems: 'center' }}>
              <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggle(s.value)} /> {s.label}
            </label>
          ))}
        </div>
      </form>
      {tokens?.map((t) => (
        <div key={t.id} className="pj-row">
          <code className="tw-inline-code">{t.prefix}…</code>
          <span style={{ flex: 1, minWidth: 0 }}>
            {t.name}
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(t.scopes || []).join(', ')}</span>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {t.lastUsedAt ? `dùng ${formatDate(t.lastUsedAt)}` : 'chưa dùng'} · {t.expiresAt ? `hết hạn ${formatDate(t.expiresAt)}` : 'không hết hạn'}
          </span>
          <button className="icon-btn danger" title="Thu hồi" onClick={() => setConfirm({
            title: `Thu hồi token "${t.name}"?`, message: 'Nền tảng dùng token này sẽ bị chặn ngay.', confirmLabel: 'Thu hồi',
            action: async () => {
              try { await api.delete(`${base}/${t.id}`); load(); }
              catch (err) { alert(getErrorMessage(err, 'Không thu hồi được')); }
            }
          })}><Trash2 size={14} /></button>
        </div>
      ))}
      {created && (
        <SecretReveal title="Token tích hợp đã tạo" secret={created} onClose={() => setCreated(null)}
          hint="Nền tảng gửi kèm header Authorization: Bearer <token>. Dùng /events?after= để kéo sự kiện bù khi lỡ webhook." />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

// Settings-tab section, MANAGER only (the caller already hides the tab below that role)
export const IntegrationSettings: React.FC<{ project: any }> = ({ project }) => (
  <>
    <WebhooksCard project={project} />
    <TokensCard project={project} />
  </>
);
