import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hasRole, useAuth } from '../context/AuthContext';
import {
  LogOut,
  Menu,
  X,
  CheckSquare,
  Headphones,
  Users, Clapperboard, FolderKanban, Rocket } from 'lucide-react';
import { ThemeSwitch, ThemeToggleButton } from './ThemeToggle';
import { SproutBuddy } from './SproutBuddy';

interface LayoutProps {
  children: React.ReactNode;
}

// Up to two initials from the full name (falls back to the email)
const initials = (name?: string, email?: string) => {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const pick = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2);
  return pick.toUpperCase();
};

const Brand: React.FC = () => (
  <div className="brand">
    <div className="brand-mark">V</div>
    <div style={{ minWidth: 0 }}>
      <h2 className="brand-name">VDEV Admin</h2>
      <div className="brand-sub">Workspace</div>
    </div>
  </div>
);

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
    // Tổng quan, Tài chính, Khoản nợ, Khóa học are temporarily hidden.
    // Invited (non-admin) users only work in team projects
    ...(hasRole(user, 'ADMIN') ? [{ path: '/tasks', label: 'Công việc (Tasks)', icon: CheckSquare }] : []),
    { path: '/projects', label: 'Dự án nhóm', icon: FolderKanban },
    ...(hasRole(user, 'ADMIN') ? [
      { path: '/dictation', label: 'Quản lý page', icon: Headphones },
      { path: '/studio', label: 'Studio', icon: Clapperboard },
      { path: '/story', label: 'Truyện viễn tưởng', icon: Rocket },
      { path: '/users', label: 'Người dùng', icon: Users }
    ] : []),
  ];

  return (
    <div className="layout-container">
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Mở menu"
        >
          <Menu size={22} />
        </button>
        <Brand />
        <ThemeToggleButton />
      </div>

      {/* Backdrop overlay for Mobile */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <Brand />
          <button
            className="hamburger-btn"
            style={{ display: 'var(--mobile-close-display)' }}
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="nav-section-label">Menu</div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <ThemeSwitch />
          {user && (
            <>
              <div className="user-card">
                <div className="user-avatar">{initials(user.fullName, user.email)}</div>
                <div className="user-meta">
                  <div className="name">{user.fullName}</div>
                  <div className="email">{user.email}</div>
                </div>
              </div>
              {hasRole(user, 'ADMIN') && <span className="badge badge-info" style={{ alignSelf: 'flex-start', marginLeft: 8 }}>Quản trị viên</span>}
              <button
                onClick={handleLogout}
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                <LogOut size={16} />
                <span>Đăng xuất</span>
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
      <SproutBuddy />
    </div>
  );
};
