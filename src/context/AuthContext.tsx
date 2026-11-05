import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { api, clearApiCache, getGoogleLoginUrl, setAuthTokens, clearAuthTokens, SESSION_EXPIRED_EVENT } from '../services/api';

const GOOGLE_STATE_KEY = 'vdev_google_oauth_state';

interface User {
  id: string;
  email: string;
  fullName: string;
  avatarFileId: string | null;
  roles: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  startGoogleLogin: () => void;
  completeGoogleLogin: (hash: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Login returns `name` / `avatarUrl` while the profile returns `fullName` / `avatarFileId`
const toUser = (data: any): User => ({
  id: data.id,
  email: data.email,
  fullName: data.fullName || data.name || '',
  avatarFileId: data.avatarFileId || data.avatarUrl || null,
  roles: data.roles || []
});

// UI convenience only: the backend enforces roles on every request
export const hasRole = (user: User | null, ...roles: string[]) =>
  !!user && roles.some(role => user.roles.includes(role));

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/auth/profile');
      setUser(toUser(res.data ? res.data : res));
    } catch (err) {
      setUser(null);
      clearAuthTokens();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('vdev_token');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }

    // api.ts fires this when the refresh token is also rejected
    const onSessionExpired = () => {
      clearApiCache();
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    const loginData = res.data ? res.data : res;
    setAuthTokens(loginData.accessToken, loginData.refreshToken);
    setUser(toUser(loginData.user));
  };

  const startGoogleLogin = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(GOOGLE_STATE_KEY, state);
    window.location.assign(getGoogleLoginUrl(state));
  };

  // Stable identity: the callback page depends on it in an effect
  const completeGoogleLogin = useCallback(async (hash: string) => {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const expectedState = sessionStorage.getItem(GOOGLE_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_STATE_KEY);
    const accessToken = params.get('accessToken');

    // Must match the state this tab generated, otherwise a crafted link could sign the
    // visitor into someone else's account
    if (!accessToken || !expectedState || params.get('state') !== expectedState) {
      throw new Error('Invalid Google login response');
    }

    setAuthTokens(accessToken, params.get('refreshToken') || undefined);
    clearApiCache();
    try {
      setUser(toUser(await api.get('/api/auth/profile', { noCache: true })));
    } catch (err) {
      clearAuthTokens();
      throw err;
    }
  }, []);

  const refreshProfile = async () => {
    setUser(toUser(await api.get('/api/auth/profile', { noCache: true })));
  };

  const register = async (email: string, password: string, fullName: string) => {
    await api.post('/api/auth/register', { email, password, fullName });
  };

  const logout = () => {
    clearAuthTokens();
    localStorage.removeItem('vdev_user_email');
    localStorage.removeItem('vdev_user_name');
    clearApiCache();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, startGoogleLogin, completeGoogleLogin, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
