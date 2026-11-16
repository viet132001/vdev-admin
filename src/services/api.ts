// Centralized API client
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
// Public so pages can show absolute BE URLs (e.g. the remote MCP endpoint)
export const API_BASE_URL = BASE_URL;

const TOKEN_KEY = 'vdev_token';
const REFRESH_TOKEN_KEY = 'vdev_refresh_token';
export const SESSION_EXPIRED_EVENT = 'vdev:session-expired';

// Layout listens to these to show / hide the "cannot reach the server" banner
export const NETWORK_ERROR_EVENT = 'vdev:network-error';
export const NETWORK_OK_EVENT = 'vdev:network-ok';
export const NETWORK_ERROR_MESSAGE = 'Không thể kết nối đến máy chủ, vui lòng thử lại sau.';

// True when the request never reached the backend (offline, server down, CORS)
export const isNetworkError = (err: any): boolean => err?.message === NETWORK_ERROR_MESSAGE;

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Full-page navigation target, the backend redirects to Google from there
export const getGoogleLoginUrl = (state: string) =>
  `${BASE_URL}/api/auth/google?state=${encodeURIComponent(state)}`;

export const setAuthTokens = (accessToken: string, refreshToken?: string) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearAuthTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Shared so concurrent 401s trigger a single refresh request
let refreshPromise: Promise<boolean> | null = null;

const refreshAccessToken = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return false;
      try {
        const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) return false;
        const json = await response.json();
        const data = json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
        if (!data?.accessToken) return false;
        setAuthTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

// fetch against the backend with the access token; on 401 refreshes once and retries,
// and if that fails clears the session so AuthContext sends the user back to login
export const authFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const send = async () => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), ...getAuthHeaders() } });
      window.dispatchEvent(new Event(NETWORK_OK_EVENT));
      return res;
    } catch (err: any) {
      // fetch only rejects with TypeError when nothing came back; aborts are the caller's own
      if (err?.name === 'AbortError') throw err;
      window.dispatchEvent(new Event(NETWORK_ERROR_EVENT));
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
  };
  const hadToken = !!localStorage.getItem(TOKEN_KEY);
  let response = await send();
  if (response.status !== 401 || !hadToken) return response;
  if (await refreshAccessToken()) {
    response = await send();
    if (response.status !== 401) return response;
  }
  clearAuthTokens();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  return response;
};

const cache = new Map<string, any>();

export const clearApiCache = () => {
  cache.clear();
};

// Extracts a readable message from errors thrown by `api` (backend body is `{ success, message, errors }`)
export const getErrorMessage = (err: any, fallback: string): string => {
  const raw = err?.message;
  if (!raw) return fallback;
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      return json.errors.map((e: any) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e))).join('\n');
    }
    return json.message || fallback;
  } catch {
    return raw;
  }
};

// Unwraps the `{ success, data }` envelope; errors carry the raw response body as message
const request = async (url: string, init?: RequestInit) => {
  const response = await authFetch(url, init);
  if (!response.ok) throw new Error(await response.text() || 'API Error');
  const json = await response.json();
  return json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
};

const sendJson = (method: string, url: string, body: any) => {
  cache.clear();
  return request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
};

export const api = {
  async get(url: string, options: { noCache?: boolean } = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const cacheKey = `${url}::${token}`;
    if (!options.noCache && cache.has(cacheKey)) return cache.get(cacheKey);
    const data = await request(url);
    if (!options.noCache) cache.set(cacheKey, data);
    return data;
  },

  post(url: string, body: any) {
    return sendJson('POST', url, body);
  },

  patch(url: string, body: any) {
    return sendJson('PATCH', url, body);
  },

  delete(url: string) {
    cache.clear();
    return request(url, { method: 'DELETE' });
  }
};
