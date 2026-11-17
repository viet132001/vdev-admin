import React, { useEffect, useState } from 'react';
import { NETWORK_ERROR_EVENT, NETWORK_OK_EVENT } from '../services/api';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hasRole, useAuth } from '../context/AuthContext';
import {
  Menu,
  X,
  CheckSquare,
  Headphones,
  Settings,
  TriangleAlert,
  Users, Clapperboard, FolderKanban } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { UserAvatar } from './UserAvatar';

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
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onError = () => setOffline(true);
    const onOk = () => setOffline(false);
    window.addEventListener(NETWORK_ERROR_EVENT, onError);
    window.addEventListener(NETWORK_OK_EVENT, onOk);
    return () => {
      window.removeEventListener(NETWORK_ERROR_EVENT, onError);
      window.removeEventListener(NETWORK_OK_EVENT, onOk);
    };
  }, []);

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
      // /studio and /story stay routable but are replaced in the menu by the asset-driven studio
      { path: '/animation', label: 'Xưởng hoạt hình', icon: Clapperboard },
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
            <UserAvatar user={user} />
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
              <div className="user-avatar"><UserAvatar user={user} /></div>
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
        {offline && (
          <div className="offline-banner" role="alert">
            <TriangleAlert size={16} style={{ flexShrink: 0 }} />
            <span>Không thể kết nối đến máy chủ, vui lòng thử lại sau.</span>
            <button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>Tải lại</button>
          </div>
        )}
        {children}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />}
    </div>
  );
};
