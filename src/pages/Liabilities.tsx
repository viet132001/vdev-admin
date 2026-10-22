import React, { useEffect, useRef, useState } from 'react';
import { api, getErrorMessage } from '../services/api';
import { MoneyInput } from '../components/MoneyInput';
import {
  Plus, Trash2, AlertCircle, X, Landmark, CreditCard, Pencil, Eye, EyeOff, Lock, Pin, PinOff,
  CalendarClock, Banknote, StickyNote, CheckCircle2
} from 'lucide-react';

// --- Types (src/doc/finance-api.md §6.2) ---
type LiabilityType = 'LOAN' | 'CREDIT_CARD';
type LiabilityStatus = 'ACTIVE' | 'PAID_OFF' | 'CLOSED';
type LiabilityPaymentType = 'INSTALLMENT' | 'PREPAYMENT' | 'INTEREST' | 'FEE';

interface LiabilitySummary {
  nextDueDate: string;
  daysUntilDue: number;
  paidThisCycle: boolean;
  nextPaymentAmount: number;
  estimatedMonthlyCharge: number;
  remainingInstallments: number | null;
  progressPercent: number | null;
  availableCredit: number | null;
  utilizationPercent: number | null;
}

interface LiabilityPayment {
  id: string;
  liabilityId: string;
  type: LiabilityPaymentType;
  amount: number;
  principalPart: number;
  paidAt: string;
  note: string | null;
  walletId: string | null;
  transactionId: string | null;
  createdAt: string;
}

interface LiabilityNote {
  id: string;
  liabilityId: string;
  title: string;
  content: string | null;
  hasSecret: boolean;
  remindAt: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Liability {
  id: string;
  type: LiabilityType;
  status: LiabilityStatus;
  name: string;
  institutionName: string;
  currency: string;
  principalAmount: number | null;
  creditLimit: number | null;
  outstandingBalance: number;
  installmentAmount: number | null;
  totalInstallments: number | null;
  paidInstallments: number;
  monthlyRate: number | null;
  dueDay: number;
  startDate: string | null;
  icon: string | null;
  color: string | null;
  payments: LiabilityPayment[];
  notes: LiabilityNote[];
  summary: LiabilitySummary;
}

interface LiabilityOverview {
  totalOutstanding: number;
  totalLoanOutstanding: number;
  totalCreditLimit: number;
  totalCardOutstanding: number;
  totalAvailableCredit: number;
  estimatedMonthlyCharges: number;
  upcoming: {
    id: string;
    name: string;
    institutionName: string;
    type: LiabilityType;
    dueDate: string;
    daysUntilDue: number;
    amount: number;
  }[];
}

const BASE = '/api/finance/liabilities';

const TYPE_LABELS: Record<LiabilityType, string> = { LOAN: 'Khoản vay', CREDIT_CARD: 'Thẻ tín dụng' };
const STATUS_LABELS: Record<LiabilityStatus, string> = { ACTIVE: 'Đang hoạt động', PAID_OFF: 'Đã tất toán', CLOSED: 'Đã đóng' };
const STATUS_BADGE: Record<LiabilityStatus, string> = { ACTIVE: 'badge-info', PAID_OFF: 'badge-success', CLOSED: '' };
const PAYMENT_TYPE_LABELS: Record<LiabilityPaymentType, string> = {
  INSTALLMENT: 'Góp kỳ',
  PREPAYMENT: 'Trả trước / bớt gốc',
  INTEREST: 'Trả lãi',
  FEE: 'Phí (đáo thẻ...)'
};

const fmtMoney = (n: number | null | undefined) => `${(n ?? 0).toLocaleString('vi-VN')}đ`;
// Due dates are displayed as date-only in Vietnam time (§6 notes)
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '-';
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '-';
const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

const dueText = (days: number) => (days === 0 ? 'Hôm nay' : days < 0 ? `Quá hạn ${-days} ngày` : `Còn ${days} ngày`);

// ============================================================
// Main page
// ============================================================
export const Liabilities: React.FC = () => {
  const [overview, setOverview] = useState<LiabilityOverview | null>(null);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeTab, setTypeTab] = useState<'' | LiabilityType>('');
  const [statusFilter, setStatusFilter] = useState<'' | LiabilityStatus>('');

  const [formTarget, setFormTarget] = useState<Liability | 'new' | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Liability | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeTab) params.set('type', typeTab);
      if (statusFilter) params.set('status', statusFilter);
      const query = params.toString();
      const [overviewData, listData] = await Promise.all([
        api.get(`${BASE}/overview?days=30`),
        api.get(query ? `${BASE}?${query}` : BASE)
      ]);
      setOverview(overviewData);
      setLiabilities(listData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [typeTab, statusFilter]);

  // Refresh list/overview and any open detail view after a mutation
  const handleChanged = async () => {
    setDetailVersion(v => v + 1);
    await loadData();
  };

  const showConfirm = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmDialog({ title, message, action });
  };

  const handleConfirmAction = async () => {
    if (confirmDialog) {
      await confirmDialog.action();
      setConfirmDialog(null);
    }
  };

  const handleDelete = (l: Liability) => {
    showConfirm(
      'Xóa khoản nợ',
      `Bạn có chắc muốn xóa "${l.name} - ${l.institutionName}"?`,
      async () => {
        try {
          await api.delete(`${BASE}/${l.id}`);
          if (detailId === l.id) setDetailId(null);
          await loadData();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa khoản nợ thất bại'));
        }
      }
    );
  };

  return (
    <div>
      <header className="flex justify-between align-center mb-4" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0, fontWeight: '700' }}>Khoản vay & Thẻ tín dụng</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Theo dõi dư nợ, hạn mức, kỳ đến hạn và lịch sử thanh toán</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormTarget('new')}>
          <Plus size={16} />
          <span>Thêm khoản nợ</span>
        </button>
      </header>

      {/* Overview (§6.4) */}
      {overview && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Tổng dư nợ" value={fmtMoney(overview.totalOutstanding)} hint={`Vay: ${fmtMoney(overview.totalLoanOutstanding)} · Thẻ: ${fmtMoney(overview.totalCardOutstanding)}`} />
            <StatCard label="Tổng hạn mức thẻ" value={fmtMoney(overview.totalCreditLimit)} />
            <StatCard label="Hạn mức còn lại" value={fmtMoney(overview.totalAvailableCredit)} color="var(--success)" />
            <StatCard label="Phí/lãi dự kiến tháng này" value={fmtMoney(overview.estimatedMonthlyCharges)} color="var(--warning)" />
          </div>

          <div className="card mt-4">
            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }} className="flex align-center gap-2">
              <CalendarClock size={18} /> Sắp đến hạn (30 ngày tới)
            </h3>
            {overview.upcoming.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Không có khoản nào đến hạn.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {overview.upcoming.map(u => {
                  const urgent = u.daysUntilDue <= 3;
                  return (
                    <div
                      key={u.id}
                      className="flex justify-between align-center"
                      onClick={() => setDetailId(u.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${urgent ? 'var(--danger)' : 'var(--border-color)'}`,
                        backgroundColor: urgent ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'transparent',
                        cursor: 'pointer',
                        gap: '12px'
                      }}
                    >
                      <div className="flex align-center gap-2" style={{ minWidth: 0 }}>
                        {u.type === 'LOAN' ? <Landmark size={16} /> : <CreditCard size={16} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.institutionName} · {fmtDate(u.dueDate)}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmtMoney(u.amount)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: urgent ? 'var(--danger)' : 'var(--text-muted)' }}>{dueText(u.daysUntilDue)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* List (§6.5) */}
      <div className="flex justify-between align-center mt-4" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="tabs" style={{ flexGrow: 1 }}>
          {(['', 'LOAN', 'CREDIT_CARD'] as const).map(t => (
            <button key={t || 'all'} className={`tab ${typeTab === t ? 'active' : ''}`} onClick={() => setTypeTab(t)}>
              {t ? TYPE_LABELS[t] : 'Tất cả'}
            </button>
          ))}
        </div>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | LiabilityStatus)}
        >
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABELS) as LiabilityStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading && liabilities.length === 0 ? (
        <div className="loading-container card mt-4">
          <span className="spinner"></span>
          <span>Đang tải danh sách khoản nợ...</span>
        </div>
      ) : liabilities.length === 0 ? (
        <div className="empty-state mt-4">
          <Banknote className="empty-state-icon" size={32} />
          <p>Chưa có khoản nợ nào. Nhấn "Thêm khoản nợ" để bắt đầu theo dõi.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mt-4">
          {liabilities.map(l => (
            <LiabilityCard
              key={l.id}
              liability={l}
              onOpen={() => setDetailId(l.id)}
              onPay={() => setPaymentTarget(l)}
              onEdit={() => setFormTarget(l)}
              onDelete={() => handleDelete(l)}
            />
          ))}
        </div>
      )}

      {detailId && (
        <LiabilityDetailModal
          id={detailId}
          version={detailVersion}
          onClose={() => setDetailId(null)}
          onPay={(l) => setPaymentTarget(l)}
          onEdit={(l) => setFormTarget(l)}
          onChanged={handleChanged}
          showConfirm={showConfirm}
        />
      )}

      {formTarget && (
        <LiabilityFormModal
          liability={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={async () => {
            setFormTarget(null);
            await handleChanged();
          }}
        />
      )}

      {paymentTarget && (
        <PaymentFormModal
          liability={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={async () => {
            setPaymentTarget(null);
            await handleChanged();
          }}
        />
      )}

      {confirmDialog && (
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

// ============================================================
// Presentational pieces
// ============================================================
const StatCard: React.FC<{ label: string; value: string; hint?: string; color?: string }> = ({ label, value, hint, color }) => (
  <div className="card">
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '4px', color: color || 'var(--text-main)' }}>{value}</div>
    {hint && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
  </div>
);

const ProgressLine: React.FC<{ percent: number | null; danger?: boolean }> = ({ percent, danger }) => {
  const value = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div className="progress-bar-container">
      <div className="progress-bar-fill" style={{ width: `${value}%`, backgroundColor: danger ? 'var(--danger)' : 'var(--primary)' }} />
    </div>
  );
};

const LiabilityBadges: React.FC<{ liability: Liability }> = ({ liability: l }) => (
  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
    <span className={`badge ${STATUS_BADGE[l.status]}`}>{STATUS_LABELS[l.status]}</span>
    {l.status === 'ACTIVE' && l.summary.paidThisCycle && (
      <span className="badge badge-success"><CheckCircle2 size={12} /> Đã thanh toán kỳ này</span>
    )}
  </div>
);

const SummaryLine: React.FC<{ liability: Liability }> = ({ liability: l }) => {
  const s = l.summary;
  if (l.type === 'LOAN') {
    return (
      <span>
        Còn <b>{s.remainingInstallments ?? '-'}</b> kỳ · <b>{fmtMoney(s.nextPaymentAmount)}</b> vào <b>{fmtDate(s.nextDueDate)}</b>
      </span>
    );
  }
  return (
    <span>
      Còn trống <b>{fmtMoney(s.availableCredit)}</b> · Phí đáo <b>{fmtMoney(s.estimatedMonthlyCharge)}</b> ngày <b>{fmtDate(s.nextDueDate)}</b>
    </span>
  );
};

const LiabilityCard: React.FC<{
  liability: Liability;
  onOpen: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ liability: l, onOpen, onPay, onEdit, onDelete }) => {
  const isLoan = l.type === 'LOAN';
  const percent = isLoan ? l.summary.progressPercent : l.summary.utilizationPercent;
  const accent = l.color || (isLoan ? 'var(--primary)' : 'var(--warning)');
  const urgent = l.status === 'ACTIVE' && l.summary.daysUntilDue <= 3;

  return (
    <div className="card card-hover flex flex-col gap-2" style={{ borderTop: `4px solid ${accent}`, cursor: 'pointer' }} onClick={onOpen}>
      <div className="flex justify-between align-center" style={{ gap: '8px' }}>
        <div className="flex align-center gap-2" style={{ minWidth: 0 }}>
          {isLoan ? <Landmark size={18} style={{ color: accent }} /> : <CreditCard size={18} style={{ color: accent }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{l.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.institutionName} · {TYPE_LABELS[l.type]}</div>
          </div>
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={onEdit} title="Sửa"><Pencil size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={onDelete} title="Xóa" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
        </div>
      </div>

      <LiabilityBadges liability={l} />

      <div className="flex justify-between align-center" style={{ marginTop: '4px' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Dư nợ hiện tại</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{fmtMoney(l.outstandingBalance)}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {isLoan
            ? <>Đã góp {l.paidInstallments}/{l.totalInstallments ?? '-'} kỳ</>
            : <>Hạn mức {fmtMoney(l.creditLimit)}</>}
          <div style={{ fontWeight: 600 }}>{percent ?? 0}%{isLoan ? ' hoàn thành' : ' đã dùng'}</div>
        </div>
      </div>

      <ProgressLine percent={percent} danger={!isLoan && (percent ?? 0) > 80} />

      {l.status === 'ACTIVE' && (
        <div className="flex justify-between align-center" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', gap: '8px', flexWrap: 'wrap' }}>
          <SummaryLine liability={l} />
          <span style={{ fontWeight: 600, color: urgent ? 'var(--danger)' : 'var(--text-muted)' }}>{dueText(l.summary.daysUntilDue)}</span>
        </div>
      )}

      {l.status === 'ACTIVE' && (
        <button
          className="btn btn-primary btn-sm"
          style={{ alignSelf: 'flex-start', marginTop: '4px' }}
          onClick={(e) => { e.stopPropagation(); onPay(); }}
        >
          <Banknote size={14} />
          <span>Thanh toán</span>
        </button>
      )}
    </div>
  );
};

// ============================================================
// Create / update liability (§6.3, §6.7)
// ============================================================
const LiabilityFormModal: React.FC<{
  liability: Liability | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ liability, onClose, onSaved }) => {
  const isEdit = !!liability;
  const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  // Money inputs hold whole-VND digits only
  const money = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Math.round(v)));

  const [type, setType] = useState<LiabilityType>(liability?.type || 'LOAN');
  const [name, setName] = useState(liability?.name || '');
  const [institutionName, setInstitutionName] = useState(liability?.institutionName || '');
  const [dueDay, setDueDay] = useState(str(liability?.dueDay));
  const [principalAmount, setPrincipalAmount] = useState(money(liability?.principalAmount));
  const [creditLimit, setCreditLimit] = useState(money(liability?.creditLimit));
  const [outstandingBalance, setOutstandingBalance] = useState(money(liability?.outstandingBalance));
  const [installmentAmount, setInstallmentAmount] = useState(money(liability?.installmentAmount));
  const [totalInstallments, setTotalInstallments] = useState(str(liability?.totalInstallments));
  const [paidInstallments, setPaidInstallments] = useState(str(liability?.paidInstallments));
  const [monthlyRate, setMonthlyRate] = useState(str(liability?.monthlyRate));
  const [startDate, setStartDate] = useState(liability?.startDate ? liability.startDate.slice(0, 10) : '');
  const [color, setColor] = useState(liability?.color || '#71717a');
  const [status, setStatus] = useState<LiabilityStatus>(liability?.status || 'ACTIVE');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isLoan = type === 'LOAN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Record<string, any> = {
      name: name.trim(),
      institutionName: institutionName.trim(),
      dueDay: numOrUndef(dueDay),
      outstandingBalance: numOrUndef(outstandingBalance),
      monthlyRate: numOrUndef(monthlyRate),
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      color
    };
    if (isLoan) {
      Object.assign(payload, {
        principalAmount: numOrUndef(principalAmount),
        installmentAmount: numOrUndef(installmentAmount),
        totalInstallments: numOrUndef(totalInstallments),
        paidInstallments: numOrUndef(paidInstallments)
      });
    } else {
      payload.creditLimit = numOrUndef(creditLimit);
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`${BASE}/${liability!.id}`, { ...payload, status });
      } else {
        await api.post(BASE, { ...payload, type, currency: 'VND' });
      }
      await onSaved();
    } catch (err) {
      setError(getErrorMessage(err, isEdit ? 'Cập nhật thất bại' : 'Tạo khoản nợ thất bại'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{isEdit ? 'Cập nhật khoản nợ' : 'Thêm khoản nợ mới'}</h3>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert-banner alert-banner-danger" style={{ whiteSpace: 'pre-line' }}><AlertCircle size={16} />{error}</div>}

            {!isEdit && (
              <div className="tabs mb-4">
                {(['LOAN', 'CREDIT_CARD'] as const).map(t => (
                  <button type="button" key={t} className={`tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                    {t === 'LOAN' ? <Landmark size={14} /> : <CreditCard size={14} />} {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Tên <span className="form-required">*</span></label>
                <input className="form-input" required placeholder={isLoan ? 'Vay tiêu dùng' : 'Thẻ tín dụng'} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Ngân hàng / Tổ chức <span className="form-required">*</span></label>
                <input className="form-input" required placeholder="Cake Bank" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
              </div>
            </div>

            {isLoan ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Số tiền vay gốc (VND) <span className="form-required">*</span></label>
                    <MoneyInput required placeholder="10.000.000" value={principalAmount} onChange={setPrincipalAmount} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tiền góp mỗi kỳ (VND)</label>
                    <MoneyInput placeholder="2.500.000" value={installmentAmount} onChange={setInstallmentAmount} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Tổng số kỳ</label>
                    <input type="number" min={1} step={1} className="form-input" placeholder="12" value={totalInstallments} onChange={(e) => setTotalInstallments(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số kỳ đã góp</label>
                    <input type="number" min={0} step={1} className="form-input" placeholder="0" value={paidInstallments} onChange={(e) => setPaidInstallments(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Hạn mức thẻ (VND) <span className="form-required">*</span></label>
                <MoneyInput required placeholder="30.000.000" value={creditLimit} onChange={setCreditLimit} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Dư nợ hiện tại (VND)</label>
                <MoneyInput placeholder={isLoan ? 'Tự tính nếu bỏ trống' : '0'} value={outstandingBalance} onChange={setOutstandingBalance} />
              </div>
              <div className="form-group">
                <label className="form-label">{isLoan ? 'Lãi suất' : 'Phí đáo / lãi'} (% / tháng)</label>
                <input type="number" min={0} step="0.01" className="form-input" placeholder="1.7" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Ngày thanh toán hằng tháng <span className="form-required">*</span></label>
                <input type="number" min={1} max={31} step={1} className="form-input" required placeholder="15" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày bắt đầu</label>
                <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Màu sắc</label>
                <input type="color" className="form-input" style={{ height: '42px', padding: '2px' }} value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              {isEdit && (
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as LiabilityStatus)}>
                    {(Object.keys(STATUS_LABELS) as LiabilityStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu lại'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// Record payment (§6.9)
// ============================================================
const flattenExpenseCategories = (nodes: any[], depth = 0): { id: string; label: string }[] =>
  (nodes || []).flatMap(c => [
    ...(c.type === 'EXPENSE' ? [{ id: c.id, label: `${'— '.repeat(depth)}${c.name}` }] : []),
    ...flattenExpenseCategories(c.children || [], depth + 1)
  ]);

const PaymentFormModal: React.FC<{
  liability: Liability;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ liability: l, onClose, onSaved }) => {
  const [type, setType] = useState<LiabilityPaymentType>(l.type === 'LOAN' ? 'INSTALLMENT' : 'FEE');
  const [amount, setAmount] = useState(l.summary.nextPaymentAmount ? String(Math.round(l.summary.nextPaymentAmount)) : '');
  const [principalPart, setPrincipalPart] = useState('');
  const [paidAt, setPaidAt] = useState(toLocalInput());
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [wallets, setWallets] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reducesDebt = type === 'INSTALLMENT' || type === 'PREPAYMENT';

  useEffect(() => {
    api.get('/api/finance/wallets').then(setWallets).catch(console.error);
    api.get('/api/finance/categories')
      .then((data: any[]) => setCategories(flattenExpenseCategories(data)))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (walletId && !categoryId) {
      setError('Vui lòng chọn danh mục chi khi thanh toán từ ví');
      return;
    }
    setSaving(true);
    try {
      await api.post(`${BASE}/${l.id}/payments`, {
        type,
        amount: Number(amount),
        principalPart: reducesDebt ? numOrUndef(principalPart) : undefined,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
        note: note.trim() || undefined,
        walletId: walletId || undefined,
        categoryId: walletId ? categoryId : undefined
      });
      await onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Ghi nhận thanh toán thất bại'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Ghi nhận thanh toán</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.name} · {l.institutionName} · Dư nợ {fmtMoney(l.outstandingBalance)}</div>
          </div>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert-banner alert-banner-danger" style={{ whiteSpace: 'pre-line' }}><AlertCircle size={16} />{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Loại thanh toán <span className="form-required">*</span></label>
                <select className="form-input" value={type} onChange={(e) => setType(e.target.value as LiabilityPaymentType)}>
                  {(Object.keys(PAYMENT_TYPE_LABELS) as LiabilityPaymentType[]).map(t => (
                    <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Số tiền (VND) <span className="form-required">*</span></label>
                <MoneyInput required value={amount} onChange={setAmount} />
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              {reducesDebt
                ? type === 'INSTALLMENT' && l.type === 'LOAN'
                  ? 'Trừ vào dư nợ và tăng số kỳ đã góp thêm 1.'
                  : 'Trừ vào dư nợ, không tăng số kỳ.'
                : 'Không trừ vào dư nợ.'}
            </p>

            <div className="grid grid-cols-2 gap-4">
              {reducesDebt && (
                <div className="form-group">
                  <label className="form-label">Phần trừ dư nợ (VND)</label>
                  <MoneyInput placeholder="Mặc định = số tiền" value={principalPart} onChange={setPrincipalPart} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Thời điểm thanh toán</label>
                <input type="datetime-local" className="form-input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <input className="form-input" placeholder="Phí đáo tháng 10..." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Trừ tiền từ ví</label>
                <select className="form-input" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                  <option value="">Không trừ ví</option>
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({fmtMoney(w.currentBalance)})</option>
                  ))}
                </select>
              </div>
              {walletId && (
                <div className="form-group">
                  <label className="form-label">Danh mục chi <span className="form-required">*</span></label>
                  <select className="form-input" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// Detail: info + payment history + notes (§6.6, §6.10–6.13)
// ============================================================
const LiabilityDetailModal: React.FC<{
  id: string;
  version: number;
  onClose: () => void;
  onPay: (l: Liability) => void;
  onEdit: (l: Liability) => void;
  onChanged: () => Promise<void>;
  showConfirm: (title: string, message: string, action: () => Promise<void>) => void;
}> = ({ id, version, onClose, onPay, onEdit, onChanged, showConfirm }) => {
  const [liability, setLiability] = useState<Liability | null>(null);
  const [error, setError] = useState('');
  const [noteForm, setNoteForm] = useState<LiabilityNote | 'new' | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`${BASE}/${id}`)
      .then((data) => { if (!cancelled) { setLiability(data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Không tải được chi tiết')); });
    return () => { cancelled = true; };
  }, [id, version]);

  const handleDeletePayment = (p: LiabilityPayment) => {
    showConfirm(
      'Xóa thanh toán',
      `Xóa khoản ${PAYMENT_TYPE_LABELS[p.type].toLowerCase()} ${fmtMoney(p.amount)}? Dư nợ, số kỳ và tiền trong ví liên kết sẽ được hoàn tác.`,
      async () => {
        try {
          await api.delete(`${BASE}/${id}/payments/${p.id}`);
          await onChanged();
        } catch (err) {
          alert(getErrorMessage(err, 'Xóa thanh toán thất bại'));
        }
      }
    );
  };

  const handleDeleteNote = (n: LiabilityNote) => {
    showConfirm('Xóa ghi chú', `Xóa vĩnh viễn ghi chú "${n.title}"?`, async () => {
      try {
        await api.delete(`${BASE}/${id}/notes/${n.id}`);
        await onChanged();
      } catch (err) {
        alert(getErrorMessage(err, 'Xóa ghi chú thất bại'));
      }
    });
  };

  const handleTogglePin = async (n: LiabilityNote) => {
    try {
      await api.patch(`${BASE}/${id}/notes/${n.id}`, { isPinned: !n.isPinned });
      await onChanged();
    } catch (err) {
      alert(getErrorMessage(err, 'Cập nhật ghi chú thất bại'));
    }
  };

  const l = liability;
  const isLoan = l?.type === 'LOAN';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '820px' }}>
        <div className="modal-header">
          <div className="flex align-center gap-2" style={{ minWidth: 0 }}>
            {l && (isLoan ? <Landmark size={20} /> : <CreditCard size={20} />)}
            <div>
              <h3 style={{ margin: 0 }}>{l ? l.name : 'Chi tiết khoản nợ'}</h3>
              {l && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.institutionName} · {TYPE_LABELS[l.type]}</div>}
            </div>
          </div>
          <button className="hamburger-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="alert-banner alert-banner-danger"><AlertCircle size={16} />{error}</div>}
          {!l && !error && (
            <div className="loading-container"><span className="spinner"></span><span>Đang tải...</span></div>
          )}

          {l && (
            <>
              <div className="flex justify-between align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <LiabilityBadges liability={l} />
                <div className="flex gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => onEdit(l)}><Pencil size={14} /><span>Sửa</span></button>
                  {l.status === 'ACTIVE' && (
                    <button className="btn btn-primary btn-sm" onClick={() => onPay(l)}><Banknote size={14} /><span>Thanh toán</span></button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <InfoItem label="Dư nợ hiện tại" value={fmtMoney(l.outstandingBalance)} strong />
                {isLoan ? (
                  <>
                    <InfoItem label="Số tiền vay gốc" value={fmtMoney(l.principalAmount)} />
                    <InfoItem label="Góp mỗi kỳ" value={fmtMoney(l.installmentAmount)} />
                    <InfoItem label="Tiến độ" value={`${l.paidInstallments}/${l.totalInstallments ?? '-'} kỳ (${l.summary.progressPercent ?? 0}%)`} />
                    <InfoItem label="Kỳ còn lại" value={String(l.summary.remainingInstallments ?? '-')} />
                  </>
                ) : (
                  <>
                    <InfoItem label="Hạn mức" value={fmtMoney(l.creditLimit)} />
                    <InfoItem label="Hạn mức còn lại" value={fmtMoney(l.summary.availableCredit)} />
                    <InfoItem label="Đã dùng" value={`${l.summary.utilizationPercent ?? 0}%`} />
                    <InfoItem label="Phí/lãi ước tính tháng" value={fmtMoney(l.summary.estimatedMonthlyCharge)} />
                  </>
                )}
                <InfoItem label="Lãi/phí mỗi tháng" value={l.monthlyRate !== null ? `${l.monthlyRate}%` : '-'} />
                <InfoItem label="Ngày thanh toán" value={`Ngày ${l.dueDay} hằng tháng`} />
                {l.status === 'ACTIVE' && (
                  <InfoItem
                    label="Kỳ tới"
                    value={`${fmtDate(l.summary.nextDueDate)} · ${fmtMoney(l.summary.nextPaymentAmount)}`}
                    hint={dueText(l.summary.daysUntilDue)}
                    danger={l.summary.daysUntilDue <= 3}
                  />
                )}
                {l.startDate && <InfoItem label="Ngày bắt đầu" value={fmtDate(l.startDate)} />}
              </div>

              <ProgressLine
                percent={isLoan ? l.summary.progressPercent : l.summary.utilizationPercent}
                danger={!isLoan && (l.summary.utilizationPercent ?? 0) > 80}
              />

              {/* Payments */}
              <h4 style={{ fontSize: '0.95rem', margin: '24px 0 0' }} className="flex align-center gap-2">
                <Banknote size={16} /> Lịch sử thanh toán ({l.payments.length})
              </h4>
              <div className="table-container table-responsive-card" style={{ marginTop: '8px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Loại</th>
                      <th>Số tiền</th>
                      <th>Trừ dư nợ</th>
                      <th>Ghi chú</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Chưa có thanh toán nào.</td>
                      </tr>
                    ) : (
                      l.payments.map(p => (
                        <tr key={p.id}>
                          <td data-label="Thời gian" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtDateTime(p.paidAt)}</td>
                          <td data-label="Loại"><span className="badge badge-info">{PAYMENT_TYPE_LABELS[p.type]}</span></td>
                          <td data-label="Số tiền" style={{ fontWeight: 700 }}>{fmtMoney(p.amount)}</td>
                          <td data-label="Trừ dư nợ">{p.principalPart ? fmtMoney(p.principalPart) : '-'}</td>
                          <td data-label="Ghi chú" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {p.note || '-'}
                            {p.walletId && <div style={{ fontSize: '0.7rem' }}>Đã trừ từ ví</div>}
                          </td>
                          <td data-label="Hành động">
                            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeletePayment(p)} title="Xóa (nhập nhầm)">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div className="flex justify-between align-center" style={{ margin: '24px 0 8px' }}>
                <h4 style={{ fontSize: '0.95rem', margin: 0 }} className="flex align-center gap-2">
                  <StickyNote size={16} /> Ghi chú ({l.notes.length})
                </h4>
                {noteForm !== 'new' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setNoteForm('new')}><Plus size={14} /><span>Thêm ghi chú</span></button>
                )}
              </div>

              {noteForm === 'new' && (
                <NoteForm
                  liabilityId={l.id}
                  note={null}
                  onCancel={() => setNoteForm(null)}
                  onSaved={async () => { setNoteForm(null); await onChanged(); }}
                />
              )}

              <div className="flex flex-col gap-2">
                {l.notes.length === 0 && noteForm !== 'new' && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chưa có ghi chú.</p>
                )}
                {l.notes.map(n => (
                  noteForm !== 'new' && noteForm?.id === n.id ? (
                    <NoteForm
                      key={n.id}
                      liabilityId={l.id}
                      note={n}
                      onCancel={() => setNoteForm(null)}
                      onSaved={async () => { setNoteForm(null); await onChanged(); }}
                    />
                  ) : (
                    <div
                      key={n.id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${n.isPinned ? 'var(--primary)' : 'var(--border-color)'}`,
                        backgroundColor: n.isPinned ? 'var(--primary-light)' : 'transparent'
                      }}
                    >
                      <div className="flex justify-between align-center" style={{ gap: '8px' }}>
                        <div className="flex align-center gap-2" style={{ fontWeight: 600, fontSize: '0.9rem', minWidth: 0 }}>
                          {n.isPinned && <Pin size={14} style={{ color: 'var(--primary)' }} />}
                          {n.hasSecret && <Lock size={14} style={{ color: 'var(--warning)' }} />}
                          <span>{n.title}</span>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-secondary btn-sm" onClick={() => handleTogglePin(n)} title={n.isPinned ? 'Bỏ ghim' : 'Ghim'}>
                            {n.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setNoteForm(n)} title="Sửa"><Pencil size={14} /></button>
                          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteNote(n)} title="Xóa"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      {n.content && <p style={{ fontSize: '0.85rem', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{n.content}</p>}
                      {n.hasSecret && <SecretReveal liabilityId={l.id} noteId={n.id} />}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {n.remindAt && <span>⏰ Nhắc lúc {fmtDateTime(n.remindAt)} · </span>}
                        Cập nhật {fmtDateTime(n.updatedAt)}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoItem: React.FC<{ label: string; value: string; hint?: string; strong?: boolean; danger?: boolean }> = ({ label, value, hint, strong, danger }) => (
  <div>
    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: strong ? '1.2rem' : '0.9rem', fontWeight: strong ? 700 : 600 }}>{value}</div>
    {hint && <div style={{ fontSize: '0.7rem', fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--text-muted)' }}>{hint}</div>}
  </div>
);

// Secret is fetched on demand (§6.13), kept only in local state and auto-hidden
const SECRET_VISIBLE_MS = 10000;

const SecretReveal: React.FC<{ liabilityId: string; noteId: string }> = ({ liabilityId, noteId }) => {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setSecret(null);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const reveal = async () => {
    setLoading(true);
    try {
      const data = await api.get(`${BASE}/${liabilityId}/notes/${noteId}/secret`, { noCache: true });
      setSecret(data.secret);
      timerRef.current = setTimeout(hide, SECRET_VISIBLE_MS);
    } catch (err) {
      alert(getErrorMessage(err, 'Không thể xem bí mật'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex align-center gap-2" style={{ marginTop: '6px', fontSize: '0.85rem' }}>
      <Lock size={14} style={{ color: 'var(--text-muted)' }} />
      <code style={{ fontFamily: 'monospace', letterSpacing: secret ? 'normal' : '2px' }}>{secret ?? '••••••'}</code>
      <button className="btn btn-secondary btn-sm" onClick={secret ? hide : reveal} disabled={loading} style={{ padding: '2px 8px' }}>
        {secret ? <EyeOff size={14} /> : <Eye size={14} />}
        <span>{loading ? '...' : secret ? 'Ẩn' : 'Hiện'}</span>
      </button>
    </div>
  );
};

const NoteForm: React.FC<{
  liabilityId: string;
  note: LiabilityNote | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}> = ({ liabilityId, note, onCancel, onSaved }) => {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [secret, setSecret] = useState('');
  const [removeSecret, setRemoveSecret] = useState(false);
  const [remindAt, setRemindAt] = useState(note?.remindAt ? toLocalInput(note.remindAt) : '');
  const [isPinned, setIsPinned] = useState(note?.isPinned || false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Record<string, any> = {
      title: title.trim(),
      content: note ? content : content.trim() || undefined,
      remindAt: remindAt ? new Date(remindAt).toISOString() : undefined,
      isPinned
    };
    // secret: omitted → unchanged, new string → replace, "" → remove (§6.12)
    if (removeSecret) payload.secret = '';
    else if (secret) payload.secret = secret;

    setSaving(true);
    try {
      if (note) {
        await api.patch(`${BASE}/${liabilityId}/notes/${note.id}`, payload);
      } else {
        await api.post(`${BASE}/${liabilityId}/notes`, payload);
      }
      await onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Lưu ghi chú thất bại'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-2" style={{ padding: '16px' }}>
      {error && <div className="alert-banner alert-banner-danger" style={{ whiteSpace: 'pre-line' }}><AlertCircle size={16} />{error}</div>}
      <div className="form-group">
        <label className="form-label">Tiêu đề <span className="form-required">*</span></label>
        <input className="form-input" required placeholder="Cần thanh toán sớm trước tháng 12" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Nội dung</label>
        <textarea className="form-input" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="form-label flex align-center gap-2"><Lock size={12} /> Bí mật (mật khẩu, PIN...)</label>
          <input
            type="password"
            autoComplete="new-password"
            className="form-input"
            disabled={removeSecret}
            placeholder={note?.hasSecret ? 'Để trống = giữ nguyên' : 'Được mã hoá khi lưu'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          {note?.hasSecret && (
            <label className="flex align-center gap-2" style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={removeSecret} onChange={(e) => setRemoveSecret(e.target.checked)} />
              Xóa bí mật hiện tại
            </label>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Nhắc lúc</label>
          <input type="datetime-local" className="form-input" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
        </div>
      </div>
      <label className="flex align-center gap-2" style={{ fontSize: '0.85rem', marginBottom: '12px' }}>
        <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
        Ghim ghi chú
      </label>
      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Hủy</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu ghi chú'}</button>
      </div>
    </form>
  );
};
