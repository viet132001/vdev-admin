import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, hasRole, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Finance } from './pages/Finance';
import { Liabilities } from './pages/Liabilities';
import { Learning } from './pages/Learning';
import { Tasks } from './pages/Tasks';
import { Dictation } from './pages/Dictation';
import { Studio } from './pages/Studio';
import { Users } from './pages/Users';
import { Projects } from './pages/Projects';
import { Invite } from './pages/Invite';
import { GoogleCallback } from './pages/GoogleCallback';
import './App.css';

// Component to protect pages requiring authentications
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'var(--font-sans)',
        color: 'var(--text-muted)'
      }}>
        Đang tải hệ thống...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !hasRole(user, ...roles)) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};

// Home depends on the role: admins land on their personal Tasks, invited users on team projects
const HomeRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={hasRole(user, 'ADMIN') ? '/tasks' : '/projects'} replace />;
};

// Component to redirect authenticated users away from Login/Register pages
const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router basename="/vdev-admin">
        <Routes>
          {/* Guest Only Routes */}
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

          {/* Not a guest route: it must finish even if a session already exists */}
          <Route path="/auth/google/callback" element={<GoogleCallback />} />
          {/* Invite link from email: readable logged out, handles login itself */}
          <Route path="/invite/:token" element={<Invite />} />

          {/* Protected Main Admin Routes */}
          {/* Dashboard is hidden from the menu; home opens Tasks (ADMIN) or team projects */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<ProtectedRoute roles={['ADMIN']}><Dashboard /></ProtectedRoute>} />
          <Route path="/notes" element={<Navigate to="/" replace />} />
          <Route path="/finance" element={<ProtectedRoute roles={['ADMIN']}><Finance /></ProtectedRoute>} />
          <Route path="/liabilities" element={<ProtectedRoute roles={['ADMIN']}><Liabilities /></ProtectedRoute>} />
          <Route path="/learning" element={<ProtectedRoute roles={['ADMIN']}><Learning /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute roles={['ADMIN']}><Tasks /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/studio" element={<ProtectedRoute roles={['ADMIN']}><Studio /></ProtectedRoute>} />
          <Route path="/dictation" element={<ProtectedRoute roles={['ADMIN']}><Dictation /></ProtectedRoute>} />

          <Route path="/users" element={<ProtectedRoute roles={['ADMIN']}><Users /></ProtectedRoute>} />

          {/* Catch-all Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
