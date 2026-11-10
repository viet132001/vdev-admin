import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { takeAfterLogin } from '../services/afterLogin';

// Landing page of the Google redirect: the backend puts the tokens in the URL fragment
export const GoogleCallback: React.FC = () => {
  const { completeGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const hash = window.location.hash;
    // Drop the tokens from the address bar and history before doing anything else
    window.history.replaceState(null, '', window.location.pathname);

    completeGoogleLogin(hash)
      .then(() => navigate(takeAfterLogin(), { replace: true }))
      .catch(() => navigate('/login?oauth_error=google', { replace: true }));
  }, [completeGoogleLogin, navigate]);

  return (
    <div className="loading-container" style={{ minHeight: '100vh' }}>
      <span className="spinner"></span>
      <span>Đang đăng nhập bằng Google...</span>
    </div>
  );
};
