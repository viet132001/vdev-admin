import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Users as UsersIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, getErrorMessage } from '../services/api';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { useBusy } from './tasks/agent';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Quản trị viên', USER: 'Người dùng' };
const roleLabel = (role: { code: string; name: string }) => ROLE_LABELS[role.code] || role.name;

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Chưa kích hoạt',
  SUSPENDED: 'Bị khoá',
};

export const Users: React.FC = () => {
  const { user: currentUser, refreshProfile } = useAuth();
  const { busy, run } = useBusy();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Wait for a pause in typing so each keystroke doesn't hit the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) query.set('search', search);
      const [list, roleList] = await Promise.all([
        api.get(`/api/users?${query}`, { noCache: true }),
        api.get('/api/users/roles'),
      ]);
      setUsers(list.data);
      setTotal(list.total);
      setTotalPages(Math.max(list.totalPages, 1));
      setRoles(roleList);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Không tải được danh sách người dùng.'));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const saveRoles = async (target: any, nextRoles: string[]) => {
    try {
      const updated = await api.patch(`/api/users/${target.id}/roles`, { roles: nextRoles });
      setUsers(prev => prev.map(u => (u.id === target.id ? updated : u)));
      if (target.id === currentUser?.id) await refreshProfile();
    } catch (err) {
      const message = getErrorMessage(err, 'Không cập nhật được vai trò.');
      alert(message === 'Cannot remove the last admin' ? 'Không thể gỡ quyền của quản trị viên cuối cùng.' : message);
    }
  };

  const toggleRole = (target: any, code: string) => {
    const has = target.roles.includes(code);
    if (has && target.roles.length === 1) {
      alert('Người dùng phải có ít nhất một vai trò.');
      return;
    }
    const nextRoles = has ? target.roles.filter((r: string) => r !== code) : [...target.roles, code];

    if (code !== 'ADMIN') {
      run(`${target.id}:${code}`, () => saveRoles(target, nextRoles));
      return;
    }
    // Admin rights are the only sensitive change here, so only they need a second look
    setConfirm({
      title: has ? 'Gỡ quyền quản trị?' : 'Cấp quyền quản trị?',
      message: has
        ? `${target.email} sẽ không còn vào được trang quản lý người dùng.`
        : `${target.email} sẽ xem được toàn bộ người dùng và thay đổi được vai trò của họ.`,
      confirmLabel: has ? 'Gỡ quyền' : 'Cấp quyền',
      action: () => saveRoles(target, nextRoles),
    });
  };

  return (
    <div>
      <div className="flex align-center gap-2" style={{ marginBottom: 4 }}>
        <UsersIcon size={20} />
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Người dùng</h1>
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>Xem tài khoản và phân vai trò.</p>

      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="form-input"
          style={{ width: '100%', paddingLeft: 30 }}
          placeholder="Tìm theo email hoặc họ tên"
          aria-label="Tìm người dùng"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {loadError ? (
        <div className="alert-banner alert-banner-danger">
          <span>{loadError}</span>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Thử lại</button>
        </div>
      ) : loading && users.length === 0 ? (
        <div className="loading-container card">
          <span className="spinner"></span>
          <span>Đang tải danh sách người dùng...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <UsersIcon className="empty-state-icon" size={32} />
          <p>{search ? 'Không tìm thấy người dùng phù hợp.' : 'Chưa có người dùng nào.'}</p>
        </div>
      ) : (
        <>
          <div className="table-container table-responsive-card">
            <table>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Đăng nhập</th>
                  <th>Trạng thái</th>
                  <th>Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td data-label="Người dùng">
                      <div style={{ fontWeight: 600 }}>
                        {u.fullName}
                        {u.id === currentUser?.id && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (bạn)</span>}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td data-label="Đăng nhập" style={{ fontSize: '0.85rem' }}>
                      {u.providers.includes('GOOGLE') ? 'Google' : 'Mật khẩu'}
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                        {STATUS_LABELS[u.status] || u.status}
                      </span>
                    </td>
                    <td data-label="Vai trò">
                      <div className="role-options">
                        {roles.map(role => (
                          <label key={role.code} className="role-option" title={role.description || undefined}>
                            <input
                              type="checkbox"
                              checked={u.roles.includes(role.code)}
                              disabled={busy !== null}
                              onChange={() => toggleRole(u, role.code)}
                            />
                            {roleLabel(role)}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex align-center justify-between" style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>{total} người dùng</span>
            <div className="flex align-center gap-2">
              <button className="btn btn-secondary btn-sm" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span>{page} / {totalPages}</span>
              <button className="btn btn-secondary btn-sm" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
