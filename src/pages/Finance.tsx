import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, Wallet as WalletIcon, Trash2, AlertCircle, X, Landmark, Coins } from 'lucide-react';

export const Finance: React.FC = () => {
  const [wallets, setWallets] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  // Create Wallet Form
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [walletType, setWalletType] = useState('BANK');
  const [walletInit, setWalletInit] = useState('');
  const [walletColor, setWalletColor] = useState('#6366f1');

  // Create Transaction Form
  const [showTxForm, setShowTxForm] = useState(false);
  const [txWalletId, setTxWalletId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState('EXPENSE');
  const [txTitle, setTxTitle] = useState('');
  const [txNote, setTxNote] = useState('');

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      const walletsData = await api.get('/api/finance/wallets');
      setWallets(walletsData);
      if (walletsData.length > 0 && !txWalletId) {
        setTxWalletId(walletsData[0].id);
      }

      const budgetsData = await api.get('/api/finance/budgets');
      setBudgets(budgetsData);

      const txsData = await api.get('/api/finance/transactions');
      setTransactions(txsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceData();
  }, []);

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletName.trim() || !walletInit) return;

    try {
      await api.post('/api/finance/wallets', {
        name: walletName,
        type: walletType,
        currency: 'VND',
        initialBalance: parseFloat(walletInit),
        color: walletColor,
        icon: walletType === 'BANK' ? 'credit-card' : 'wallet'
      });
      setWalletName('');
      setWalletInit('');
      setShowWalletForm(false);
      await loadFinanceData();
    } catch (err) {
      alert('Tạo ví thất bại');
    }
  };

  const showConfirm = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmDialog({
      show: true,
      title,
      message,
      action
    });
  };

  const handleConfirmAction = async () => {
    if (confirmDialog) {
      await confirmDialog.action();
      setConfirmDialog(null);
    }
  };

  const handleDeleteWallet = (id: string) => {
    showConfirm(
      'Xóa ví tài khoản',
      'Bạn có chắc muốn xóa ví này? Tất cả các giao dịch liên quan cũng có thể bị ảnh hưởng.',
      async () => {
        try {
          await api.delete(`/api/finance/wallets/${id}`);
          await loadFinanceData();
        } catch (err) {
          alert('Xóa ví thất bại');
        }
      }
    );
  };

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || !txTitle.trim()) return;

    try {
      await api.post('/api/finance/transactions', {
        walletId: txWalletId,
        amount: parseFloat(txAmount),
        type: txType,
        title: txTitle,
        note: txNote,
        categoryId: 'c1' // standard Category
      });
      setTxAmount('');
      setTxTitle('');
      setTxNote('');
      setShowTxForm(false);
      await loadFinanceData();
    } catch (err) {
      alert('Tạo giao dịch thất bại');
    }
  };

  const handleDeleteTransaction = (id: string) => {
    showConfirm(
      'Xóa giao dịch',
      'Bạn có muốn xóa giao dịch này và khôi phục lại số dư của ví liên quan?',
      async () => {
        try {
          await api.delete(`/api/finance/transactions/${id}`);
          await loadFinanceData();
        } catch (err) {
          alert('Xóa giao dịch thất bại');
        }
      }
    );
  };

  return (
    <div>
      <header className="flex justify-between align-center mb-4">
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Tài chính cá nhân</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Quản lý ví tiền, ngân sách thu chi và giao dịch thực tế</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setShowWalletForm(true)}>
            <WalletIcon size={16} />
            <span>Thêm ví</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowTxForm(true)}>
            <Plus size={16} />
            <span>Tạo thu chi</span>
          </button>
        </div>
      </header>

      {loading && wallets.length === 0 ? (
        <div className="loading-container card mt-4">
          <span className="spinner"></span>
          <span>Đang tải thông tin tài chính...</span>
        </div>
      ) : (
        <>
          {/* Wallets grid section */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            {wallets.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: 'span 3' }}>
                <WalletIcon className="empty-state-icon" size={32} />
                <p>Bạn chưa thêm ví nào. Hãy nhấn "Thêm ví" để bắt đầu quản lý dòng tiền.</p>
              </div>
            ) : (
              wallets.map(w => (
                <div key={w.id} className="card flex flex-col justify-between card-hover" style={{ borderTop: `4px solid ${w.color}` }}>
                  <div className="flex justify-between align-center">
                    <div className="flex align-center gap-2">
                      {w.type === 'BANK' ? <Landmark size={16} style={{ color: w.color }} /> : <Coins size={16} style={{ color: w.color }} />}
                      <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{w.name}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteWallet(w.id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h2 style={{ fontSize: '1.5rem', margin: '12px 0 4px' }}>
                    {w.currentBalance.toLocaleString('vi-VN')} <span style={{ fontSize: '0.85rem' }}>đ</span>
                  </h2>
                  <div className="flex align-center justify-between" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>Ban đầu: {w.initialBalance.toLocaleString('vi-VN')}đ</span>
                    <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{w.type}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Budgets list */}
          <div className="card mt-4">
            <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Hạn mức Ngân sách tháng này</h3>
            {budgets.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa cấu hình ngân sách.</p>
            ) : (
              budgets.map(b => (
                <div key={b.id} style={{ marginBottom: '16px' }}>
                  {(b.budgetItems || []).map((item: any, idx: number) => {
                    const percent = Math.min(Math.round((item.actualSpent / item.budgetAmount) * 100), 100);
                    return (
                      <div key={idx} className="flex flex-col gap-2">
                        <div className="flex justify-between align-center" style={{ fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: '600' }}>{b.name} ({item.categoryName})</span>
                          <span style={{ color: percent > 85 ? 'var(--danger)' : 'var(--text-muted)' }}>
                            Đã tiêu {item.actualSpent.toLocaleString('vi-VN')}đ / Hạn mức {item.budgetAmount.toLocaleString('vi-VN')}đ ({percent}%)
                          </span>
                        </div>
                        <div className="progress-bar-container">
                          <div className="progress-bar-fill" style={{ 
                            width: `${percent}%`, 
                            backgroundColor: percent > 85 ? 'var(--danger)' : 'var(--primary)' 
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Transactions list */}
          <div className="table-container table-responsive-card">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Tiêu đề / Ví</th>
                  <th>Loại</th>
                  <th>Ghi chú</th>
                  <th>Số tiền</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                      Chưa ghi nhận giao dịch phát sinh.
                    </td>
                  </tr>
                ) : (
                  transactions.map(t => {
                    const wallet = wallets.find(w => w.id === t.walletId);
                    return (
                      <tr key={t.id}>
                        <td data-label="Thời gian" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(t.transactionDate).toLocaleString('vi-VN')}
                        </td>
                        <td data-label="Ghi chú & Ví">
                          <div style={{ fontWeight: '600' }}>{t.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ví: {wallet?.name || 'Không xác định'}</div>
                        </td>
                        <td data-label="Loại">
                          <span className={`badge ${t.type === 'EXPENSE' ? 'badge-danger' : 'badge-success'}`}>
                            {t.type === 'EXPENSE' ? 'Khoản Chi' : 'Khoản Thu'}
                          </span>
                        </td>
                        <td data-label="Ghi chú thêm" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.note || '-'}</td>
                        <td data-label="Số tiền" style={{ fontWeight: '700', color: t.type === 'EXPENSE' ? 'var(--danger)' : 'var(--success)' }}>
                          {t.type === 'EXPENSE' ? '-' : '+'}{t.amount.toLocaleString('vi-VN')}đ
                        </td>
                        <td data-label="Hành động">
                          <button 
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)', padding: '6px 12px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modern Modal Create Wallet */}
      {showWalletForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Thêm Ví Mới</h3>
              <button className="hamburger-btn" onClick={() => setShowWalletForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateWallet}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tên ví / Tài khoản <span className="form-required">*</span></label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Techcombank, Tiền mặt..." 
                    required 
                    value={walletName}
                    onChange={(e) => setWalletName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Loại tài khoản</label>
                    <select className="form-input" value={walletType} onChange={(e) => setWalletType(e.target.value)}>
                      <option value="BANK">Ngân hàng (Bank)</option>
                      <option value="CASH">Tiền mặt (Cash)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Màu sắc chủ đạo</label>
                    <input type="color" className="form-input" style={{ height: '42px', padding: '2px' }} value={walletColor} onChange={(e) => setWalletColor(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Số dư khởi tạo (VND) <span className="form-required">*</span></label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="5000000" 
                    required 
                    value={walletInit}
                    onChange={(e) => setWalletInit(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowWalletForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu lại</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Modal Create Transaction */}
      {showTxForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Giao dịch thu chi mới</h3>
              <button className="hamburger-btn" onClick={() => setShowTxForm(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTransaction}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Ví thanh toán</label>
                  <select className="form-input" value={txWalletId} onChange={(e) => setTxWalletId(e.target.value)}>
                    {wallets.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.currentBalance.toLocaleString('vi-VN')}đ)</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Loại giao dịch</label>
                    <select className="form-input" value={txType} onChange={(e) => setTxType(e.target.value)}>
                      <option value="EXPENSE">Khoản Chi (Expense)</option>
                      <option value="INCOME">Khoản Thu (Income)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số tiền (VND) <span className="form-required">*</span></label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="50000" 
                      required 
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tiêu đề <span className="form-required">*</span></label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Mua sách, Ăn trưa..." 
                    required 
                    value={txTitle}
                    onChange={(e) => setTxTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ghi chú thêm</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Chi tiết địa điểm, lý do..." 
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTxForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu giao dịch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirm Dialog Component */}
      {confirmDialog && confirmDialog.show && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="flex align-center gap-2" style={{ color: 'var(--danger)' }}>
                <AlertCircle size={20} />
                <h3 style={{ margin: 0 }}>{confirmDialog.title}</h3>
              </div>
            </div>
            <div className="modal-body" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {confirmDialog.message}
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', backgroundColor: 'transparent' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDialog(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleConfirmAction}>Đồng ý</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
