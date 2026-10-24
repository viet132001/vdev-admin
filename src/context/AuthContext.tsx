import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, clearApiCache, setAuthTokens, clearAuthTokens, SESSION_EXPIRED_EVENT } from '../services/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  avatarFileId: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/auth/profile');
      const profileData = res.data ? res.data : res;
      setUser({
        id: profileData.id,
        email: profileData.email,
        fullName: profileData.fullName || profileData.name || '',
        avatarFileId: profileData.avatarFileId || profileData.avatarUrl || null
      });
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
    setUser({
      id: loginData.user.id,
      email: loginData.user.email,
      fullName: loginData.user.fullName || loginData.user.name || '',
      avatarFileId: loginData.user.avatarFileId || loginData.user.avatarUrl || null
    });
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
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
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
