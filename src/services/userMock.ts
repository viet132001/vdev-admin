// localStorage mock for the user & role admin API (/api/users) — mirrors src/doc/auth-api.md sections 6-7

// Not 'mock_users': api.ts already seeds that key for its own use
const STORAGE_KEY = 'mock_admin_users';
const BASE = '/api/users';
const BLOCKS_BASE = '/api/access-blocks';
const BLOCKS_KEY = 'mock_access_blocks';

const ROLES = [
  { code: 'ADMIN', name: 'Administrator', description: 'System administrator with full permissions' },
  { code: 'PROJECT_CREATOR', name: 'Project Creator', description: 'Can create team projects; no access to other admin features' },
  { code: 'USER', name: 'Regular User', description: 'Standard user with personal resources' }
];

const fail = (message: string, errorCode = 'BADREQUEST'): never => {
  throw new Error(JSON.stringify({ success: false, message, errorCode, errors: [] }));
};

const loadBlocks = (): any[] => JSON.parse(localStorage.getItem(BLOCKS_KEY) || '[]');

const withBlocks = (user: any) => {
  const blocks = loadBlocks();
  const idOf = (type: string, value: string | null) => blocks.find(b => b.type === type && b.value === value)?.id ?? null;
  return { ...user, emailBlockId: idOf('EMAIL', user.email), ipBlockId: idOf('IP', user.lastLoginIp) };
};

const handleBlocks = (method: string, path: string, body?: any): { handled: boolean; data?: any } => {
  const blocks = loadBlocks();
  if (method === 'GET' && path === BLOCKS_BASE) return { handled: true, data: blocks };
  if (method === 'POST' && path === BLOCKS_BASE) {
    if (blocks.some(b => b.type === body.type && b.value === body.value)) fail('Already blocked', 'CONFLICT');
    const block = { id: Math.random().toString(36).substring(2, 10), type: body.type, value: body.value, reason: body.reason ?? null, createdAt: new Date().toISOString() };
    localStorage.setItem(BLOCKS_KEY, JSON.stringify([block, ...blocks]));
    return { handled: true, data: block };
  }
  const id = path.slice(BLOCKS_BASE.length + 1);
  if (method === 'DELETE' && id) {
    const block = blocks.find(b => b.id === id);
    if (!block) return fail('Block not found', 'NOTFOUND');
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks.filter(b => b.id !== id)));
    return { handled: true, data: block };
  }
  return { handled: false };
};

const load = (): any[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  const now = new Date().toISOString();
  const base = { avatarFileId: null, status: 'ACTIVE', lastLoginAt: now, createdAt: now };
  return [
    { ...base, id: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12', email: localStorage.getItem('vdev_user_email') || 'user@vdev.local', fullName: localStorage.getItem('vdev_user_name') || 'Nguyen Van A', roles: ['ADMIN', 'USER'], providers: [] },
    { ...base, id: 'mock-user-2', email: 'member@vdev.local', fullName: 'Tran Thi B', roles: ['USER'], providers: ['GOOGLE'], lastLoginIp: '203.0.113.10' }
  ];
};

export const mockUsers = (method: string, url: string, body?: any): { handled: boolean; data?: any } => {
  const [path, queryString] = url.split('?');
  if (path.startsWith(BLOCKS_BASE)) return handleBlocks(method, path, body);
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
      data: { data: matched.slice((page - 1) * limit, page * limit).map(withBlocks), total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) }
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
    return { handled: true, data: withBlocks(user) };
  }

  const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && (method === 'PATCH' || method === 'DELETE')) {
    const users = load();
    const user = users.find(u => u.id === userMatch[1]);
    if (!user) return fail('User not found', 'NOTFOUND');
    if (method === 'PATCH') {
      const fullName = String(body?.fullName ?? '').trim();
      if (!fullName) return fail('Full name is required');
      user.fullName = fullName;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
      return { handled: true, data: withBlocks(user) };
    }
    if (user.roles.includes('ADMIN')) return fail('Cannot delete an admin');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users.filter(u => u.id !== user.id)));
    return { handled: true, data: { id: user.id } };
  }

  return { handled: false };
};
