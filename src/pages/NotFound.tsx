import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 24,
      textAlign: 'center',
      backgroundColor: 'var(--bg-app)',
      color: 'var(--text-main)',
      fontFamily: 'var(--font-sans)',
    }}
  >
    <div style={{ fontSize: '3rem', fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text-muted)' }}>404</div>
    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Không tìm thấy trang</h1>
    <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: 360 }}>
      Đường dẫn này không tồn tại hoặc đã được chuyển đi nơi khác.
    </p>
    <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Về trang chủ</Link>
  </div>
);
