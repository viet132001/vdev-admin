import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { GoogleLoginButton } from '../components/GoogleLoginButton';
import { setAfterLogin } from '../services/afterLogin';
import { roleLabel } from './projects/shared';

const STATE_TEXT: Record<string, string> = {
  ACCEPTED: 'Lời mời này đã được dùng.',
  REVOKED: 'Lời mời đã bị thu hồi.',
  EXPIRED: 'Lời mời đã hết hạn, hãy nhờ người mời gửi lại.'
};

// Public landing page of the invite email: works logged out (sign in, then come back here)
export const Invite: React.FC = () => {
  const { token = '' } = useParams();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.get(`/api/team-invites/token/${encodeURIComponent(token)}`, { noCache: true })
      .then(setInvite)
      .catch((err) => setError(getErrorMessage(err, 'Link mời không hợp lệ')));
  }, [token]);

  // Return here after Google / password login
  useEffect(() => {
    if (!loading && !user) setAfterLogin(`/invite/${token}`);
  }, [loading, user, token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const result = await api.post(`/api/team-invites/token/${encodeURIComponent(token)}/accept`, {});
      navigate(`/projects?project=${result.project.key}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Không tham gia được dự án'));
      setAccepting(false);
    }
  };

  const wrongAccount = user && invite && user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>VDEV</span>
      </aside>
      <main className="auth-main">
        <div className="auth-form flex flex-col gap-3">
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Lời mời tham gia dự án</h1>
          {!invite && !error && <div className="loading-container"><span className="spinner" /> Đang kiểm tra link...</div>}
          {error && <div className="alert-banner alert-banner-danger">{error}</div>}
          {invite && (
            <>
              <div className="card flex flex-col gap-1">
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{invite.invitedBy ? `${invite.invitedBy} mời bạn vào` : 'Bạn được mời vào'}</span>
                <b style={{ fontSize: '1.1rem' }}>{invite.project.name} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({invite.project.key})</span></b>
                <span style={{ fontSize: '0.85rem' }}>Vai trò: {roleLabel(invite.role)} · dành cho <b>{invite.email}</b></span>
              </div>
              {invite.state !== 'PENDING' ? (
                <div className="alert-banner">{STATE_TEXT[invite.state]}</div>
              ) : loading ? null : !user ? (
                <>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Đăng nhập bằng tài khoản Google <b>{invite.email}</b> để tham gia.</span>
                  <GoogleLoginButton />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>hoặc <Link to="/login">đăng nhập bằng mật khẩu</Link></span>
                </>
              ) : wrongAccount ? (
                <>
                  <div className="alert-banner alert-banner-danger">Bạn đang đăng nhập bằng {user.email}. Lời mời này chỉ dành cho {invite.email}.</div>
                  <button className="btn btn-secondary" onClick={() => { logout(); setAfterLogin(`/invite/${token}`); }}>Đăng xuất để đổi tài khoản</button>
                </>
              ) : (
                <button className="btn btn-primary" disabled={accepting} onClick={accept}>{accepting ? 'Đang tham gia...' : 'Tham gia dự án'}</button>
              )}
              {user && invite.state === 'ACCEPTED' && <Link to="/projects" className="btn btn-secondary">Mở danh sách dự án</Link>}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
