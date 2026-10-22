import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LogOut, 
  User as UserIcon,
  Menu,
  X,
  CheckSquare,
  Headphones
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    // Tổng quan, Tài chính, Khoản nợ, Khóa học are temporarily hidden
    { path: '/tasks', label: 'Công việc (Tasks)', icon: CheckSquare },
    { path: '/dictation', label: 'Luyện chính tả (EN)', icon: Headphones },
  ];

  return (
    <div className="layout-container">
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <button 
          className="hamburger-btn" 
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open Sidebar"
        >
          <Menu size={24} />
        </button>
        <div className="flex align-center gap-2">
          <div style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-fg)',
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '0.9rem'
          }}>
            V
          </div>
          <h2 style={{ fontSize: '0.95rem', margin: 0 }}>VDEV Admin</h2>
        </div>
        <div style={{ width: 40 }}></div> {/* spacer */}
      </div>

      {/* Backdrop overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* Sidebar container */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="flex align-center justify-between mb-4" style={{ padding: '0 8px' }}>
          <div className="flex align-center gap-2">
            <div style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-fg)',
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.95rem'
            }}>
              V
            </div>
            <div>
              <h2 style={{ fontSize: '0.95rem', margin: 0 }}>VDEV Admin</h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Workspace</span>
            </div>
          </div>
          
          {/* Close button inside sidebar for Mobile */}
          <button 
            className="hamburger-btn" 
            style={{ display: 'var(--mobile-close-display)' }} // Will be managed via CSS media query or style overrides
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close Sidebar"
          >
            <X size={20} className="mobile-only-close" />
          </button>
        </div>

        <nav className="flex flex-col" style={{ flexGrow: 1, marginTop: '16px', gap: '2px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)} // Close sidebar on nav click
                className="flex align-center gap-2"
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                  backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease, color 0.15s ease'
                }}
              >
                <Icon size={16} />
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
