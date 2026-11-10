import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Clock3, FolderKanban, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { GoogleLoginButton } from '../components/GoogleLoginButton';
import { setAfterLogin } from '../services/afterLogin';
import { roleLabel } from './projects/shared';
import { formatDate } from './tasks/shared';
import { ThemeToggleButton } from '../components/ThemeToggle';

const STATE_TEXT: Record<string, { title: string; message: string }> = {
  ACCEPTED: { title: 'Lời mời đã được dùng', message: 'Tài khoản được mời đã tham gia dự án này.' },
  REVOKED: { title: 'Lời mời đã bị thu hồi', message: 'Người mời đã huỷ link này. Nhờ họ gửi lời mời mới nếu bạn vẫn cần tham gia.' },
  EXPIRED: { title: 'Lời mời đã hết hạn', message: 'Link chỉ dùng được trong 7 ngày. Nhờ người mời bấm "Gửi lại" để có link mới.' }
};

const Brand: React.FC = () => (
  <span className="flex align-center gap-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
    <FolderKanban size={18} /> VDEV
  </span>
);

// Status block with an icon: used for invalid / used / revoked / expired links
const Notice: React.FC<{ tone?: 'danger' | 'muted'; title: string; message: string }> = ({ tone = 'muted', title, message }) => (
  <div className="invite-notice">
    <CircleAlert size={18} style={{ color: tone === 'danger' ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
    <div className="flex flex-col gap-1">
      <b style={{ fontSize: '0.9rem' }}>{title}</b>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{message}</span>
    </div>
  </div>
);

// Public landing page of the invite email: works logged out (sign in, then come back here)
export const Invite: React.FC = () => {
  const { token = '' } = useParams();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [acceptError, setAcceptError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.get(`/api/team-invites/token/${encodeURIComponent(token)}`, { noCache: true })
      .then(setInvite)
      .catch((err) => setError(getErrorMessage(err, 'Link mời không hợp lệ hoặc đã bị xoá.')));
  }, [token]);

  // Return here after Google / password login
  useEffect(() => {
    if (!loading && !user) setAfterLogin(`/invite/${token}`);
  }, [loading, user, token]);

  const accept = async () => {
    setAccepting(true);
    setAcceptError('');
    try {
      const result = await api.post(`/api/team-invites/token/${encodeURIComponent(token)}/accept`, {});
      navigate(`/projects?project=${result.project.key}`, { replace: true });
    } catch (err) {
      setAcceptError(getErrorMessage(err, 'Không tham gia được dự án'));
      setAccepting(false);
    }
  };

  const wrongAccount = user && invite && user.email.toLowerCase() !== invite.email.toLowerCase();

  const renderAction = () => {
    if (invite.state !== 'PENDING') {
      const s = STATE_TEXT[invite.state] || { title: 'Lời mời không còn hiệu lực', message: '' };
      return (
        <>
          <Notice title={s.title} message={s.message} />
          {user && <Link to="/projects" className="btn btn-secondary invite-btn">Mở danh sách dự án</Link>}
        </>
      );
    }
    if (loading) return <div className="loading-container"><span className="spinner" /></div>;
    if (!user) {
      return (
        <>
          <p className="invite-hint">Đăng nhập bằng tài khoản Google <b>{invite.email}</b> để tham gia.</p>
          <GoogleLoginButton />
          <div className="auth-divider" style={{ margin: '4px 0' }}>hoặc</div>
          <Link to={`/login?email=${encodeURIComponent(invite.email)}`} className="btn btn-ghost invite-btn">Đăng nhập bằng email và mật khẩu</Link>
        </>
      );
    }
    if (wrongAccount) {
      return (
        <>
          <Notice
            tone="danger"
            title="Sai tài khoản"
            message={`Bạn đang đăng nhập bằng ${user.email}, còn lời mời này dành cho ${invite.email}.`}
          />
          <button className="btn btn-secondary invite-btn" onClick={() => { logout(); setAfterLogin(`/invite/${token}`); }}>
            <LogOut size={16} /> Đăng xuất để đổi tài khoản
          </button>
        </>
      );
    }
    return (
      <>
        <div className="invite-account">
          <span className="invite-avatar">{(user.fullName || user.email || '?').charAt(0).toUpperCase()}</span>
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Đang đăng nhập</span>
            <span className="invite-ellipsis" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{user.email}</span>
          </div>
          <CircleCheck size={16} style={{ color: 'var(--success)', marginLeft: 'auto', flexShrink: 0 }} />
        </div>
        {acceptError && <Notice tone="danger" title="Không tham gia được" message={acceptError} />}
        <button className="btn btn-primary invite-btn" disabled={accepting} onClick={accept}>
          {accepting ? 'Đang tham gia...' : 'Tham gia dự án'}
        </button>
      </>
    );
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Brand />
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 600, letterSpacing: '-0.03em' }}>Dự án nhóm</h1>
          <p style={{ color: '#a1a1aa', marginTop: 8, maxWidth: 360 }}>
            Cùng theo dõi task, kế hoạch và tài liệu của dự án với các thành viên khác.
          </p>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>© {new Date().getFullYear()} VDEV</span>
      </aside>

      <main className="auth-main">
        <ThemeToggleButton className="auth-theme-toggle" />
        <div className="auth-form flex flex-col gap-4">
          <div className="auth-mobile-brand"><Brand /></div>

          {!invite && !error && (
            <div className="loading-container"><span className="spinner" /> Đang kiểm tra link mời...</div>
          )}

          {error && (
            <>
              <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Link mời không dùng được</h2>
              <Notice tone="danger" title="Không mở được lời mời" message={error} />
              <Link to="/" className="btn btn-secondary invite-btn">Về trang chủ</Link>
            </>
          )}

          {invite && (
            <>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {invite.invitedBy ? `${invite.invitedBy} mời bạn tham gia` : 'Bạn được mời tham gia'}
                </span>
                <h2 style={{ fontSize: '1.4rem', margin: '4px 0 0', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {invite.project.name} <span className="badge" style={{ verticalAlign: 'middle' }}>{invite.project.key}</span>
                </h2>
              </div>

              <dl className="invite-meta">
                {invite.invitedBy && (
                  <div><dt><UserRound size={14} /> Người mời</dt><dd>{invite.invitedBy}</dd></div>
                )}
                <div><dt><ShieldCheck size={14} /> Vai trò</dt><dd>{roleLabel(invite.role)}</dd></div>
                <div><dt><Mail size={14} /> Dành cho</dt><dd className="invite-ellipsis">{invite.email}</dd></div>
                {invite.expiresAt && (
                  <div>
                    <dt><Clock3 size={14} /> Hết hạn</dt>
                    <dd style={invite.state === 'EXPIRED' ? { color: 'var(--danger)' } : undefined}>{formatDate(invite.expiresAt)}</dd>
                  </div>
                )}
              </dl>

              <div className="flex flex-col gap-3">{renderAction()}</div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
