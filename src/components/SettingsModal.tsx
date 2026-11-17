import React, { useEffect, useRef, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { hasRole, useAuth } from '../context/AuthContext';
import { api, getErrorMessage } from '../services/api';
import { ThemeSwitch } from './ThemeToggle';
import { UserAvatar } from './UserAvatar';
import { uploadAvatar } from '../services/avatar';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose, onLogout }) => {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.fullName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    try {
      await uploadAvatar(file);
      await refreshProfile();
    } catch (err) {
      setError(getErrorMessage(err, 'Không đổi được ảnh đại diện'));
    } finally {
      setUploading(false);
    }
  };

  const trimmed = name.trim();
  const dirty = !!user && trimmed !== user.fullName;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    if (!trimmed) return setError('Tên không được để trống');
    if (trimmed.length > 100) return setError('Tên tối đa 100 ký tự');
    setSaving(true);
    setError('');
    try {
      await api.patch('/api/auth/profile', { fullName: trimmed });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Không lưu được tên'));
    } finally {
      setSaving(false);
    }
  };

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
              <div className="user-card" style={{ padding: 0, marginBottom: 12 }}>
                <button
                  type="button"
                  className="user-avatar"
                  title="Đổi ảnh đại diện (JPG, PNG, WebP, tối đa 2MB)"
                  aria-label="Đổi ảnh đại diện"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                  style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                >
                  {uploading ? '…' : <UserAvatar user={user} />}
                </button>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickAvatar} />
                <div className="user-meta">
                  <div className="name">{user.fullName}</div>
                  <div className="email">{user.email}</div>
                </div>
                {hasRole(user, 'ADMIN') && <span className="badge badge-info">Quản trị viên</span>}
              </div>
              <form onSubmit={saveName}>
                <label className="form-label" htmlFor="settings-name">Tên hiển thị</label>
                <div className="flex gap-2">
                  <input
                    id="settings-name"
                    className="form-input"
                    value={name}
                    maxLength={100}
                    onChange={(e) => { setName(e.target.value); setSaved(false); setError(''); }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || saving}>
                    {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 6 }}>{error}</div>}
                {saved && !error && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6 }}>Đã lưu. Mọi người sẽ thấy tên mới.</div>}
              </form>
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
