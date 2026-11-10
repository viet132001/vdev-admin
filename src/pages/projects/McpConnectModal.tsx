import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2, X } from 'lucide-react';
import { API_BASE_URL, api, getErrorMessage } from '../../services/api';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, formatDate, type ConfirmState } from '../tasks/shared';
import { copyText } from './shared';

const MCP_URL = `${API_BASE_URL.replace(/\/+$/, '')}/api/mcp`;

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <div className="pj-copy-block">
      <pre className="tw-code-block" style={{ margin: 0, maxHeight: 'none' }}>{text}</pre>
      <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
        <Copy size={14} /> {done ? 'Đã copy' : 'Copy'}
      </button>
    </div>
  );
};

// Personal tokens for the remote MCP endpoint: each member plugs VDEV into their own Claude Code
export const McpConnectModal: React.FC<{ onClose: () => void; projectKey?: string }> = ({ onClose, projectKey }) => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [name, setName] = useState('Claude Code');
  const [days, setDays] = useState('90');
  const [created, setCreated] = useState<any>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { busy, run } = useBusy();

  const load = useCallback(async () => {
    try {
      setTokens(await api.get('/api/access-tokens', { noCache: true }));
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được token'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run('create', async () => {
      try {
        setCreated(await api.post('/api/access-tokens', { name: name.trim(), expiresInDays: days ? Number(days) : undefined }));
        load();
      } catch (err) {
        alert(getErrorMessage(err, 'Không tạo được token'));
      }
    });
  };

  const token = created?.token || 'vdp_...';
  const cli = `claude mcp add --transport http vdev ${MCP_URL} --header "Authorization: Bearer ${token}"`;
  const json = JSON.stringify({ mcpServers: { vdev: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  const example = projectKey
    ? `Xem tổng quan dự án ${projectKey}: BE / AD / APP đang làm gì, ai làm, trễ hạn ra sao`
    : 'Liệt kê dự án của tôi và các task đang giao cho tôi';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Kết nối MCP với Claude Code</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-4" style={{ fontSize: '0.88rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Claude Code trên máy bạn sẽ đọc task, tài liệu và cập nhật trạng thái trực tiếp, chỉ trong các dự án bạn được mời.
            Claude chuyển task tới <b>Chờ review</b>, còn Done do người duyệt bấm trên web.
          </span>

          <form className="flex flex-col gap-2" onSubmit={create}>
            <b>1. Tạo token cá nhân</b>
            <div className="pj-form-row">
              <input className="form-input" style={{ flex: 1 }} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên máy / công cụ" />
              <select className="form-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">30 ngày</option>
                <option value="90">90 ngày</option>
                <option value="365">1 năm</option>
                <option value="">Không hết hạn</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={busy === 'create'}><KeyRound size={14} /> Tạo token</button>
            </div>
            {created && <div className="alert-banner alert-banner-success">Token chỉ hiện một lần, hãy chạy lệnh bên dưới ngay. Mất token thì tạo token mới.</div>}
          </form>

          <div className="flex flex-col gap-2">
            <b>2. Thêm vào Claude Code</b>
            <CopyBlock text={cli} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Thêm <code className="tw-inline-code">--scope user</code> để dùng ở mọi thư mục. Client khác (Cursor, Claude Desktop, file <code className="tw-inline-code">.mcp.json</code>):</span>
            <CopyBlock text={json} />
          </div>

          <div className="flex flex-col gap-1">
            <b>3. Dùng thử</b>
            <span>Trong Claude Code: <i>"{example}"</i>, <i>"làm task {projectKey || 'NEXQ'}-12"</i>, <i>"tạo task cho BE và APP từ đặc tả này, giao cho ..."</i>.</span>
          </div>

          <div className="flex flex-col gap-1">
            <b>Token đang hoạt động ({tokens.length})</b>
            {tokens.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Chưa có token.</span>}
            {tokens.map((t) => (
              <div key={t.id} className="pj-row">
                <code className="tw-inline-code">{t.prefix}…</code>
                <span style={{ flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {t.lastUsedAt ? `dùng ${formatDate(t.lastUsedAt)}` : 'chưa dùng'} · {t.expiresAt ? `hết hạn ${formatDate(t.expiresAt)}` : 'không hết hạn'}
                </span>
                <button className="icon-btn danger" title="Thu hồi" onClick={() => setConfirm({
                  title: `Thu hồi token "${t.name}"?`, message: 'Claude Code dùng token này sẽ mất kết nối ngay.', confirmLabel: 'Thu hồi',
                  action: async () => {
                    try { await api.delete(`/api/access-tokens/${t.id}`); if (created?.id === t.id) setCreated(null); load(); }
                    catch (err) { alert(getErrorMessage(err, 'Không thu hồi được')); }
                  }
                })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
