// localStorage mock for the user & role admin API (/api/users) — mirrors src/doc/auth-api.md section 6

// Not 'mock_users': api.ts already seeds that key for its own use
const STORAGE_KEY = 'mock_admin_users';
const BASE = '/api/users';

const ROLES = [
  { code: 'ADMIN', name: 'Administrator', description: 'System administrator with full permissions' },
  { code: 'USER', name: 'Regular User', description: 'Standard user with personal resources' }
];

const fail = (message: string, errorCode = 'BADREQUEST'): never => {
  throw new Error(JSON.stringify({ success: false, message, errorCode, errors: [] }));
};

const load = (): any[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  const base = { avatarFileId: null, status: 'ACTIVE', createdAt: new Date().toISOString() };
  return [
    { ...base, id: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12', email: localStorage.getItem('vdev_user_email') || 'user@vdev.local', fullName: localStorage.getItem('vdev_user_name') || 'Nguyen Van A', roles: ['ADMIN', 'USER'], providers: [] },
    { ...base, id: 'mock-user-2', email: 'member@vdev.local', fullName: 'Tran Thi B', roles: ['USER'], providers: ['GOOGLE'] }
  ];
};

export const mockUsers = (method: string, url: string, body?: any): { handled: boolean; data?: any } => {
  const [path, queryString] = url.split('?');
  if (!path.startsWith(BASE)) return { handled: false };

  if (method === 'GET' && path === `${BASE}/roles`) return { handled: true, data: ROLES };

  if (method === 'GET' && path === BASE) {
    const query = new URLSearchParams(queryString);
    const search = (query.get('search') || '').trim().toLowerCase();
    const page = Number(query.get('page')) || 1;
    const limit = Number(query.get('limit')) || 20;
    const matched = load().filter(u => !search || u.email.toLowerCase().includes(search) || u.fullName.toLowerCase().includes(search));
    return {
      handled: true,
      data: { data: matched.slice((page - 1) * limit, page * limit), total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) }
    };
  }

  const rolesMatch = path.match(/^\/api\/users\/([^/]+)\/roles$/);
  if (method === 'PATCH' && rolesMatch) {
    const users = load();
    const user = users.find(u => u.id === rolesMatch[1]);
    if (!user) return fail('User not found', 'NOTFOUND');
    const roles: string[] = [...new Set<string>(body.roles)];
    if (roles.length === 0) return fail('roles should not be empty');
    if (roles.some(code => !ROLES.some(r => r.code === code))) return fail('Unknown role');
    const isLastAdmin = user.roles.includes('ADMIN') && !users.some(u => u.id !== user.id && u.roles.includes('ADMIN'));
    if (isLastAdmin && !roles.includes('ADMIN')) return fail('Cannot remove the last admin');
    user.roles = roles;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    return { handled: true, data: user };
  }

  return { handled: false };
};
