import React, { useEffect } from 'react';
import { LogOut, X } from 'lucide-react';
import { hasRole, useAuth } from '../context/AuthContext';
import { ThemeSwitch } from './ThemeToggle';
import { initials } from './userInitials';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose, onLogout }) => {
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-label="Cài đặt">
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Cài đặt</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="modal-body flex flex-col gap-4">
          {user && (
            <section>
              <div className="nav-section-label" style={{ padding: 0, marginBottom: 8 }}>Tài khoản</div>
              <div className="user-card" style={{ padding: 0 }}>
                <div className="user-avatar">{initials(user.fullName, user.email)}</div>
                <div className="user-meta">
                  <div className="name">{user.fullName}</div>
                  <div className="email">{user.email}</div>
                </div>
                {hasRole(user, 'ADMIN') && <span className="badge badge-info">Quản trị viên</span>}
              </div>
            </section>
          )}

          <section>
            <div className="nav-section-label" style={{ padding: 0, marginBottom: 8 }}>Giao diện</div>
            <ThemeSwitch />
          </section>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>
  );
};
