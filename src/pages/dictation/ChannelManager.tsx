import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CircleCheck, Loader2, LogIn, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { WORKER_COMMAND, channelAction, listChannels, saveYouTubeClient, type ChannelStatus, type ChannelsView, type FacebookChoice } from './lessonWorker';
import { formatWhen } from './schedule';

const POLL_MS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const shortError = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const Connected: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)', overflowWrap: 'anywhere' }}><CircleCheck size={16} style={{ flexShrink: 0 }} /> <span>{children}</span></p>
);

const Warning: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex gap-2 lg-meta" style={{ color: 'var(--warning, var(--text-main))', marginTop: 6 }}><AlertTriangle size={14} style={{ flexShrink: 0 }} /> <span>{children}</span></p>
);

const expiryWarning = (expiresAt: string | null) => {
  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - Date.now();
  if (left <= 0) return 'Token đã hết hạn, cần kết nối lại.';
  // A token that lasts months is worth a note; one that lasts hours is the usual mistake and needs its fix spelled out
  return left < 7 * DAY_MS
    ? `Token hết hạn lúc ${formatWhen(expiresAt)}. Bài đã hẹn giờ vẫn đăng, nhưng đăng mới sẽ lỗi. Đổi User token sang long-lived trong Access Token Debugger của Meta rồi dán lại để có Page token không hết hạn.`
    : `Token hết hạn lúc ${formatWhen(expiresAt)}.`;
};

const FacebookRow: React.FC<{ channel: ChannelStatus; onChange: () => Promise<void> }> = ({ channel, onChange }) => {
  const { busy, run } = useBusy();
  const { facebook, genre, label, scheduled } = channel;
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [pages, setPages] = useState<FacebookChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // The token stays in this form no longer than it takes to send it
  const close = () => {
    setEditing(false);
    setToken('');
    setPages(null);
    setError(null);
  };

  const send = (pageId?: string) => run('save', async () => {
    setError(null);
    try {
      const result = await channelAction(genre, 'facebook', { token: token.trim(), ...(pageId ? { pageId } : {}) });
      if (result.status === 'choose') return setPages(result.pages);
      close();
      await onChange();
    } catch (err) {
      setError(shortError(err, 'Không kết nối được page'));
    }
  });

  const check = () => run('check', async () => {
    setError(null);
    try {
      await channelAction(genre, 'facebook-check');
      await onChange();
    } catch (err) {
      setError(shortError(err, 'Không kiểm tra được token'));
    }
  });

  const askRemove = () => setConfirm({
    title: `Gỡ page khỏi thể loại ${label}?`,
    message: `Thể loại này sẽ không đăng Facebook được cho tới khi kết nối lại.${scheduled ? ` Còn ${scheduled} bài đã hẹn: Facebook vẫn tự đăng, nhưng trang sẽ không cập nhật được trạng thái.` : ''}`,
    confirmLabel: 'Gỡ page',
    action: async () => {
      setConfirm(null);
      try {
        await channelAction(genre, 'facebook-remove');
        await onChange();
      } catch (err) {
        setError(shortError(err, 'Không gỡ được page'));
      }
    }
  });

  const expiry = expiryWarning(facebook.expiresAt);
  return (
    <div className="lg-publish-row">
      <p className="lg-publish-name">Facebook</p>
      {error && <p className="lg-error">{error}</p>}
      {facebook.configured && facebook.name && <Connected>{facebook.name} (ID {facebook.pageId})</Connected>}
      {facebook.configured && !facebook.name && <p className="lg-meta" style={{ margin: 0 }}>Đã có token cho page ID {facebook.pageId}, chưa kiểm tra.</p>}
      {!facebook.configured && <p className="lg-meta" style={{ margin: 0 }}>Chưa kết nối page.</p>}
      {facebook.configured && expiry && <Warning>{expiry}</Warning>}
      {facebook.configured && facebook.checkedAt && !facebook.expiresAt && facebook.expiryKnown && <p className="lg-meta">Token không hết hạn.</p>}
      {facebook.configured && facebook.checkedAt && !facebook.expiryKnown && <p className="lg-meta">Facebook không cho đọc hạn của token này.</p>}
      {facebook.configured && facebook.missingScopes.length > 0 && <Warning>Token thiếu quyền {facebook.missingScopes.join(', ')}, đăng Reels có thể bị từ chối.</Warning>}

      {editing && (
        <div style={{ marginTop: 10 }}>
          {!pages && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Page token hoặc User token</label>
              <input type="password" autoFocus autoComplete="off" spellCheck={false} className="form-input" value={token} onChange={(e) => setToken(e.target.value)} />
              <p className="lg-meta">Lấy trong Graph API Explorer với các quyền pages_show_list, pages_read_engagement, pages_manage_posts. Token chỉ lưu trên máy này, không gửi lên VDEV.</p>
              {facebook.configured && <p className="lg-meta">Token mới sẽ thay cho page hiện tại.{scheduled ? ` Còn ${scheduled} bài đã hẹn: Facebook vẫn tự đăng, nhưng nếu đổi sang page khác thì trang không cập nhật được trạng thái của chúng.` : ''}</p>}
            </div>
          )}
          {pages && (
            <>
              <p className="form-label">Chọn page cho thể loại {label}</p>
              <div className="lg-recent">
                {pages.map((page) => (
                  <button key={page.id} type="button" className="lg-recent-item" disabled={!!busy || !!page.usedBy} onClick={() => send(page.id)}>
                    <span>{page.name}</span>
                    <span className="lg-meta" style={{ margin: 0 }}>{page.usedBy ? `Đang dùng cho ${page.usedBy}` : `ID ${page.id}`}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="lg-facebook-actions">
        {editing ? (
          <>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={close}>Hủy</button>
            {!pages && <button className="btn btn-primary btn-sm" disabled={!!busy || !token.trim()} onClick={() => send()}>{busy === 'save' ? <Loader2 size={14} className="spin" /> : null} Kiểm tra và lưu</button>}
          </>
        ) : (
          <>
            {facebook.configured && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={askRemove}><Trash2 size={14} /> Gỡ</button>}
            {facebook.configured && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={check}>{busy === 'check' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Kiểm tra</button>}
            <button className={`btn btn-sm ${facebook.configured ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setEditing(true)}>{facebook.configured ? 'Đổi token' : 'Kết nối page'}</button>
          </>
        )}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

const YouTubeRow: React.FC<{ channel: ChannelStatus; clientReady: boolean; onChange: () => Promise<void> }> = ({ channel, clientReady, onChange }) => {
  const { busy, run } = useBusy();
  const { youtube, genre, label, scheduled } = channel;
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const waiting = youtube.login?.status === 'WAITING';

  const login = () => run('login', async () => {
    setError(null);
    try {
      await channelAction(genre, 'youtube-login');
      await onChange();
    } catch (err) {
      setError(shortError(err, 'Không mở được đăng nhập YouTube'));
    }
  });

  const askRemove = () => setConfirm({
    title: `Gỡ kênh YouTube khỏi thể loại ${label}?`,
    message: `Thể loại này sẽ không đăng YouTube được cho tới khi đăng nhập lại.${scheduled ? ` Còn ${scheduled} bài đã hẹn: YouTube vẫn tự đăng, nhưng trang sẽ không cập nhật được trạng thái.` : ''}`,
    confirmLabel: 'Gỡ kênh',
    action: async () => {
      setConfirm(null);
      try {
        await channelAction(genre, 'youtube-remove');
        await onChange();
      } catch (err) {
        setError(shortError(err, 'Không gỡ được kênh'));
      }
    }
  });

  return (
    <div className="lg-publish-row">
      <p className="lg-publish-name">YouTube</p>
      {error && <p className="lg-error">{error}</p>}
      {youtube.login?.status === 'FAILED' && <p className="lg-error">{youtube.login.error}</p>}
      {waiting && <p className="flex align-center gap-2" style={{ margin: 0, fontSize: '0.85rem' }}><Loader2 size={16} className="spin" /> Đang chờ đăng nhập trong cửa sổ trình duyệt vừa mở. Nhớ chọn đúng kênh cho {label}.</p>}
      {!waiting && youtube.configured && (youtube.title ? <Connected>{youtube.title}</Connected> : <Connected>Đã đăng nhập, chưa rõ tên kênh. Đăng nhập lại để thấy tên kênh.</Connected>)}
      {!waiting && !youtube.configured && <p className="lg-meta" style={{ margin: 0 }}>{clientReady ? 'Chưa đăng nhập kênh.' : 'Cần lưu Google OAuth client ở trên trước.'}</p>}
      <div className="lg-facebook-actions">
        {youtube.configured && !waiting && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={askRemove}><Trash2 size={14} /> Gỡ</button>}
        <button className={`btn btn-sm ${youtube.configured ? 'btn-secondary' : 'btn-primary'}`} disabled={!!busy || waiting || !clientReady} onClick={login}><LogIn size={14} /> {youtube.configured ? 'Đăng nhập lại' : 'Đăng nhập YouTube'}</button>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

const GoogleClient: React.FC<{ ready: boolean; onChange: () => Promise<void> }> = ({ ready, onChange }) => {
  const { busy, run } = useBusy();
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEditing(false);
    setClientId('');
    setClientSecret('');
    setError(null);
  };

  const save = () => run('save', async () => {
    setError(null);
    try {
      await saveYouTubeClient(clientId.trim(), clientSecret.trim());
      close();
      await onChange();
    } catch (err) {
      setError(shortError(err, 'Không lưu được'));
    }
  });

  return (
    <div className="lg-facebook" style={{ marginBottom: 12 }}>
      <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Google OAuth client</p>
      {error && <p className="lg-error">{error}</p>}
      {ready && !editing && <Connected>Đã lưu, dùng chung cho mọi kênh YouTube.</Connected>}
      {!ready && !editing && <p className="lg-meta" style={{ margin: 0 }}>Tạo OAuth client loại Desktop app trong Google Cloud. Để màn hình đồng ý ở In production, vì ở Testing đăng nhập hết hạn sau 7 ngày.</p>}
      {editing && (
        <>
          <div className="form-group">
            <label className="form-label">Client ID</label>
            <input autoFocus autoComplete="off" spellCheck={false} className="form-input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Client secret</label>
            <input type="password" autoComplete="off" spellCheck={false} className="form-input" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
        </>
      )}
      <div className="lg-facebook-actions">
        {editing
          ? <>
              <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={close}>Hủy</button>
              <button className="btn btn-primary btn-sm" disabled={!!busy || !clientId.trim() || !clientSecret.trim()} onClick={save}>Lưu</button>
            </>
          : <button className={`btn btn-sm ${ready ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setEditing(true)}>{ready ? 'Đổi client' : 'Nhập client'}</button>}
      </div>
    </div>
  );
};

export const ChannelManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [view, setView] = useState<ChannelsView | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await listChannels());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const waiting = !!view?.channels.some((channel) => channel.youtube.login?.status === 'WAITING');
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  return (
    <div className="modal-overlay">
      <div className="modal-content lg-modal">
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Quản lý kênh</h3>
          <button className="hamburger-btn" title="Đóng" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {offline && (
            <>
              <p>Token được lưu qua công cụ trên máy này. Nếu chưa cài, mở Terminal và chạy:</p>
              <pre className="lg-command">{WORKER_COMMAND}</pre>
              <button className="btn btn-primary mt-4" onClick={load}><RotateCcw size={16} /> Kết nối lại</button>
            </>
          )}
          {!offline && !view && <div className="loading-container"><span className="spinner"></span></div>}
          {!offline && view && (
            <>
              <p className="lg-meta" style={{ marginTop: 0, marginBottom: 12 }}>Mỗi thể loại đăng lên một page và một kênh riêng. Token chỉ lưu ở <code>~/.vdev-video/env</code> trên máy này.</p>
              <GoogleClient ready={view.youtubeClient} onChange={load} />
              {view.channels.map((channel) => (
                <div key={channel.genre} className="lg-facebook" style={{ marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, margin: 0 }}>{channel.label}: {channel.series}</p>
                  <FacebookRow channel={channel} onChange={load} />
                  <YouTubeRow channel={channel} clientReady={view.youtubeClient} onChange={load} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
