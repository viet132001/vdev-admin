import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>VDEV</span>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 600, letterSpacing: '-0.03em' }}>Workspace cá nhân</h1>
          <p style={{ color: '#a1a1aa', marginTop: 8, maxWidth: 360 }}>Quản lý công việc và luyện chính tả tiếng Anh ở cùng một nơi.</p>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>© {new Date().getFullYear()} VDEV</span>
      </aside>

      <main className="auth-main">
        <div className="auth-form">
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Đăng nhập</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 4 }}>Nhập email và mật khẩu để tiếp tục.</p>
          </div>

          {error && (
            <div className="alert-banner alert-banner-danger">
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="form-group">
              <label className="form-label">Email</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="name@vdev.local"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Mật khẩu</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px' }}
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Đăng nhập'}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Chưa có tài khoản? </span>
            <Link to="/register" style={{ fontWeight: '600' }}>Đăng ký ngay</Link>
          </div>
        </div>
      </main>
    </div>
  );
};
