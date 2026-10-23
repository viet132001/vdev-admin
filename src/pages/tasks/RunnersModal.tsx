import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../services/api';
import { X, Plus, Trash2, Copy, Check, Monitor } from 'lucide-react';
import { formatRelative, useBusy } from './agent';
import { DocsRootSection } from './ProjectDocs';

interface RunnersModalProps {
  onClose: () => void;
  onConfirm: (state: { title: string; message: string; confirmLabel?: string; action: () => Promise<void> }) => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const RunnersModal: React.FC<RunnersModalProps> = ({ onClose, onConfirm }) => {
  const [runners, setRunners] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, run } = useBusy();

  const load = useCallback(async () => {
    try {
      const list = await api.get('/api/agent/runners', { noCache: true });
      setRunners(Array.isArray(list) ? list : []);
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được danh sách máy chạy'));
      setRunners([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = () => run('create', async () => {
    try {
      const runner = await api.post('/api/agent/runners', { name: name.trim() || undefined });
      setCreated(runner);
      setName('');
      await load();
    } catch (err) {
      alert(getErrorMessage(err, 'Tạo máy chạy thất bại'));
    }
  });

  const config = created ? JSON.stringify({ apiUrl: API_URL, runnerToken: created.token }, null, 2) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert('Không copy được — hãy chọn và copy thủ công.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Claude trên máy này</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-4">
          <DocsRootSection />

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Máy chạy (<code>vdev-agent</code>) là tiến trình nền trên máy có thư mục code. Nó nhận việc từ server và chạy Claude trong thư mục của project.
          </p>

          {created && (
            <div style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: 14 }} className="flex flex-col gap-2">
              <b style={{ fontSize: '0.875rem' }}>Đã tạo “{created.name}” — token chỉ hiện một lần</b>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lưu nội dung dưới đây vào <code>~/.vdev-agent/config.json</code> trên máy chạy:</span>
              <pre className="tw-code-block">{config}</pre>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? <><Check size={13} /> Đã copy</> : <><Copy size={13} /> Copy</>}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCreated(null)}>Đã lưu, ẩn token</button>
              </div>
            </div>
          )}

          <div className="flex flex-col" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            {runners === null && <div className="loading-container" style={{ padding: 16 }}><span className="spinner"></span></div>}
            {runners?.length === 0 && <div style={{ padding: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có máy chạy nào.</div>}
            {runners?.map((r) => (
              <div key={r.id} className="flex align-center gap-2" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                <Monitor size={16} style={{ color: 'var(--text-muted)' }} />
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {r.version ? `v${r.version} · ` : ''}{r.lastSeenAt ? `Kết nối ${formatRelative(r.lastSeenAt)}` : 'Chưa kết nối lần nào'}
                  </div>
                </div>
                <span className="badge" style={{ color: r.online ? 'var(--success)' : 'var(--text-muted)' }}>
                  <span className="tw-column-dot" style={{ width: 6, height: 6, backgroundColor: r.online ? 'var(--success)' : 'var(--border-strong)' }} />
                  {r.online ? 'Online' : 'Offline'}
                </span>
                <button
                  className="icon-btn danger"
                  title="Thu hồi token"
                  onClick={() => onConfirm({
                    title: 'Thu hồi máy chạy',
                    message: `Máy “${r.name}” sẽ không nhận được việc nữa. Lượt chạy đang dở sẽ bị đánh lỗi.`,
                    confirmLabel: 'Thu hồi',
                    action: async () => {
                      try {
                        await api.delete(`/api/agent/runners/${r.id}`);
                        await load();
                      } catch (err) {
                        alert(getErrorMessage(err, 'Thu hồi thất bại'));
                      }
                    }
                  })}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input className="form-input" style={{ flexGrow: 1 }} placeholder="Tên máy, ví dụ: MacBook ở nhà" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            <button className="btn btn-primary" disabled={busy !== null} onClick={create}><Plus size={14} /> {busy === 'create' ? 'Đang tạo...' : 'Tạo máy chạy'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
