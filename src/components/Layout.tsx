import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hasRole, useAuth } from '../context/AuthContext';
import {
  Menu,
  X,
  CheckSquare,
  Headphones,
  Settings,
  Users, Clapperboard, FolderKanban, Rocket } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { initials } from './userInitials';

interface LayoutProps {
  children: React.ReactNode;
}

const Brand: React.FC = () => (
  <div className="brand">
    <div className="brand-mark">W</div>
    <div style={{ minWidth: 0 }}>
      <h2 className="brand-name">Workspace</h2>
    </div>
  </div>
);

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = () => {
    setSettingsOpen(false);
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
        {user ? (
          <button
            type="button"
            className="user-avatar user-avatar-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Mở cài đặt"
            title="Cài đặt"
          >
            {initials(user.fullName, user.email)}
          </button>
        ) : <span style={{ width: 34 }} />}
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
          {user && (
            <button
              type="button"
              className="user-card user-card-btn"
              onClick={() => { setSettingsOpen(true); setIsSidebarOpen(false); }}
              aria-label="Mở cài đặt"
              title="Cài đặt"
            >
              <div className="user-avatar">{initials(user.fullName, user.email)}</div>
              <div className="user-meta">
                <div className="name">{user.fullName}</div>
                <div className="email">{user.email}</div>
              </div>
              <Settings size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          )}
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />}
    </div>
  );
};
