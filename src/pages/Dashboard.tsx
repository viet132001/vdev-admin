import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { SquareCheckBig, Wallet, GraduationCap, ChevronRight, Activity, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    openTasksCount: 0,
    overdueCount: 0,
    walletsCount: 0,
    totalBalance: 0,
    coursesCount: 0,
    coursesProgress: 0
  });
  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [pending, inProgress, byDeadline] = await Promise.all([
          api.get('/api/tasks?status=PENDING&limit=1'),
          api.get('/api/tasks?status=IN_PROGRESS&limit=1'),
          api.get('/api/tasks?sort=deadline&order=asc&limit=50')
        ]);
        const openWithDeadline = (byDeadline.data || []).filter((t: any) => t.deadline && t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
        const startOfToday = new Date().setHours(0, 0, 0, 0);
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
          openTasksCount: (pending.total || 0) + (inProgress.total || 0),
          overdueCount: openWithDeadline.filter((t: any) => new Date(t.deadline).getTime() < startOfToday).length,
          walletsCount: wallets.length,
          totalBalance,
          coursesCount: courses.length,
          coursesProgress: progressPercent
        });
        setUpcomingTasks(openWithDeadline.slice(0, 3));
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
        <div className="card card-hover flex flex-col justify-between">
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Công việc đang mở</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>
                {stats.openTasksCount}
                {stats.overdueCount > 0 && <span className="badge badge-danger" style={{ marginLeft: '8px', verticalAlign: 'middle' }}>{stats.overdueCount} quá hạn</span>}
              </h2>
            </div>
            <div style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <SquareCheckBig size={24} />
            </div>
          </div>
          <Link to="/tasks" className="flex align-center gap-2 mt-4" style={{ fontSize: '0.8rem', fontWeight: '600' }}>
            <span>Quản lý công việc</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="card card-hover flex flex-col justify-between">
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tài chính (Ví & Số dư)</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>
                {stats.totalBalance.toLocaleString('vi-VN')} <span style={{ fontSize: '1rem', fontWeight: '500' }}>đ</span>
              </h2>
            </div>
            <div style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <Wallet size={24} />
            </div>
          </div>
          <Link to="/finance" className="flex align-center gap-2 mt-4" style={{ fontSize: '0.8rem', fontWeight: '600', }}>
            <span>Chi tiết thu chi</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="card card-hover flex flex-col justify-between">
          <div className="flex justify-between align-center">
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Học tập (Learning)</span>
              <h2 style={{ fontSize: '2rem', margin: '8px 0 0' }}>{stats.coursesProgress}%</h2>
            </div>
            <div style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <GraduationCap size={24} />
            </div>
          </div>
          <div className="mt-4">
            <div className="progress-bar-container" style={{ marginBottom: '8px' }}>
              <div className="progress-bar-fill" style={{ width: `${stats.coursesProgress}%`, }} />
            </div>
            <Link to="/learning" className="flex align-center gap-2" style={{ fontSize: '0.8rem', fontWeight: '600', }}>
              <span>Vào học tiếp</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        {/* Upcoming tasks card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} style={{ color: 'var(--primary)' }} />
            Công việc sắp đến hạn
          </h3>
          <div className="flex flex-col gap-2">
            {upcomingTasks.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Không có công việc nào sắp đến hạn.</p>
            ) : (
              upcomingTasks.map((task) => (
                <Link key={task.id} to={`/tasks?${task.projectId ? `project=${task.projectId}&` : ''}task=${task.id}`} style={{
                  display: 'block',
                  color: 'inherit',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)'
                }}>
                  <div className="flex justify-between align-center">
                    <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{task.icon ? `${task.icon} ` : ''}{task.title}</span>
                    {new Date(task.deadline).getTime() < new Date().setHours(0, 0, 0, 0)
                      ? <span className="badge badge-danger">Quá hạn</span>
                      : <span className="badge badge-info">{task.status === 'IN_PROGRESS' ? 'Đang làm' : 'Chờ xử lý'}</span>}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Deadline: {new Date(task.deadline).toLocaleDateString('vi-VN')}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent transactions card */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowUpRight size={18} style={{ color: 'var(--text-muted)' }} />
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
