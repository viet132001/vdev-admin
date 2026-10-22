// localStorage mock for the Liabilities API (/api/finance/liabilities) — mirrors src/doc/finance-api.md section 6

const STORAGE_KEY = 'mock_liabilities';
const BASE = '/api/finance/liabilities';
const DAY_MS = 24 * 60 * 60 * 1000;

const genId = () => Math.random().toString(36).substring(2, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

const fail = (message: string, errorCode = 'BAD_REQUEST'): never => {
  throw new Error(JSON.stringify({ success: false, message, errorCode, errors: [] }));
};

const load = (): any[] => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
const save = (items: any[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

const seed = () => {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const now = new Date().toISOString();
  const base = { ownerId: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12', currency: 'VND', startDate: null, icon: null, color: null, createdAt: now, updatedAt: now, deletedAt: null, payments: [], notes: [] };
  save([
    {
      ...base, id: 'lb-card-1', type: 'CREDIT_CARD', status: 'ACTIVE', name: 'Thẻ tín dụng', institutionName: 'Cake Bank',
      principalAmount: null, creditLimit: 30000000, outstandingBalance: 25000000, installmentAmount: null,
      totalInstallments: null, paidInstallments: 0, monthlyRate: 1.7, dueDay: 30
    },
    {
      ...base, id: 'lb-loan-1', type: 'LOAN', status: 'ACTIVE', name: 'Vay tiêu dùng', institutionName: 'Cake Bank',
      principalAmount: 10000000, creditLimit: null, outstandingBalance: 2500000, installmentAmount: 2500000,
      totalInstallments: 4, paidInstallments: 3, monthlyRate: null, dueDay: 15
    }
  ]);
};

const dueDateOf = (year: number, month: number, dueDay: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dueDay, lastDay)));
};

const computeSummary = (l: any) => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  let y = today.getUTCFullYear();
  let m = today.getUTCMonth();
  let due = dueDateOf(y, m, l.dueDay);
  if (due < today) {
    m += 1;
    due = dueDateOf(y, m, l.dueDay);
  }
  const prevDue = dueDateOf(y, m - 1, l.dueDay);
  const paidThisCycle = (l.payments || []).some((p: any) => {
    const paidAt = new Date(p.paidAt);
    const qualifies = l.type === 'CREDIT_CARD' || p.type === 'INSTALLMENT';
    return qualifies && paidAt > prevDue && paidAt <= new Date(due.getTime() + DAY_MS);
  });
  if (paidThisCycle) due = dueDateOf(y, m + 1, l.dueDay);

  const outstanding = l.outstandingBalance || 0;
  const estimatedMonthlyCharge = Math.round((outstanding * (l.monthlyRate || 0)) / 100);
  const isLoan = l.type === 'LOAN';
  return {
    nextDueDate: due.toISOString(),
    daysUntilDue: Math.round((due.getTime() - today.getTime()) / DAY_MS),
    paidThisCycle,
    nextPaymentAmount: isLoan ? Math.min(l.installmentAmount || 0, outstanding) : estimatedMonthlyCharge,
    estimatedMonthlyCharge,
    remainingInstallments: isLoan && l.totalInstallments ? Math.max(l.totalInstallments - l.paidInstallments, 0) : null,
    progressPercent: isLoan && l.totalInstallments ? round2((l.paidInstallments / l.totalInstallments) * 100) : null,
    availableCredit: !isLoan ? (l.creditLimit || 0) - outstanding : null,
    utilizationPercent: !isLoan && l.creditLimit ? round2((outstanding / l.creditLimit) * 100) : null
  };
};

const toNote = ({ secret, ...note }: any) => ({ ...note, hasSecret: !!secret });

const sortNotes = (notes: any[]) =>
  [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.localeCompare(a.createdAt));

const sortPayments = (payments: any[]) => [...payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));

const present = (l: any, paymentLimit?: number) => {
  const payments = sortPayments(l.payments || []);
  return {
    ...l,
    payments: paymentLimit ? payments.slice(0, paymentLimit) : payments,
    notes: sortNotes(l.notes || []).map(toNote),
    summary: computeSummary(l)
  };
};

const findActive = (items: any[], id: string) => {
  const l = items.find(x => x.id === id && !x.deletedAt);
  if (!l) fail('Liability not found', 'NOT_FOUND');
  return l;
};

const validateAmounts = (l: any) => {
  if (l.type === 'LOAN' && (l.principalAmount === null || l.principalAmount === undefined)) fail('principalAmount is required for LOAN');
  if (l.type === 'CREDIT_CARD' && (l.creditLimit === null || l.creditLimit === undefined)) fail('creditLimit is required for CREDIT_CARD');
};

const adjustWallet = (walletId: string, delta: number) => {
  const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
  const w = wallets.find((x: any) => x.id === walletId);
  if (w) w.currentBalance += delta;
  localStorage.setItem('mock_wallets', JSON.stringify(wallets));
};

const NO_MATCH = Symbol('no-match');

const route = (method: string, rawUrl: string, body: any): any => {
  const urlObj = new URL(rawUrl, 'http://localhost');
  const path = urlObj.pathname;
  if (!path.startsWith(BASE)) return NO_MATCH;
  const parts = path.slice(BASE.length).split('/').filter(Boolean); // [id?, sub?, subId?, extra?]
  const items = load();
  const now = new Date().toISOString();

  // --- Collection-level ---
  if (parts.length === 0) {
    if (method === 'GET') {
      const type = urlObj.searchParams.get('type');
      const status = urlObj.searchParams.get('status');
      return items
        .filter(l => !l.deletedAt && (!type || l.type === type) && (!status || l.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(l => present(l, 5));
    }
    if (method === 'POST') {
      const l: any = {
        id: genId(), ownerId: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12', status: 'ACTIVE', currency: 'VND',
        principalAmount: null, creditLimit: null, installmentAmount: null, totalInstallments: null, paidInstallments: 0,
        monthlyRate: null, startDate: null, icon: null, color: null,
        ...body,
        createdAt: now, updatedAt: now, deletedAt: null, payments: [], notes: []
      };
      validateAmounts(l);
      if (body.outstandingBalance === undefined) {
        l.outstandingBalance = l.type === 'LOAN'
          ? Math.max((l.principalAmount || 0) - (l.installmentAmount || 0) * l.paidInstallments, 0)
          : 0;
      }
      items.unshift(l);
      save(items);
      return present(l);
    }
  }

  if (parts[0] === 'overview' && method === 'GET') {
    const days = parseInt(urlObj.searchParams.get('days') || '30', 10);
    const active = items.filter(l => !l.deletedAt && l.status === 'ACTIVE').map(l => present(l));
    const loans = active.filter(l => l.type === 'LOAN');
    const cards = active.filter(l => l.type === 'CREDIT_CARD');
    const sum = (arr: any[], fn: (l: any) => number) => arr.reduce((s, l) => s + (fn(l) || 0), 0);
    return {
      totalOutstanding: sum(active, l => l.outstandingBalance),
      totalLoanOutstanding: sum(loans, l => l.outstandingBalance),
      totalCreditLimit: sum(cards, l => l.creditLimit),
      totalCardOutstanding: sum(cards, l => l.outstandingBalance),
      totalAvailableCredit: sum(cards, l => l.summary.availableCredit),
      estimatedMonthlyCharges: sum(active, l => l.summary.estimatedMonthlyCharge),
      upcoming: active
        .filter(l => l.summary.daysUntilDue <= days)
        .sort((a, b) => a.summary.daysUntilDue - b.summary.daysUntilDue)
        .map(l => ({
          id: l.id, name: l.name, institutionName: l.institutionName, type: l.type,
          dueDate: l.summary.nextDueDate, daysUntilDue: l.summary.daysUntilDue, amount: l.summary.nextPaymentAmount
        }))
    };
  }

  const l = findActive(items, parts[0]);

  // --- Single liability ---
  if (parts.length === 1) {
    if (method === 'GET') return present(l);
    if (method === 'PATCH') {
      const { type: _ignored, ...changes } = body || {};
      Object.assign(l, changes, { updatedAt: now });
      validateAmounts(l);
      save(items);
      return present(l);
    }
    if (method === 'DELETE') {
      l.deletedAt = now;
      save(items);
      return { message: 'Liability soft deleted successfully' };
    }
  }

  // --- Payments ---
  if (parts[1] === 'payments') {
    if (parts.length === 2 && method === 'GET') {
      const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
      return sortPayments(l.payments || []).map(p => ({ ...p, wallet: wallets.find((w: any) => w.id === p.walletId) || null }));
    }
    if (parts.length === 2 && method === 'POST') {
      if (l.status !== 'ACTIVE') fail('Liability is not active');
      if (body.walletId && !body.categoryId) fail('categoryId is required when walletId is set');
      const reducesDebt = body.type === 'INSTALLMENT' || body.type === 'PREPAYMENT';
      const principalPart = reducesDebt ? Math.min(body.principalPart ?? body.amount, l.outstandingBalance) : 0;
      let transactionId = null;
      if (body.walletId) {
        const txs = JSON.parse(localStorage.getItem('mock_transactions') || '[]');
        transactionId = genId();
        txs.unshift({
          id: transactionId, walletId: body.walletId, categoryId: body.categoryId, amount: body.amount, type: 'EXPENSE',
          title: `Thanh toán ${l.name} - ${l.institutionName}`, note: body.note || '', transactionDate: body.paidAt || now
        });
        localStorage.setItem('mock_transactions', JSON.stringify(txs));
        adjustWallet(body.walletId, -body.amount);
      }
      const payment = {
        id: genId(), liabilityId: l.id, type: body.type, amount: body.amount, principalPart,
        paidAt: body.paidAt || now, note: body.note || null, walletId: body.walletId || null, transactionId, createdAt: now
      };
      l.payments = [...(l.payments || []), payment];
      l.outstandingBalance -= principalPart;
      if (l.type === 'LOAN' && body.type === 'INSTALLMENT') l.paidInstallments += 1;
      const loanDone = l.type === 'LOAN' && (l.outstandingBalance <= 0 || (l.totalInstallments && l.paidInstallments >= l.totalInstallments));
      if (loanDone) l.status = 'PAID_OFF';
      l.updatedAt = now;
      save(items);
      return payment;
    }
    if (parts.length === 3 && method === 'DELETE') {
      const payment = (l.payments || []).find((p: any) => p.id === parts[2]);
      if (!payment) fail('Payment not found', 'NOT_FOUND');
      l.payments = l.payments.filter((p: any) => p.id !== payment.id);
      l.outstandingBalance += payment.principalPart;
      if (l.type === 'LOAN' && payment.type === 'INSTALLMENT') l.paidInstallments = Math.max(l.paidInstallments - 1, 0);
      if (l.status === 'PAID_OFF') l.status = 'ACTIVE';
      if (payment.transactionId) {
        const txs = JSON.parse(localStorage.getItem('mock_transactions') || '[]');
        localStorage.setItem('mock_transactions', JSON.stringify(txs.filter((t: any) => t.id !== payment.transactionId)));
        adjustWallet(payment.walletId, payment.amount);
      }
      l.updatedAt = now;
      save(items);
      return { message: 'Payment deleted successfully' };
    }
  }

  // --- Notes ---
  if (parts[1] === 'notes') {
    l.notes = l.notes || [];
    if (parts.length === 2 && method === 'GET') return sortNotes(l.notes).map(toNote);
    if (parts.length === 2 && method === 'POST') {
      const note = {
        id: genId(), liabilityId: l.id, title: body.title, content: body.content || null, secret: body.secret || null,
        remindAt: body.remindAt || null, isPinned: !!body.isPinned, createdAt: now, updatedAt: now
      };
      l.notes.push(note);
      save(items);
      return toNote(note);
    }
    const note = l.notes.find((n: any) => n.id === parts[2]);
    if (!note) fail('Note not found', 'NOT_FOUND');
    if (parts.length === 4 && parts[3] === 'secret' && method === 'GET') {
      if (!note.secret) fail('Note has no secret', 'NOT_FOUND');
      return { secret: note.secret };
    }
    if (parts.length === 3 && method === 'PATCH') {
      const { secret, ...changes } = body || {};
      Object.assign(note, changes, { updatedAt: now });
      if (secret !== undefined) note.secret = secret === '' ? null : secret;
      save(items);
      return toNote(note);
    }
    if (parts.length === 3 && method === 'DELETE') {
      l.notes = l.notes.filter((n: any) => n.id !== note.id);
      save(items);
      return { message: 'Note deleted successfully' };
    }
  }

  return NO_MATCH;
};

/** Returns `{ handled: false }` when the URL is not a liabilities endpoint. */
export const mockLiabilities = (method: string, url: string, body?: any): { handled: boolean; data?: any } => {
  seed();
  const data = route(method, url, body);
  return data === NO_MATCH ? { handled: false } : { handled: true, data };
};
