import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { FileText, Wallet, GraduationCap, ChevronRight, Activity, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    notesCount: 0,
    walletsCount: 0,
    totalBalance: 0,
    coursesCount: 0,
    coursesProgress: 0
  });
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const notes = await api.get('/api/notes');
        const wallets = await api.get('/api/finance/wallets');
        const transactions = await api.get('/api/finance/transactions');
        const courses = await api.get('/api/learning/courses');

        const totalBalance = wallets.reduce((sum: number, w: any) => sum + w.currentBalance, 0);
        
        // Calculate dynamic mock progress percentage
        let progressPercent = 0;
        if (courses.length > 0) {
          const detail = await api.get(`/api/learning/courses/${courses[0].id}`);
          let totalL = 0;
          let compL = 0;
          (detail.sections || []).forEach((sec: any) => {
            (sec.lessons || []).forEach((les: any) => {
              totalL++;
              if (les.isCompleted) compL++;
            });
          });
          progressPercent = totalL > 0 ? Math.round((compL / totalL) * 100) : 0;
        }

        setStats({
          notesCount: notes.length,
          walletsCount: wallets.length,
          totalBalance,
          coursesCount: courses.length,
          coursesProgress: progressPercent
        });
        setRecentNotes(notes.slice(0, 3));
        setRecentTransactions(transactions.slice(0, 3));
      } catch (err) {
        console.error('Failed to load stats', err);
      }
    };
    loadStats();
  }, []);

  return (
    <div>
      <header className="flex justify-between align-center mb-4">
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Hệ thống quản trị Portal</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Xem nhanh trạng thái các phân hệ ứng dụng</p>
        </div>
      </header>

      {/* Grid statistics */}
      <div className="grid grid-cols-3 gap-4" style={{ marginTop: '24px' }}>
        <div className="card card-hover flex flex-col justify-between" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ghi chú cá nhân</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>{stats.notesCount}</h2>
            </div>
            <div style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <FileText size={24} />
            </div>
          </div>
          <Link to="/notes" className="flex align-center gap-2 mt-4" style={{ fontSize: '0.8rem', fontWeight: '600' }}>
            <span>Quản lý ghi chú</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="card card-hover flex flex-col justify-between" style={{ borderLeft: '4px solid var(--success)' }}>
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tài chính (Ví & Số dư)</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>
                {stats.totalBalance.toLocaleString('vi-VN')} <span style={{ fontSize: '1rem', fontWeight: '500' }}>đ</span>
              </h2>
            </div>
            <div style={{ backgroundColor: 'hsla(142, 72%, 45%, 0.1)', color: 'var(--success)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <Wallet size={24} />
            </div>
          </div>
          <Link to="/finance" className="flex align-center gap-2 mt-4" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--success)' }}>
            <span>Chi tiết thu chi</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="card card-hover flex flex-col justify-between" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Học tập (Learning)</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>{stats.coursesProgress}%</h2>
            </div>
            <div style={{ backgroundColor: 'hsla(38, 92%, 50%, 0.1)', color: 'var(--warning)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <GraduationCap size={24} />
            </div>
          </div>
          <div className="mt-4">
            <div className="progress-bar-container" style={{ marginBottom: '8px' }}>
              <div className="progress-bar-fill" style={{ width: `${stats.coursesProgress}%`, backgroundColor: 'var(--warning)' }} />
            </div>
            <Link to="/learning" className="flex align-center gap-2" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--warning)' }}>
              <span>Vào học tiếp</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        {/* Recent notes card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} style={{ color: 'var(--primary)' }} />
            Ghi chú cập nhật gần đây
          </h3>
          <div className="flex flex-col gap-2">
            {recentNotes.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có ghi chú nào.</p>
            ) : (
              recentNotes.map((note) => (
                <div key={note.id} style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)'
                }}>
                  <div className="flex justify-between align-center">
                    <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{note.title}</span>
                    {note.isPinned && <span className="badge badge-info btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>Ghim</span>}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{note.summary || 'Không có mô tả chi tiết'}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent transactions card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowUpRight size={18} style={{ color: 'var(--success)' }} />
            Giao dịch tài chính mới nhất
          </h3>
          <div className="flex flex-col gap-2">
            {recentTransactions.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có giao dịch nào.</p>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="flex justify-between align-center" style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)'
                }}>
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{tx.title}</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(tx.transactionDate).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                  <span style={{
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    color: tx.type === 'EXPENSE' ? 'var(--danger)' : 'var(--success)'
                  }}>
                    {tx.type === 'EXPENSE' ? '-' : '+'}{tx.amount.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
