import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Pencil, Search, Trash2, Users as UsersIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, getErrorMessage } from '../services/api';
import { ConfirmDialog, type ConfirmState } from './tasks/shared';
import { useBusy } from './tasks/agent';
import { BlockList } from './users/BlockList';
import { blockErrorMessage, createBlock, removeBlock, type BlockType } from './users/blocks';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Quản trị viên', USER: 'Người dùng', PROJECT_CREATOR: 'Tạo dự án nhóm' };
const roleLabel = (role: { code: string; name: string }) => ROLE_LABELS[role.code] || role.name;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Bị khoá',
  PENDING_VERIFICATION: 'Chờ xác minh',
};

export const Users: React.FC = () => {
  const { user: currentUser, refreshProfile } = useAuth();
  const { busy, run } = useBusy();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'blocks' ? 'blocks' : 'accounts';
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
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const saveName = async () => {
    if (!editing) return;
    const fullName = editing.name.trim();
    if (!fullName) {
      alert('Họ tên không được để trống.');
      return;
    }
    try {
      const updated = await api.patch(`/api/users/${editing.id}`, { fullName });
      setUsers(prev => prev.map(u => (u.id === editing.id ? updated : u)));
      setEditing(null);
      if (editing.id === currentUser?.id) await refreshProfile();
    } catch (err) {
      alert(getErrorMessage(err, 'Không đổi được họ tên.'));
    }
  };

  const askDelete = (target: any) => {
    setConfirm({
      title: 'Xoá người dùng?',
      message: `${target.fullName} (${target.email}) bị đăng xuất, mất quyền vào các dự án nhóm và token MCP / runner bị thu hồi. Đăng nhập lại bằng email này sẽ tạo tài khoản mới.`,
      confirmLabel: 'Xoá',
      action: async () => {
        try {
          await api.delete(`/api/users/${target.id}`);
          await load();
        } catch (err) {
          const message = getErrorMessage(err, 'Không xoá được người dùng.');
          alert(message === 'Cannot delete an admin' ? 'Gỡ quyền quản trị trước khi xoá.' : message);
        }
      },
    });
  };

  const askBlock = (type: BlockType, value: string) => {
    setConfirm({
      title: type === 'EMAIL' ? 'Chặn email này?' : 'Chặn IP này?',
      message: type === 'EMAIL'
        ? `${value} sẽ bị đăng xuất và không đăng nhập hay đăng ký lại được.`
        : `Mọi truy cập từ ${value} đều bị chặn, kể cả người khác dùng chung mạng.`,
      confirmLabel: 'Chặn',
      action: async () => {
        try {
          await createBlock(type, value);
          await load();
        } catch (err) {
          alert(blockErrorMessage(err, 'Không chặn được.'));
        }
      },
    });
  };

  const askUnblock = (id: string, value: string) => {
    setConfirm({
      title: 'Bỏ chặn?',
      message: `${value} sẽ truy cập lại được hệ thống.`,
      confirmLabel: 'Bỏ chặn',
      action: async () => {
        try {
          await removeBlock(id);
          await load();
        } catch (err) {
          alert(blockErrorMessage(err, 'Không bỏ chặn được.'));
        }
      },
    });
  };

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
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>Tài khoản được tạo tự động ở lần đăng nhập Google đầu tiên hoặc khi đăng ký.</p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'accounts' ? 'active' : ''}`} onClick={() => setSearchParams({})}>Tài khoản</button>
        <button className={`tab ${tab === 'blocks' ? 'active' : ''}`} onClick={() => setSearchParams({ tab: 'blocks' })}>Danh sách chặn</button>
      </div>

      {tab === 'blocks' ? <BlockList /> : <>

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
                  <th>Vai trò</th>
                  <th>Đăng nhập gần nhất</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td data-label="Người dùng">
                      {editing?.id === u.id ? (
                        <form
                          className="flex align-center gap-1"
                          onSubmit={(e) => { e.preventDefault(); run(`${u.id}:name`, saveName); }}
                        >
                          <input
                            className="form-input"
                            style={{ padding: '4px 8px', minWidth: 0, flex: 1 }}
                            aria-label="Họ tên"
                            autoFocus
                            maxLength={100}
                            value={editing?.name ?? ''}
                            onChange={(e) => setEditing({ id: u.id, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
                          />
                          <button type="submit" className="btn btn-secondary btn-sm" aria-label="Lưu họ tên" disabled={busy !== null}>
                            <Check size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" aria-label="Huỷ" onClick={() => setEditing(null)}>
                            <X size={14} />
                          </button>
                        </form>
                      ) : (
                        <div className="flex align-center gap-1" style={{ fontWeight: 600 }}>
                          <span>
                            {u.fullName}
                            {u.id === currentUser?.id && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (bạn)</span>}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 4 }}
                            aria-label="Sửa họ tên"
                            title="Sửa họ tên"
                            onClick={() => setEditing({ id: u.id, name: u.fullName })}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      )}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
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
                    <td data-label="Đăng nhập gần nhất" style={{ fontSize: '0.85rem', color: u.lastLoginAt ? undefined : 'var(--text-muted)' }}>
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Chưa ghi nhận'}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                        {[u.providers.includes('GOOGLE') ? 'Google' : 'Mật khẩu', u.lastLoginIp].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td data-label="Ngày tạo" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDateTime(u.createdAt)}</td>
                    <td data-label="Trạng thái">
                      {u.emailBlockId ? (
                        <span className="badge badge-danger">Đã chặn</span>
                      ) : (
                        <span className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                          {STATUS_LABELS[u.status] || u.status}
                        </span>
                      )}
                    </td>
                    <td data-label="Thao tác">
                      {/* The backend refuses blocking or deleting admins, so don't offer actions that can only fail */}
                      {u.id === currentUser?.id || u.roles.includes('ADMIN') ? (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      ) : (
                        <div className="block-actions">
                          {u.emailBlockId ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => askUnblock(u.emailBlockId, u.email)}>Bỏ chặn email</button>
                          ) : (
                            <button className="btn btn-secondary btn-sm" onClick={() => askBlock('EMAIL', u.email)}>Chặn email</button>
                          )}
                          {u.lastLoginIp && (u.ipBlockId ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => askUnblock(u.ipBlockId, u.lastLoginIp)}>Bỏ chặn IP</button>
                          ) : (
                            <button className="btn btn-secondary btn-sm" onClick={() => askBlock('IP', u.lastLoginIp)}>Chặn IP</button>
                          ))}
                          <button className="btn btn-danger btn-sm" onClick={() => askDelete(u)}>
                            <Trash2 size={13} /> Xoá
                          </button>
                        </div>
                      )}
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

      </>}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};
