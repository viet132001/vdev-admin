import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  Wallet, 
  GraduationCap, 
  LogOut, 
  User as UserIcon
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
    { path: '/notes', label: 'Ghi chú (Notes)', icon: FileText },
    { path: '/finance', label: 'Tài chính (Finance)', icon: Wallet },
    { path: '/learning', label: 'Khóa học (Learning)', icon: GraduationCap },
  ];

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="flex align-center gap-2 mb-4" style={{ padding: '0 8px' }}>
          <div style={{
            backgroundColor: 'var(--primary)',
            color: 'white',
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.25rem'
          }}>
            V
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>VDEV Admin</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Workspace Portal</span>
          </div>
        </div>

        <nav className="flex flex-col gap-2" style={{ flexGrow: 1, marginTop: '24px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex align-center gap-2"
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--primary)' : 'var(--text-main)',
                  backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                  border: isActive ? '1px solid var(--primary)' : '1px solid transparent'
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: 'auto' }}>
            <div className="flex align-center gap-2" style={{ padding: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)'
              }}>
                <UserIcon size={16} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.fullName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.email}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', border: 'none', backgroundColor: 'transparent' }}
            >
              <LogOut size={16} />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};
