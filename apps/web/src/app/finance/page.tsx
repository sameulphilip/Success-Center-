'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { AppDialog } from '@/components/AppDialog';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, getStoredUser } from '@/lib/api';

function hasPerm(permissions: string[] | undefined, code: string) {
  const set = new Set(permissions || []);
  if (set.has('*') || set.has('finance')) return true;
  if (code === 'finance.receipts' && set.has('finance.payments')) return true;
  return set.has(code);
}

function money(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-EG')} ج.م`;
}

function daySheetHref(ymd: string, autoPrint = false) {
  return `/finance/close/${ymd}/print${autoPrint ? '?print=1' : ''}`;
}

function cairoYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatArDay(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function diffTone(diff: number) {
  if (diff === 0) return 'text-emerald-700';
  if (diff < 0) return 'text-rose-700';
  return 'text-amber-800';
}

function formatDiff(diff: number) {
  if (diff === 0) return 'مطابق';
  return `${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString('en-EG')} ج.م`;
}

type FinanceSummary = {
  collectedToday: number;
  drawerCollectedToday?: number;
  collectedMonth: number;
  collectedAll: number;
  collectedAllBreakdown?: {
    total: number;
    centerTotal: number;
    rows: Array<{
      key: string;
      label: string;
      amount: number;
      centerShare: number;
      centerNote?: string;
      count: number;
    }>;
  };
  paymentsTodayCount: number;
  paymentsMonthCount: number;
  paymentCount: number;
  invoiceCount: number;
  outstandingAmount: number;
  outstandingStudents: number;
};

type ReceiptRow = {
  id: string;
  source: 'PAYMENT' | 'SESSION';
  student?: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    studentUid?: string | null;
  };
  receiptNumber: string;
  amount: string | number;
  method?: string;
  paidAt?: string;
  note?: string | null;
  reason: string;
  reasonDetail?: string;
};

type CashSnapshot = {
  businessDate: string;
  closed: boolean;
  collectedCash: number;
  collectedVodafone: number;
  collectedTotal: number;
  collectedBreakdown?: Array<{
    key: string;
    label: string;
    cash: number;
    vodafone: number;
    total: number;
  }>;
  drawerExpenses: number;
  drawerExpenseLines?: Array<{
    id: string;
    amount: number;
    category: string;
    note?: string | null;
  }>;
  expectedInDrawer: number;
  todayExpected?: number;
  carriedForward?: number;
  unclosedPrevious?: Array<{
    date: string;
    collectedCash: number;
    collectedVodafone: number;
    collectedTotal: number;
    drawerExpenses: number;
    expected: number;
    warnings?: {
      openSessions: number;
      pendingVodafone: number;
      unsettledTeachers: number;
      messages: string[];
      hasWarnings: boolean;
    };
  }>;
  closeWarnings?: {
    openSessions: number;
    pendingVodafone: number;
    unsettledTeachers: number;
    messages: string[];
    hasWarnings: boolean;
  };
  safeBalance: number;
  ownerBalance?: number;
  ownerExtraRevenue?: number;
  ownerNotReceived?: {
    inSafe: number;
    inDrawer: number;
    walletAvailable: number;
    teacherHoldCenterShare: number;
    total: number;
  };
  safeBreakdown?: {
    fromDayCloses: number;
    fromOnlineSafe: number;
    fromHandoutSafe: number;
    intoSafe: number;
    ownerAdvanceIn?: number;
    safeExpenses: number;
    handedToOwner: number;
    ownerAdvanceOut?: number;
    balance: number;
  };
  ownerAdvanceOutstanding?: number;
  ownerAdvances?: Array<{
    id: string;
    kind: 'IN' | 'OUT';
    amount: string | number;
    note?: string | null;
    createdAt: string;
  }>;
  safeComposition?: {
    method: 'fifo';
    note: string;
    remainingDayCloses: number;
    remainingOnline: number;
    remainingHandouts: number;
    remainingAdvances?: number;
    total: number;
    dayCloses: Array<{
      id: string;
      kindLabel: string;
      label: string;
      businessDate: string | null;
      at: string;
      original: number;
      remaining: number;
      detail?: string | null;
    }>;
    onlineSales: Array<{
      id: string;
      kindLabel: string;
      label: string;
      businessDate: string | null;
      at: string;
      original: number;
      remaining: number;
      detail?: string | null;
    }>;
    handoutSales: Array<{
      id: string;
      kindLabel: string;
      label: string;
      businessDate: string | null;
      at: string;
      original: number;
      remaining: number;
      detail?: string | null;
    }>;
    advances?: Array<{
      id: string;
      kindLabel: string;
      label: string;
      businessDate: string | null;
      at: string;
      original: number;
      remaining: number;
      detail?: string | null;
    }>;
  };
  safeExpenses?: Array<{
    id: string;
    amount: string | number;
    category: string;
    note?: string | null;
    businessDate?: string;
    createdAt: string;
    createdByName?: string | null;
  }>;
  teacherHoldCenterShare?: number;
  extraRevenueSales?: Array<{
    id: string;
    kind: 'online' | 'handout' | 'rental';
    kindLabel: string;
    title: string;
    detail?: string | null;
    amount: number;
    teacherShare?: number;
    grossAmount?: number;
    method: string;
    cashTo: 'DRAWER' | 'OWNER' | 'TEACHER_HOLD' | 'SAFE';
    at: string;
    receiptNumber?: string | null;
    soldByName?: string | null;
  }>;
  extraSettlements?: Array<{
    id: string;
    teacherId: string | null;
    teacherName: string;
    teacherPaid: number;
    centerToSafe: number;
    grossAmount: number;
    onlineCount: number;
    handoutCount: number;
    createdAt: string;
    settledByName?: string | null;
  }>;
  onlineFormWallet?: {
    confirmedAmount: number;
    pendingAmount: number;
    claimedAmount?: number;
    availableAmount?: number;
    confirmedCount: number;
    pendingCount: number;
    claimedCount?: number;
  };
  onlineFormsToday?: {
    count: number;
    amount: number;
    byForm: Array<{
      formId: string;
      label: string;
      count: number;
      amount: number;
      serials: number[];
    }>;
    items: Array<{
      id: string;
      formSerial: number | null;
      studentName: string;
      receiptNumber: string | null;
      amount: number;
      label: string;
    }>;
  };
  teacherHolds?: Array<{
    teacherId: string;
    teacherName: string;
    onlineCount: number;
    handoutCount: number;
    gross: number;
    teacherShare: number;
    centerShare: number;
    centerPendingInHold?: number;
    centerAlreadyInDrawer?: number;
  }>;
  teacherHoldTotal?: number;
  totalHandedToOwner?: number;
  ownerSpent?: number;
  viewerScope?: 'reception' | 'owner';
  canOwnerExpense?: boolean;
  categories: string[];
  close: {
    countedAmount: string | number;
    expectedAmount: string | number;
    difference: string | number;
    closedByName?: string | null;
    closedAt?: string;
    note?: string | null;
  } | null;
  expenses: Array<{
    id: string;
    amount: string | number;
    category: string;
    paidFrom: 'DRAWER' | 'SAFE' | 'OWNER';
    note?: string | null;
    businessDate?: string;
    createdAt: string;
    createdByName?: string | null;
  }>;
  handovers: Array<{
    id: string;
    amount: string | number;
    note?: string | null;
    createdAt: string;
    createdByName?: string | null;
  }>;
  closes: Array<{
    id: string;
    businessDate: string;
    countedAmount: string | number;
    expectedAmount: string | number;
    difference: string | number;
    vodafoneCollected: string | number;
    transferredToSafe?: string | number;
    closedAt: string;
    closedByName?: string | null;
  }>;
};

const reasonBadge: Record<string, string> = {
  'استمارة حجز': 'badge-navy',
  'حضور حصة': 'badge-ok',
  'اشتراك مجموعة': 'badge-gold',
  تحصيل: 'badge-warn',
};

const fromLabel: Record<string, string> = {
  DRAWER: 'درج اليوم',
  SAFE: 'الخزنة',
  OWNER: 'صاحب السنتر',
};

const extraCashToLabel: Record<string, string> = {
  DRAWER: 'الدرج',
  OWNER: 'صاحب السنتر',
  TEACHER_HOLD: 'حساب المدرس',
  SAFE: 'الخزنة',
};

function payMethodLabel(method?: string) {
  const m = String(method || '').toUpperCase();
  if (m.includes('VODAFONE')) return 'فودافون';
  return 'كاش';
}

function formatAuditAction(action: string) {
  switch (action) {
    case 'DAY_REOPENED':
      return 'فتح يوم مقفول';
    case 'SESSION_ENTRY_DELETED_AFTER_CLOSE':
      return 'مسح قيد بعد قفل الجلسة';
    case 'SESSION_UPDATED_AFTER_CLOSE':
      return 'تعديل جلسة مقفولة';
    case 'SESSION_DELETED_AFTER_CLOSE':
      return 'مسح جلسة مقفولة';
    case 'OWNER_ADVANCE_IN':
      return 'استلاف من صاحب السنتر';
    case 'OWNER_ADVANCE_OUT':
      return 'سداد استلاف لصاحب السنتر';
    default:
      return action;
  }
}

function closeWarningText(
  warnings?: {
    messages?: string[];
    hasWarnings?: boolean;
  } | null,
) {
  if (!warnings?.hasWarnings || !warnings.messages?.length) return '';
  return `تحذير: ${warnings.messages.join(' · ')}`;
}

export default function FinancePage() {
  const me = getStoredUser();
  const canReceipts = hasPerm(me?.permissions, 'finance.receipts');
  const canSafe = hasPerm(me?.permissions, 'finance.safe');
  const canClose = hasPerm(me?.permissions, 'finance.close');
  const isReception = me?.role === 'RECEPTION';
  const canOwnerExpense = !isReception;
  const canDelete =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';
  const canReopen = canDelete && canClose;
  const canOwnerAdvance = canDelete && canSafe;
  const [payments, setPayments] = useState<ReceiptRow[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [cash, setCash] = useState<CashSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [expForm, setExpForm] = useState({
    amount: '',
    category: 'مستلزمات',
    paidFrom: (me?.role === 'RECEPTION' ? 'DRAWER' : 'OWNER') as
      | 'DRAWER'
      | 'SAFE'
      | 'OWNER',
    note: '',
    businessDate: cairoYmd(),
  });
  const [counted, setCounted] = useState('');
  const [prevCounted, setPrevCounted] = useState<Record<string, string>>({});
  const [closeNote, setCloseNote] = useState('');
  const [closeDetailsOpen, setCloseDetailsOpen] = useState(true);
  const [handAmount, setHandAmount] = useState('');
  const [handNote, setHandNote] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [showExtraSales, setShowExtraSales] = useState(false);
  const [safeDetailOpen, setSafeDetailOpen] = useState(false);
  const [collectedAllOpen, setCollectedAllOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId?: string | null;
      details?: unknown;
      createdAt: string;
      userName?: string | null;
    }>
  >([]);
  const [tab, setTab] = useState<'receipts' | 'safe' | 'close'>(
    canReceipts ? 'receipts' : canSafe ? 'safe' : 'close',
  );
  const [reasonFilter, setReasonFilter] = useState<
    'all' | 'booking' | 'session' | 'other'
  >('all');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [confirm, setConfirm] = useState<null | {
    kind:
      | 'close'
      | 'reopen'
      | 'handover'
      | 'advance-in'
      | 'advance-out'
      | 'del-receipt'
      | 'del-expense'
      | 'del-extra'
      | 'settle-hold';
    id?: string;
    date?: string;
    source?: 'PAYMENT' | 'SESSION';
    extraKind?: 'online' | 'handout' | 'rental';
    teacherId?: string;
    teacherName?: string;
    teacherPaid?: number;
    centerToSafe?: number;
    label?: string;
  }>(null);

  const receiptCounts = useMemo(() => {
    const booking = payments.filter((p) => p.reason === 'استمارة حجز').length;
    const session = payments.filter((p) => p.reason === 'حضور حصة').length;
    return {
      total: payments.length,
      booking,
      session,
      other: Math.max(0, payments.length - booking - session),
    };
  }, [payments]);

  const visiblePayments = useMemo(() => {
    let rows = payments;
    if (reasonFilter === 'booking') {
      rows = rows.filter((p) => p.reason === 'استمارة حجز');
    } else if (reasonFilter === 'session') {
      rows = rows.filter((p) => p.reason === 'حضور حصة');
    } else if (reasonFilter === 'other') {
      rows = rows.filter(
        (p) => p.reason !== 'استمارة حجز' && p.reason !== 'حضور حصة',
      );
    }
    const q = receiptSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const name = `${p.student?.firstName || ''} ${p.student?.lastName || ''}`;
      const blob = [
        name,
        p.student?.phone || '',
        p.student?.studentUid || '',
        p.receiptNumber,
        p.reason,
        p.reasonDetail || '',
        p.method || '',
        p.note || '',
        String(p.amount),
        p.paidAt ? new Date(p.paidAt).toLocaleString('ar-EG') : '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [payments, reasonFilter, receiptSearch]);

  const pagedReceipts = usePaged(
    visiblePayments,
    `${reasonFilter}:${receiptSearch}`,
  );

  async function load() {
    const jobs: Promise<unknown>[] = [];
    if (canReceipts) {
      jobs.push(
        api<ReceiptRow[]>('/finance/payments').then(setPayments),
        api<FinanceSummary>('/finance/summary').then(setSummary),
      );
    }
    if (canSafe || canClose) {
      jobs.push(
        api<CashSnapshot>('/finance/cash/snapshot').then((snap) => {
          setCash(snap);
          const todayExp =
            snap.todayExpected ??
            Math.max(
              0,
              (snap.collectedTotal || 0) - (snap.drawerExpenses || 0),
            );
          if (!counted && snap && !snap.closed) {
            setCounted(String(Math.round(todayExp)));
          }
          setPrevCounted((curr) => {
            const next = { ...curr };
            for (const d of snap.unclosedPrevious || []) {
              if (!next[d.date]) {
                next[d.date] = String(Math.round(d.expected));
              }
            }
            return next;
          });
          if (!handAmount && snap) {
            setHandAmount(String(Math.round(snap.safeBalance)));
          }
        }),
      );
    }
    if (canReopen) {
      jobs.push(
        api<typeof auditLogs>('/finance/cash/audit-logs?limit=30').then(
          setAuditLogs,
        ),
      );
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    if (failed) {
      setError(
        failed.reason instanceof Error ? failed.reason.message : 'فشل التحميل',
      );
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'فشل التحميل'));
  }, []);

  const prevDays = cash?.unclosedPrevious ?? [];
  const todayClosed = !!cash?.closed;
  const todayExpected =
    cash?.todayExpected ??
    (todayClosed
      ? 0
      : (cash?.collectedTotal ?? 0) - (cash?.drawerExpenses ?? 0));
  const countedN = Number(counted);
  const closeDiff = useMemo(() => {
    if (!Number.isFinite(countedN)) return 0;
    return countedN - todayExpected;
  }, [countedN, todayExpected]);

  const extraSales = cash?.extraRevenueSales ?? [];
  const teacherHolds = cash?.teacherHolds ?? [];
  const pExtra = usePaged(extraSales, extraSales.length);
  const pExp = usePaged(cash?.expenses || [], cash?.expenses?.length || 0);
  const extraDrawerTotal = extraSales
    .filter((s) => s.cashTo === 'DRAWER')
    .reduce((n, s) => n + Number(s.amount || 0), 0);
  const extraOwnerTotal = extraSales
    .filter((s) => s.cashTo === 'OWNER')
    .reduce((n, s) => n + Number(s.amount || 0), 0);

  async function submitExpense(e: FormEvent) {
    e.preventDefault();
    setBusy('expense');
    setError('');
    try {
      await api('/finance/cash/expenses', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(expForm.amount),
          category: expForm.category,
          paidFrom: expForm.paidFrom,
          note: expForm.note || undefined,
          businessDate: expForm.businessDate || undefined,
        }),
      });
      setExpForm((f) => ({ ...f, amount: '', note: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل المصروف');
    } finally {
      setBusy('');
    }
  }

  async function doClose() {
    setBusy('close');
    setError('');
    try {
      const ymd = confirm?.date;
      const countedAmount = ymd
        ? Number(prevCounted[ymd] || 0)
        : Number(counted);
      await api('/finance/cash/close-day', {
        method: 'POST',
        body: JSON.stringify({
          countedAmount,
          note: ymd ? undefined : closeNote || undefined,
          businessDate: ymd || undefined,
        }),
      });
      setConfirm(null);
      if (!ymd) setCloseNote('');
      const closedDate = ymd || cash?.businessDate || cairoYmd();
      await load();
      window.open(daySheetHref(closedDate, true), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل قفل اليوم');
    } finally {
      setBusy('');
    }
  }

  async function doReopen() {
    setBusy('reopen');
    setError('');
    try {
      await api('/finance/cash/reopen-day', {
        method: 'POST',
        body: JSON.stringify({
          businessDate: confirm?.date || cash?.businessDate || undefined,
        }),
      });
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل فتح اليوم');
    } finally {
      setBusy('');
    }
  }

  async function doHandover() {
    setBusy('handover');
    setError('');
    try {
      await api('/finance/cash/handover', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(handAmount),
          note: handNote || undefined,
        }),
      });
      setConfirm(null);
      setHandNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التسليم');
    } finally {
      setBusy('');
    }
  }

  async function doAdvance(kind: 'IN' | 'OUT') {
    setBusy(kind === 'IN' ? 'advance-in' : 'advance-out');
    setError('');
    try {
      await api('/finance/cash/owner-advance', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          amount: Number(advanceAmount),
          note: advanceNote.trim() || undefined,
        }),
      });
      setConfirm(null);
      setAdvanceAmount('');
      setAdvanceNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الاستلاف');
    } finally {
      setBusy('');
    }
  }

  async function doDeleteReceipt() {
    if (!confirm?.id || !confirm.source) return;
    setBusy(`del-r-${confirm.id}`);
    setError('');
    try {
      await api(
        `/finance/payments/${confirm.id}?source=${confirm.source}`,
        { method: 'DELETE' },
      );
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل مسح الإيصال');
    } finally {
      setBusy('');
    }
  }

  async function doDeleteExpense() {
    if (!confirm?.id) return;
    setBusy(`del-e-${confirm.id}`);
    setError('');
    try {
      await api(`/finance/cash/expenses/${confirm.id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل مسح المصروف');
    } finally {
      setBusy('');
    }
  }

  async function doDeleteExtra() {
    if (!confirm?.id || !confirm.extraKind) return;
    setBusy(`del-x-${confirm.id}`);
    setError('');
    try {
      await api(
        `/finance/cash/extra-revenue/${confirm.extraKind}/${confirm.id}`,
        { method: 'DELETE' },
      );
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل مسح البيع');
    } finally {
      setBusy('');
    }
  }

  async function doSettleHold() {
    if (!confirm?.teacherId) return;
    setBusy(`settle-${confirm.teacherId}`);
    setError('');
    try {
      await api('/finance/cash/teacher-holds/settle', {
        method: 'POST',
        body: JSON.stringify({ teacherId: confirm.teacherId }),
      });
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تصفية حساب المدرس');
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="الحسابات والخزنة"
        subtitle="الإيصالات · قفل اليوم · الخزنة · تسليم صاحب السنتر"
      />

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {prevDays.length && (canClose || canSafe) ? (
        <button
          type="button"
          onClick={() => canClose && setTab('close')}
          className="mb-4 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-right text-sm text-amber-950"
        >
          <span className="font-bold">فيه يوم مقفولش من أمس. </span>
          الفلوس لسه في الدرج
          {prevDays.length === 1
            ? ` (${money(prevDays[0].expected)})`
            : ` (${money(prevDays.reduce((s, d) => s + d.expected, 0))})`}
          {canClose ? ' — اضغط هنا عشان تقفله.' : '.'}
        </button>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-mist bg-white p-1.5 shadow-sm">
        {(
          [
            canReceipts
              ? ({
                  id: 'receipts' as const,
                  label: 'الإيصالات',
                  count: receiptCounts.total,
                } as const)
              : null,
            canSafe
              ? ({ id: 'safe' as const, label: 'الخزنة' } as const)
              : null,
            canClose
              ? ({
                  id: 'close' as const,
                  label: 'قفل اليوم',
                  count: prevDays.length || undefined,
                } as const)
              : null,
          ].filter(Boolean) as Array<{
            id: 'receipts' | 'safe' | 'close';
            label: string;
            count?: number;
          }>
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                active
                  ? 'bg-[#0B2545] text-white shadow-sm'
                  : 'text-navy/55 hover:bg-sand hover:text-navy'
              }`}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              {typeof item.count === 'number' ? (
                <span
                  className={`inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'bg-sand text-navy/70'
                  }`}
                >
                  {item.count.toLocaleString('en-EG')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === 'safe' || tab === 'close' ? (
      <>
      <PageHero
        eyebrow="CASH"
        title="الخزنة والدرج"
        subtitle="فودافون كاش بتتحسب كاش مع قفل اليوم. قاعات الاستقبال في الدرج. أكواد وملازم الاستقبال: نصيب السنتر يدخل الدرج فورًا، ونصيب المدرس يتصفى من حساب المدرس."
        metrics={[
          {
            label: 'المفروض في الدرج',
            value: money(cash?.expectedInDrawer ?? 0),
            highlight: true,
          },
          { label: 'رصيد الخزنة', value: money(cash?.safeBalance ?? 0) },
          {
            label: 'مستحق للمدرسين',
            value: money(cash?.teacherHoldTotal ?? 0),
          },
          ...(canOwnerExpense || cash?.canOwnerExpense
            ? [
                {
                  label: 'لسه ما استلمتوش',
                  value: money(cash?.ownerNotReceived?.total ?? 0),
                },
                {
                  label: 'عند صاحب السنتر',
                  value: money(cash?.ownerBalance ?? 0),
                },
              ]
            : []),
          ...(canOwnerAdvance
            ? [
                {
                  label: 'استلاف مستحق',
                  value: money(cash?.ownerAdvanceOutstanding ?? 0),
                },
              ]
            : []),
          {
            label: cash?.closed ? 'اليوم' : 'تحصيل اليوم',
            value: cash?.closed ? 'مقفل' : money(cash?.collectedTotal ?? 0),
          },
        ]}
      />

      {(canOwnerExpense || cash?.canOwnerExpense) && cash?.ownerNotReceived ? (
        <SectionCard
          className="mb-4"
          title="فلوس لسه ما استلمتهاش"
          subtitle="دي فلوس السنتر اللي لسه ما وصلتش لحسابك — مش نفس «عند صاحب السنتر» (اللي استلمتها فعلًا)"
        >
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
            <p className="text-[11px] font-bold tracking-wide text-amber-900">
              الإجمالي اللي لسه ما استلمتوش
            </p>
            <p className="text-2xl font-black tabular-nums text-navy">
              {money(cash.ownerNotReceived.total)}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setSafeDetailOpen(true)}
              className="rounded-xl border border-navy/10 bg-white p-3 text-right transition hover:border-navy/30 hover:bg-sand/40"
            >
              <p className="text-[11px] text-navy/50">في الخزنة (جاهز للتسليم)</p>
              <p className="text-lg font-black tabular-nums text-navy">
                {money(cash.ownerNotReceived.inSafe)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-brand">
                اضغط لعرض التفصيل والتقسيم ←
              </p>
            </button>
            <div className="rounded-xl border border-navy/10 bg-white p-3">
              <p className="text-[11px] text-navy/50">في الدرج (لسه متقفلش)</p>
              <p className="text-lg font-black tabular-nums text-navy">
                {money(cash.ownerNotReceived.inDrawer)}
              </p>
              <p className="mt-1 text-[11px] text-navy/45">
                بعد قفل اليوم تدخل الخزنة
              </p>
            </div>
            <div className="rounded-xl border border-navy/10 bg-white p-3">
              <p className="text-[11px] text-navy/50">محفظة أونلاين متاحة</p>
              <p className="text-lg font-black tabular-nums text-navy">
                {money(cash.ownerNotReceived.walletAvailable)}
              </p>
              <p className="mt-1 text-[11px] text-navy/45">
                من صفحة المحفظة → تحويل لصاحب السنتر
              </p>
            </div>
            <div className="rounded-xl border border-navy/10 bg-white p-3">
              <p className="text-[11px] text-navy/50">
                نصيب سنتر لسه في حساب قديم
              </p>
              <p className="text-lg font-black tabular-nums text-navy">
                {money(cash.ownerNotReceived.teacherHoldCenterShare)}
              </p>
              <p className="mt-1 text-[11px] text-navy/45">
                مبيعات قديمة قبل التحديث — تدخل الدرج عند تصفية المدرس
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <Link
        href="/bookings/ewallet"
        className="mb-4 block rounded-2xl border border-amber-200 bg-amber-50/70 p-4 hover:bg-amber-50"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-amber-800">
              E-WALLET
            </p>
            <p className="text-lg font-extrabold text-navy">
              محفظة تحويل إلكتروني
            </p>
            <p className="text-[12px] text-navy/55">
              تحويلات استمارات الأونلاين (فودافون كاش / InstaPay) — مش في الدرج
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-navy/45">متاح للتحويل</p>
            <p className="text-xl font-black tabular-nums text-navy">
              {money(
                cash?.onlineFormWallet?.availableAmount ??
                  cash?.onlineFormWallet?.confirmedAmount ??
                  0,
              )}
            </p>
            {(cash?.onlineFormWallet?.claimedAmount || 0) > 0 ? (
              <p className="text-[12px] font-semibold text-navy/55">
                اتحوّل لصاحب السنتر{' '}
                {money(cash?.onlineFormWallet?.claimedAmount ?? 0)}
              </p>
            ) : null}
            {(cash?.onlineFormWallet?.pendingCount || 0) > 0 ? (
              <p className="text-[12px] font-semibold text-amber-800">
                بانتظار التأكيد{' '}
                {money(cash?.onlineFormWallet?.pendingAmount ?? 0)}
              </p>
            ) : null}
          </div>
        </div>
      </Link>

      <Link
        href="/finance/settlements"
        className="mb-4 block rounded-2xl border border-navy/10 bg-white p-4 hover:bg-sand/40"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-extrabold text-navy">تقرير تصفية المدرسين</p>
            <p className="text-[12px] text-navy/50">
              كل أيام التصفية · نصيب المدرس والسنتر في الأكواد والملازم
            </p>
          </div>
          <span className="text-sm font-semibold text-brand">فتح التقرير</span>
        </div>
      </Link>

      {teacherHolds.length ? (
      <SectionCard
        className="mb-4"
        title="حسابات مدرسين مفتوحة"
        subtitle="المستحق هنا = نصيب المدرس فقط. نصيب السنتر من المبيعات الجديدة بيدخل الدرج من يوم البيع."
        action={
          <Link href="/finance/settlements" className="btn-secondary text-sm">
            تقرير التصفيات
          </Link>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {teacherHolds.map((h) => (
            <div
              key={h.teacherId}
              className="rounded-xl border border-navy/10 bg-white p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-navy">{h.teacherName}</p>
                  <p className="text-[12px] text-navy/45">
                    {h.onlineCount
                      ? `${h.onlineCount.toLocaleString('en-EG')} كود`
                      : null}
                    {h.onlineCount && h.handoutCount ? ' · ' : null}
                    {h.handoutCount
                      ? `${h.handoutCount.toLocaleString('en-EG')} ملزمة`
                      : null}
                  </p>
                </div>
                <p className="tabular-nums text-lg font-black text-navy">
                  {money(h.teacherShare)}
                </p>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg bg-sand px-3 py-2">
                  <p className="text-navy/45">يدفع للمدرس</p>
                  <p className="font-bold tabular-nums">
                    {money(h.teacherShare)}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <p className="text-navy/45">
                    {(h.centerPendingInHold || 0) > 0.009
                      ? 'سنتر لسه هيدخل الدرج'
                      : 'سنتر في الدرج بالفعل'}
                  </p>
                  <p className="font-bold tabular-nums text-emerald-900">
                    {money(
                      (h.centerPendingInHold || 0) > 0.009
                        ? Number(h.centerPendingInHold || 0)
                        : Number(
                            h.centerAlreadyInDrawer || h.centerShare || 0,
                          ),
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={busy === `settle-${h.teacherId}`}
                onClick={() =>
                  setConfirm({
                    kind: 'settle-hold',
                    teacherId: h.teacherId,
                    teacherName: h.teacherName,
                    teacherPaid: h.teacherShare,
                    centerToSafe: h.centerPendingInHold || 0,
                  })
                }
              >
                تصفية مع المدرس
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
      ) : null}

      <SectionCard
        className="mb-4"
        title="مبيعات الإيرادات الإضافية"
        subtitle={
          isReception
            ? 'القاعات والأكواد والملازم: نصيب السنتر في الدرج فورًا · نصيب المدرس يتصفى من حسابه'
            : `الدرج ${money(extraDrawerTotal)} · مستحق مدرسين ${money(cash?.teacherHoldTotal ?? 0)} · صاحب السنتر ${money(extraOwnerTotal)}`
        }
        badge={
          extraSales.length ? (
            <span className="badge-navy">{extraSales.length}</span>
          ) : null
        }
        action={
          extraSales.length ? (
            <button
              type="button"
              className="btn-ghost min-h-11 w-full sm:w-auto"
              onClick={() => setShowExtraSales((v) => !v)}
            >
              {showExtraSales ? 'إخفاء الجدول' : 'عرض الجدول'}
            </button>
          ) : null
        }
      >
        {showExtraSales && extraSales.length ? (
          <div>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[11px] text-navy/40">
                  <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-right font-medium">النوع</th>
                  <th className="px-3 py-2 text-right font-medium">البيان</th>
                  <th className="px-3 py-2 text-right font-medium">مين سجّل</th>
                  <th className="px-3 py-2 text-right font-medium">راحت فين</th>
                  <th className="px-3 py-2 text-left font-medium">نصيب السنتر</th>
                  {canDelete ? (
                    <th className="px-3 py-2 text-left font-medium"></th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {pExtra.slice.map((s) => (
                  <tr key={`${s.kind}-${s.id}`} className="border-t border-navy/5">
                    <td className="px-3 py-2 whitespace-nowrap text-[12px] text-navy/55">
                      {new Date(s.at).toLocaleString('ar-EG')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.kindLabel}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-navy">{s.title}</p>
                      <p className="text-[11px] text-navy/40">
                        {payMethodLabel(s.method)}
                        {s.detail ? ` · ${s.detail}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-navy/60">
                      {s.soldByName || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          s.cashTo === 'OWNER'
                            ? 'bg-amber-50 text-amber-900'
                            : s.cashTo === 'TEACHER_HOLD'
                              ? 'bg-indigo-50 text-indigo-900'
                              : s.cashTo === 'SAFE'
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-sand text-navy/70'
                        }`}
                      >
                        {extraCashToLabel[s.cashTo] || s.cashTo}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-left">
                      <p className="font-extrabold">{money(s.amount)}</p>
                      {Number(s.teacherShare || 0) > 0.009 ? (
                        <p className="text-[11px] text-navy/40">
                          مدرس {money(Number(s.teacherShare))}
                          {s.grossAmount
                            ? ` · كامل ${money(Number(s.grossAmount))}`
                            : ''}
                        </p>
                      ) : null}
                    </td>
                    {canDelete ? (
                      <td className="px-3 py-2 text-left">
                        <button
                          type="button"
                          className="text-xs font-bold text-rose-700 hover:underline"
                          disabled={busy === `del-x-${s.id}`}
                          onClick={() =>
                            setConfirm({
                              kind: 'del-extra',
                              id: s.id,
                              extraKind: s.kind,
                              label: `${s.kindLabel} · ${s.title} · ${money(s.amount)}`,
                            })
                          }
                        >
                          مسح
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager
              page={pExtra.page}
              pages={pExtra.pages}
              total={pExtra.total}
              size={pExtra.size}
              from={pExtra.from}
              to={pExtra.to}
              onPage={pExtra.setPage}
            />
          </div>
        ) : extraSales.length ? (
          <p className="text-sm text-navy/50">
            اضغط عرض الجدول لو محتاج تراجع البيوع.
          </p>
        ) : (
          <EmptyState>لا مبيعات إيراد إضافي بعد</EmptyState>
        )}
        {(cash?.extraSettlements || []).length ? (
          <div className="mt-4 max-h-40 overflow-auto">
            <p className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-navy/55">
              <span>تصفيات مدرسين سابقة</span>
              <Link href="/finance/settlements" className="text-brand underline">
                التقرير الكامل
              </Link>
            </p>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[11px] text-navy/40">
                  <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-right font-medium">المدرس</th>
                  <th className="px-3 py-2 text-left font-medium">للمدرس</th>
                  <th className="px-3 py-2 text-left font-medium">للدرج</th>
                </tr>
              </thead>
              <tbody>
                {(cash?.extraSettlements || []).map((s) => (
                  <tr key={s.id} className="border-t border-navy/5">
                    <td className="px-3 py-2 whitespace-nowrap text-[12px] text-navy/55">
                      {new Date(s.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{s.teacherName}</p>
                      <p className="text-[11px] text-navy/40">
                        {s.onlineCount ? `${s.onlineCount} كود` : null}
                        {s.onlineCount && s.handoutCount ? ' · ' : null}
                        {s.handoutCount ? `${s.handoutCount} ملزمة` : null}
                        {s.settledByName ? ` · ${s.settledByName}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-left">
                      {money(s.teacherPaid)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-left font-bold text-emerald-800">
                      {money(s.centerToSafe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {tab === 'close' ? (
        <>
        <div className="lg:col-span-2 space-y-4">
          {prevDays.length ? (
            <SectionCard
              title="أيام سابقة لسه مقفولة"
              subtitle="قفّل كل يوم لوحده قبل ما تقفل النهاردة"
              badge={
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  {prevDays.length}
                </span>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                {prevDays.map((d) => {
                  const countedPrev = Number(prevCounted[d.date] ?? '');
                  const diff = Number.isFinite(countedPrev)
                    ? countedPrev - d.expected
                    : 0;
                  return (
                    <div
                      key={d.date}
                      className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold tracking-wide text-amber-800/70">
                            يوم معلّق
                          </p>
                          <p className="font-extrabold text-amber-950">
                            {formatArDay(d.date)}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-amber-900/55">المفروض</p>
                          <p className="text-lg font-black tabular-nums text-amber-950">
                            {money(d.expected)}
                          </p>
                        </div>
                      </div>
                      <div className="mb-3 grid grid-cols-3 gap-2 text-[12px]">
                        <div className="rounded-xl bg-white/90 px-2.5 py-2">
                          <p className="text-[10px] text-navy/45">كاش</p>
                          <p className="font-bold tabular-nums">
                            {money(d.collectedCash)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/90 px-2.5 py-2">
                          <p className="text-[10px] text-navy/45">فودافون</p>
                          <p className="font-bold tabular-nums">
                            {money(d.collectedVodafone)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/90 px-2.5 py-2">
                          <p className="text-[10px] text-navy/45">مصروف</p>
                          <p className="font-bold tabular-nums text-rose-700">
                            − {money(d.drawerExpenses)}
                          </p>
                        </div>
                      </div>
                      {d.warnings?.hasWarnings ? (
                        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-900">
                          {d.warnings.messages.join(' · ')}
                        </div>
                      ) : null}
                      <FieldLabel label="العدّ الفعلي">
                        <input
                          className="field"
                          type="number"
                          min={0}
                          value={prevCounted[d.date] ?? ''}
                          onChange={(e) =>
                            setPrevCounted((curr) => ({
                              ...curr,
                              [d.date]: e.target.value,
                            }))
                          }
                        />
                      </FieldLabel>
                      <p
                        className={`mt-1.5 text-xs font-semibold ${diffTone(diff)}`}
                      >
                        الفرق: {formatDiff(diff)}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className="btn-primary w-full"
                          disabled={busy === 'close'}
                          onClick={() =>
                            setConfirm({ kind: 'close', date: d.date })
                          }
                        >
                          قفل وتحويل للخزنة
                        </button>
                        <a
                          href={daySheetHref(d.date)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost w-full"
                        >
                          طباعة الورقة
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard
              title="ملخص درج النهاردة"
              subtitle={
                todayClosed
                  ? `اتقفل · العدّ ${money(Number(cash?.close?.countedAmount || 0))}`
                  : 'راجع التحصيل والمصروف قبل العدّ'
              }
              badge={
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    todayClosed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  {todayClosed ? 'مقفل' : 'مفتوح'}
                </span>
              }
              action={
                <a
                  href={daySheetHref(cash?.businessDate || cairoYmd())}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost text-sm"
                >
                  ورقة اليوم
                </a>
              }
            >
              <div className="mb-4 rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3">
                <p className="text-[11px] font-semibold text-navy/50">
                  المفروض يتعدّ النهاردة
                </p>
                <p className="text-2xl font-black tabular-nums text-navy">
                  {money(todayExpected)}
                </p>
                {prevDays.length ? (
                  <p className="mt-1 text-[11px] text-amber-900/80">
                    فيه أيام سابقة معلّقة فوق — اتقفلها الأول
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl bg-sand px-3 py-2.5">
                  <p className="text-[11px] text-navy/45">كاش</p>
                  <p className="font-extrabold tabular-nums">
                    {money(cash?.collectedCash ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-sand px-3 py-2.5">
                  <p className="text-[11px] text-navy/45">فودافون</p>
                  <p className="font-extrabold tabular-nums">
                    {money(cash?.collectedVodafone ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-sand px-3 py-2.5">
                  <p className="text-[11px] text-navy/45">مصروف الدرج</p>
                  <p className="font-extrabold tabular-nums text-rose-700">
                    − {money(cash?.drawerExpenses ?? 0)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="mt-4 flex w-full items-center justify-between rounded-xl border border-navy/10 bg-white px-3 py-2.5 text-sm font-semibold text-navy/70 hover:bg-sand/50"
                onClick={() => setCloseDetailsOpen((v) => !v)}
              >
                <span>تفصيل التحصيل والمصروف</span>
                <span className="text-navy/40">
                  {closeDetailsOpen ? 'إخفاء' : 'عرض'}
                </span>
              </button>

              {closeDetailsOpen ? (
                <div className="mt-3 space-y-3">
                  {cash?.collectedBreakdown?.length ? (
                    <div className="overflow-hidden rounded-xl border border-navy/10">
                      <p className="bg-sand px-3 py-2 text-[11px] font-semibold text-navy/55">
                        مصادر التحصيل
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] text-navy/40">
                            <th className="px-3 py-1.5 text-right font-medium">
                              المصدر
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              كاش
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              فودافون
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              الإجمالي
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cash.collectedBreakdown.map((row) => (
                            <tr key={row.key} className="border-t border-navy/5">
                              <td className="px-3 py-1.5">{row.label}</td>
                              <td className="px-3 py-1.5 tabular-nums text-left">
                                {money(row.cash)}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-left">
                                {money(row.vodafone)}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-left font-semibold">
                                {money(row.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-navy/45">مفيش تحصيل درج النهاردة</p>
                  )}

                  {cash?.drawerExpenseLines?.length ? (
                    <div className="overflow-hidden rounded-xl border border-rose-200/70">
                      <p className="bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">
                        مصروف الدرج
                      </p>
                      <ul className="divide-y divide-rose-100 text-sm">
                        {cash.drawerExpenseLines.map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between gap-3 px-3 py-1.5"
                          >
                            <span>
                              {e.category}
                              {e.note ? (
                                <span className="text-navy/40"> · {e.note}</span>
                              ) : null}
                            </span>
                            <span className="tabular-nums font-semibold text-rose-700">
                              − {money(e.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {cash?.onlineFormsToday?.count ? (
                    <div className="overflow-hidden rounded-xl border border-sky-200/80">
                      <p className="bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-900">
                        استمارات أونلاين — مش في عدّ الدرج
                        <span className="font-normal text-sky-700/80">
                          {' '}
                          · {cash.onlineFormsToday.count} ·{' '}
                          {money(cash.onlineFormsToday.amount)}
                        </span>
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] text-navy/40">
                            <th className="px-3 py-1.5 text-right font-medium">
                              الاستمارة
                            </th>
                            <th className="px-3 py-1.5 text-right font-medium">
                              التسلسل
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              المبلغ
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cash.onlineFormsToday.byForm.map((row) => (
                            <tr
                              key={row.formId}
                              className="border-t border-sky-100"
                            >
                              <td className="px-3 py-1.5 font-medium">
                                {row.label}
                                <span className="block text-[11px] font-normal text-navy/45">
                                  {row.count} استمارة
                                </span>
                              </td>
                              <td className="px-3 py-1.5 font-mono text-[11px] text-navy/60">
                                {row.serials.length
                                  ? row.serials.map((n) => `م ${n}`).join(' · ')
                                  : '—'}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-left font-semibold">
                                {money(row.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title={todayClosed ? 'حالة القفل' : 'عدّ وقفل'}
              subtitle={
                todayClosed
                  ? 'اليوم اتقفل واتحوّل للخزنة'
                  : 'بعد ما تعدّ الدرج سجّل العدّ الفعلي'
              }
            >
              {todayClosed ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      اتقفل بواسطة
                    </p>
                    <p className="font-extrabold text-emerald-950">
                      {cash?.close?.closedByName || 'موظف'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-white/80 px-3 py-2">
                        <p className="text-[10px] text-navy/45">العدّ</p>
                        <p className="font-bold tabular-nums">
                          {money(Number(cash?.close?.countedAmount || 0))}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/80 px-3 py-2">
                        <p className="text-[10px] text-navy/45">الفرق</p>
                        <p className="font-bold tabular-nums">
                          {money(Number(cash?.close?.difference || 0))}
                        </p>
                      </div>
                    </div>
                    {cash?.close?.note ? (
                      <p className="mt-3 text-sm text-navy/65">
                        ملاحظة: {cash.close.note}
                      </p>
                    ) : null}
                  </div>
                  <a
                    href={daySheetHref(cash!.businessDate, true)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary w-full"
                  >
                    طباعة ورقة اليوم
                  </a>
                  {canReopen ? (
                    <button
                      type="button"
                      className="btn-ghost w-full"
                      disabled={busy === 'reopen'}
                      onClick={() => setConfirm({ kind: 'reopen' })}
                    >
                      فتح اليوم تاني (قفل بالغلط)
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <ol className="space-y-2 text-[12px] text-navy/55">
                    <li className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                        1
                      </span>
                      <span>حوّل فودافون لكاش وعدّ الدرج</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                        2
                      </span>
                      <span>سجّل العدّ الفعلي تحت</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">
                        3
                      </span>
                      <span>اقفل اليوم — الفلوس تدخل الخزنة</span>
                    </li>
                  </ol>

                  <FieldLabel label="العدّ الفعلي (بعد تحويل فودافون)">
                    <input
                      className="field text-lg font-bold tabular-nums"
                      type="number"
                      min={0}
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                      placeholder={String(Math.round(todayExpected) || '')}
                    />
                  </FieldLabel>

                  <div
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                      closeDiff === 0
                        ? 'bg-emerald-50 text-emerald-800'
                        : closeDiff < 0
                          ? 'bg-rose-50 text-rose-800'
                          : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    الفرق عن المفروض: {formatDiff(closeDiff)}
                  </div>

                  <FieldLabel label="ملاحظة (اختياري)">
                    <input
                      className="field"
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="سبب أي فرق"
                    />
                  </FieldLabel>

                  {cash?.closeWarnings?.hasWarnings ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                      <p className="text-[11px] font-bold text-amber-800/80">
                        قبل القفل
                      </p>
                      <ul className="mt-1 list-disc pr-4 space-y-0.5">
                        {cash.closeWarnings.messages.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] font-normal text-amber-900/70">
                        تقدر تقفل برضه، بس راجع النقط دي الأول.
                      </p>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busy === 'close'}
                    onClick={() => setConfirm({ kind: 'close' })}
                  >
                    قفل اليوم وتحويل للخزنة
                  </button>
                  <a
                    href={daySheetHref(cash?.businessDate || cairoYmd())}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost w-full"
                  >
                    معاينة / طباعة الورقة
                  </a>
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="آخر أيام اتقفلت"
            badge={
              cash?.closes?.length ? (
                <span className="badge-navy">{cash.closes.length}</span>
              ) : null
            }
          >
            {cash?.closes?.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {cash.closes.map((c) => {
                  const ymd = String(c.businessDate).slice(0, 10);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-mist bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{formatArDay(ymd)}</p>
                        <p className="truncate text-[11px] text-navy/45">
                          فودافون {money(Number(c.vodafoneCollected))} · فرق{' '}
                          {money(Number(c.difference))}
                          {c.closedByName ? ` · ${c.closedByName}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="font-extrabold tabular-nums">
                          {money(Number(c.countedAmount))}
                        </p>
                        <a
                          href={daySheetHref(ymd)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-sky-800 hover:underline"
                        >
                          طباعة
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>لا يوجد قفل يوم بعد</EmptyState>
            )}
          </SectionCard>

          {canReopen ? (
            <SectionCard
              title="سجل التدقيق"
              subtitle="فتح يوم · تعديل/مسح بعد قفل الجلسة"
              badge={
                auditLogs.length ? (
                  <span className="badge-navy">{auditLogs.length}</span>
                ) : null
              }
            >
              {auditLogs.length ? (
                <ul className="space-y-2">
                  {auditLogs.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-mist bg-sand/40 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-bold text-navy">
                          {formatAuditAction(row.action)}
                        </p>
                        <p className="text-[11px] tabular-nums text-navy/45">
                          {new Date(row.createdAt).toLocaleString('ar-EG')}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[12px] text-navy/55">
                        {row.userName || 'مستخدم'}
                        {row.entityType ? ` · ${row.entityType}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>مفيش أحداث مسجّلة لسه</EmptyState>
              )}
            </SectionCard>
          ) : null}
        </div>
        </>
        ) : null}

        {tab === 'safe' ? (
        <SectionCard
          title="مصروف"
          subtitle={
            canOwnerExpense
              ? 'الاستقبال: درج أو خزنة · صاحب السنتر: بعد استلام التسليم'
              : 'سجّل اللي صرفته أنت من الدرج أو من الخزنة'
          }
        >
          <form onSubmit={submitExpense} className="space-y-3">
            <FieldLabel label="التاريخ">
              <input
                className="field"
                type="date"
                required
                max={cairoYmd()}
                value={expForm.businessDate}
                onChange={(e) =>
                  setExpForm({ ...expForm, businessDate: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="المبلغ">
              <input
                className="field"
                type="number"
                min={1}
                required
                value={expForm.amount}
                onChange={(e) =>
                  setExpForm({ ...expForm, amount: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="البند">
              <select
                className="field"
                value={expForm.category}
                onChange={(e) =>
                  setExpForm({ ...expForm, category: e.target.value })
                }
              >
                {(cash?.categories || ['أخرى']).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="منين">
              <select
                className="field"
                value={expForm.paidFrom}
                onChange={(e) =>
                  setExpForm({
                    ...expForm,
                    paidFrom: e.target.value as typeof expForm.paidFrom,
                  })
                }
              >
                <option
                  value="DRAWER"
                  disabled={
                    expForm.businessDate === cash?.businessDate && !!cash?.closed
                  }
                >
                  درج اليوم (استقبال)
                </option>
                <option value="SAFE">الخزنة</option>
                {canOwnerExpense ? (
                  <option value="OWNER">
                    فلوس صاحب السنتر بعد التسليم
                  </option>
                ) : null}
              </select>
            </FieldLabel>
            <FieldLabel label="بيان">
              <input
                className="field"
                value={expForm.note}
                onChange={(e) =>
                  setExpForm({ ...expForm, note: e.target.value })
                }
                placeholder="مثلاً: مية / لمبة / انتقال"
              />
            </FieldLabel>
            <button
              className="btn-accent w-full"
              disabled={busy === 'expense'}
            >
              {busy === 'expense' ? 'جاري الحفظ...' : 'تسجيل مصروف'}
            </button>
          </form>
        </SectionCard>
        ) : null}

        {tab === 'safe' ? (
        <SectionCard
          title="تسليم لصاحب السنتر"
          subtitle="فلوس الخزنة اللي بتديها لصاحب السنتر (عادة مرة في الأسبوع)"
        >
          <div className="space-y-3">
            <p className="rounded-xl bg-sand px-3 py-2 text-sm text-navy/70">
              المتاح في الخزنة الآن{' '}
              <span className="font-extrabold tabular-nums text-navy">
                {money(cash?.safeBalance ?? 0)}
              </span>
            </p>
            <FieldLabel label="المبلغ">
              <input
                className="field"
                type="number"
                min={1}
                value={handAmount}
                onChange={(e) => setHandAmount(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="ملاحظة">
              <input
                className="field"
                value={handNote}
                onChange={(e) => setHandNote(e.target.value)}
                placeholder="تسليم أسبوعي"
              />
            </FieldLabel>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy === 'handover' || (cash?.safeBalance ?? 0) <= 0}
              onClick={() => setConfirm({ kind: 'handover' })}
            >
              تسليم من الخزنة
            </button>
          </div>
        </SectionCard>
        ) : null}

        {tab === 'safe' && canOwnerAdvance ? (
        <SectionCard
          className="mt-4 lg:mt-0"
          title="استلاف صاحب السنتر"
          subtitle="فلوس من جيب صاحب السنتر للخزنة — ترجع له بعدين (مش تسليم أرباح)"
        >
          <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-950">
              مستحق له دلوقتي{' '}
              <span className="font-black tabular-nums">
                {money(cash?.ownerAdvanceOutstanding ?? 0)}
              </span>
            </p>
            <FieldLabel label="المبلغ">
              <input
                className="field"
                type="number"
                min={1}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="ملاحظة">
              <input
                className="field"
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                placeholder="مثلاً: إيجار · كهربا"
              />
            </FieldLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn-accent w-full"
                disabled={
                  busy === 'advance-in' ||
                  !Number(advanceAmount) ||
                  Number(advanceAmount) <= 0
                }
                onClick={() => setConfirm({ kind: 'advance-in' })}
              >
                سلّفت السنتر
              </button>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={
                  busy === 'advance-out' ||
                  !Number(advanceAmount) ||
                  Number(advanceAmount) <= 0 ||
                  (cash?.ownerAdvanceOutstanding ?? 0) <= 0
                }
                onClick={() => setConfirm({ kind: 'advance-out' })}
              >
                خدت فلوسي
              </button>
            </div>
            {(cash?.ownerAdvances || []).length ? (
              <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-sm">
                {(cash?.ownerAdvances || []).map((a) => (
                  <li
                    key={a.id}
                    className="flex justify-between gap-3 rounded-xl bg-sand px-3 py-2"
                  >
                    <span>
                      <span className="font-bold">
                        {a.kind === 'IN' ? 'سلّف' : 'استرجع'}
                      </span>
                      {a.note ? (
                        <span className="text-navy/45"> · {a.note}</span>
                      ) : null}
                      <span className="block text-[11px] text-navy/40 mt-0.5">
                        {new Date(a.createdAt).toLocaleString('ar-EG')}
                      </span>
                    </span>
                    <span
                      className={`font-extrabold tabular-nums ${
                        a.kind === 'IN' ? 'text-emerald-800' : 'text-rose-700'
                      }`}
                    >
                      {a.kind === 'IN' ? '+' : '−'} {money(Number(a.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-navy/45">مفيش حركات استلاف بعد</p>
            )}
          </div>
        </SectionCard>
        ) : null}
      </div>

      {tab === 'safe' ? (
      <>
      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <SectionCard
          title={
            canOwnerExpense
              ? 'كل المصروفات'
              : 'مصروفاتك (الدرج والخزنة)'
          }
          badge={
            cash?.expenses?.length ? (
              <span className="badge-navy">{cash.expenses.length}</span>
            ) : null
          }
        >
          {cash?.expenses?.length ? (
            <>
            <ul className="space-y-1.5 text-sm">
              {pExp.slice.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-mist px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">
                      {e.category} · {fromLabel[e.paidFrom] || e.paidFrom}
                    </p>
                    <p className="truncate text-[11px] text-navy/45">
                      {formatArDay(
                        String(e.businessDate || e.createdAt).slice(0, 10),
                      )}
                      {e.createdByName ? ` · ${e.createdByName}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-0.5 text-left">
                    <p className="font-extrabold tabular-nums text-rose-700">
                      {money(Number(e.amount))}
                    </p>
                    {canDelete ? (
                      <button
                        type="button"
                        className="text-xs font-bold text-rose-700 hover:underline"
                        disabled={busy === `del-e-${e.id}`}
                        onClick={() =>
                          setConfirm({
                            kind: 'del-expense',
                            id: e.id,
                            label: `${e.category} · ${money(Number(e.amount))}`,
                          })
                        }
                      >
                        مسح
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <TablePager
              page={pExp.page}
              pages={pExp.pages}
              total={pExp.total}
              size={pExp.size}
              from={pExp.from}
              to={pExp.to}
              onPage={pExp.setPage}
            />
            </>
          ) : (
            <EmptyState>لا توجد مصروفات بعد</EmptyState>
          )}
        </SectionCard>
        <SectionCard
          title="التسليمات وقفل الأيام"
          badge={
            (cash?.handovers?.length || 0) + (cash?.closes?.length || 0) ? (
              <span className="badge-navy">
                {(cash?.handovers?.length || 0) + (cash?.closes?.length || 0)}
              </span>
            ) : null
          }
        >
          {cash?.handovers?.length || cash?.closes?.length ? (
            <div className="max-h-52 space-y-1.5 overflow-auto overscroll-contain text-sm">
              {(cash?.handovers || []).map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between gap-2 rounded-lg bg-sand px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">تسليم لصاحب السنتر</p>
                    <p className="truncate text-[11px] text-navy/45">
                      {new Date(h.createdAt).toLocaleString('ar-EG')}
                      {h.createdByName ? ` · ${h.createdByName}` : ''}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 font-extrabold tabular-nums">
                    {money(Number(h.amount))}
                  </p>
                </div>
              ))}
              {(cash?.closes || []).map((c) => {
                const ymd = String(c.businessDate).slice(0, 10);
                return (
                <div
                  key={c.id}
                  className="flex justify-between gap-2 rounded-lg border border-mist px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">قفل {ymd}</p>
                    <p className="truncate text-[11px] text-navy/45">
                      فودافون {money(Number(c.vodafoneCollected))} · فرق{' '}
                      {money(Number(c.difference))}
                      {c.closedByName ? ` · ${c.closedByName}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="font-extrabold tabular-nums">
                      {money(Number(c.countedAmount))}
                    </p>
                    <a
                      href={daySheetHref(ymd)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-sky-800 hover:underline"
                    >
                      طباعة
                    </a>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>لا توجد حركات خزنة بعد</EmptyState>
          )}
        </SectionCard>
      </div>
      </>
      ) : null}

      </>
      ) : canReceipts ? (
      <>
      <PageHero
        eyebrow="FINANCE"
        title="سجل التحصيل"
        subtitle="كل الإيصالات محفوظة — استمارة / حضور / تحصيل. تحويلات الأونلاين في المحفظة مش جوه تحصيل اليوم."
        metrics={[
          {
            label: 'تحصيل اليوم',
            value: money(
              cash?.collectedTotal ??
                summary?.collectedToday ??
                0,
            ),
            highlight: true,
          },
          {
            label: 'تحصيل الشهر',
            value: money(summary?.collectedMonth ?? 0),
          },
          {
            label: 'إجمالي المتحصل',
            value: money(summary?.collectedAll ?? 0),
            onClick: () => setCollectedAllOpen(true),
            hint: 'اضغط للتفاصيل',
          },
          {
            label: 'عدد الإيصالات',
            value: receiptCounts.total,
          },
          {
            label: 'استمارات حجز',
            value: receiptCounts.booking,
          },
        ]}
      />
      <SectionCard
        title="الإيصالات"
        subtitle={`استمارات ${receiptCounts.booking} · حصص ${receiptCounts.session} · أخرى ${receiptCounts.other}`}
        badge={
          <span className="badge-ok">
            {receiptSearch.trim()
              ? `${visiblePayments.length} / ${receiptCounts.total}`
              : receiptCounts.total}
          </span>
        }
      >
        <div className="mb-3">
          <FieldLabel label="بحث في الإيصالات">
            <input
              className="field"
              value={receiptSearch}
              onChange={(e) => setReceiptSearch(e.target.value)}
              placeholder="اسم الطالب، رقم الإيصال، السبب، الموبايل، أو المبلغ…"
            />
          </FieldLabel>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'الكل', n: receiptCounts.total },
              {
                id: 'booking' as const,
                label: 'استمارات',
                n: receiptCounts.booking,
              },
              { id: 'session' as const, label: 'حصص', n: receiptCounts.session },
              { id: 'other' as const, label: 'أخرى', n: receiptCounts.other },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setReasonFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                reasonFilter === f.id
                  ? 'bg-[#0B2545] text-white'
                  : 'bg-sand text-navy/70'
              }`}
            >
              {f.label} {f.n}
            </button>
          ))}
        </div>
        <div className="space-y-3 md:hidden">
          {pagedReceipts.slice.map((p) => (
            <article
              key={`${p.source}-${p.id}`}
              className="rounded-xl border border-mist bg-sand/40 p-3 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-navy text-sm">
                  {p.student?.firstName} {p.student?.lastName}
                </p>
                <span className={reasonBadge[p.reason] || 'badge-warn'}>
                  {p.reason}
                </span>
              </div>
              <p className="text-xs text-navy/65">{p.reasonDetail || '—'}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-navy/50">
                <span className="font-mono">{p.receiptNumber}</span>
                <span>{p.method || 'CASH'}</span>
                <span>
                  {p.paidAt
                    ? new Date(p.paidAt).toLocaleString('ar-EG')
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold tabular-nums text-navy">
                  {Number(p.amount).toLocaleString('en-EG')} ج.م
                </p>
                {canDelete ? (
                  <button
                    type="button"
                    className="text-xs font-bold text-rose-700"
                    disabled={busy === `del-r-${p.id}`}
                    onClick={() =>
                      setConfirm({
                        kind: 'del-receipt',
                        id: p.id,
                        source: p.source,
                        label: `${p.receiptNumber} · ${p.reason}`,
                      })
                    }
                  >
                    مسح
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!visiblePayments.length ? (
            <EmptyState>
              {receiptSearch.trim()
                ? 'لا توجد نتائج مطابقة للبحث'
                : 'لا توجد إيصالات'}
            </EmptyState>
          ) : null}
        </div>

        <div className="table-scroll hidden md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>السبب</th>
                <th>التفاصيل</th>
                <th>الإيصال</th>
                <th>الطريقة</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
                {canDelete ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {pagedReceipts.slice.map((p) => (
                <tr key={`${p.source}-${p.id}`}>
                  <td className="font-semibold">
                    {p.student?.firstName} {p.student?.lastName}
                  </td>
                  <td>
                    <span className={reasonBadge[p.reason] || 'badge-warn'}>
                      {p.reason}
                    </span>
                  </td>
                  <td className="text-sm text-navy/70 max-w-[220px]">
                    {p.reasonDetail || '—'}
                  </td>
                  <td className="font-mono text-xs">{p.receiptNumber}</td>
                  <td className="text-xs text-navy/60">{p.method || 'CASH'}</td>
                  <td className="text-xs text-navy/55 tabular-nums">
                    {p.paidAt
                      ? new Date(p.paidAt).toLocaleString('ar-EG')
                      : '—'}
                  </td>
                  <td className="font-bold tabular-nums">
                    {Number(p.amount).toLocaleString('en-EG')}
                  </td>
                  {canDelete ? (
                    <td>
                      <button
                        type="button"
                        className="text-xs font-bold text-rose-700 hover:underline"
                        disabled={busy === `del-r-${p.id}`}
                        onClick={() =>
                          setConfirm({
                            kind: 'del-receipt',
                            id: p.id,
                            source: p.source,
                            label: `${p.receiptNumber} · ${p.reason}`,
                          })
                        }
                      >
                        مسح
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!visiblePayments.length ? (
            <EmptyState>
              {receiptSearch.trim()
                ? 'لا توجد نتائج مطابقة للبحث'
                : 'لا توجد إيصالات'}
            </EmptyState>
          ) : null}
        </div>
        <TablePager
          page={pagedReceipts.page}
          pages={pagedReceipts.pages}
          total={pagedReceipts.total}
          size={pagedReceipts.size}
          from={pagedReceipts.from}
          to={pagedReceipts.to}
          onPage={pagedReceipts.setPage}
        />
      </SectionCard>
      </>
      ) : null}

      <AppDialog
        open={collectedAllOpen}
        tone="info"
        title="تفصيل إجمالي المتحصل"
        message="الرقم = مجموع إيصالات الدفع (استمارات / اشتراكات / أخرى) + حضور الحصص المؤكد. نصيب السنتر في الحصص بعد القسمة مع المدرس."
        confirmLabel="حسناً"
        onConfirm={() => setCollectedAllOpen(false)}
        onClose={() => setCollectedAllOpen(false)}
      >
        {summary?.collectedAllBreakdown ? (
          <div className="mt-4 max-h-[60vh] space-y-3 overflow-auto overscroll-contain text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-navy/10 bg-sand/40 px-3 py-3">
                <p className="text-[11px] font-bold text-navy/55">
                  إجمالي المتحصل
                </p>
                <p className="text-xl font-black tabular-nums text-navy">
                  {money(summary.collectedAllBreakdown.total)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3">
                <p className="text-[11px] font-bold text-emerald-900">
                  إجمالي نصيب السنتر
                </p>
                <p className="text-xl font-black tabular-nums text-navy">
                  {money(summary.collectedAllBreakdown.centerTotal)}
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-navy/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sand text-[11px] text-navy/45">
                    <th className="px-3 py-2 text-right font-medium">المصدر</th>
                    <th className="px-3 py-2 text-left font-medium">عدد</th>
                    <th className="px-3 py-2 text-left font-medium">المبلغ</th>
                    <th className="px-3 py-2 text-left font-medium">نصيب السنتر</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.collectedAllBreakdown.rows.map((row) => (
                    <tr key={row.key} className="border-t border-navy/5">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-navy">{row.label}</p>
                        {row.centerNote ? (
                          <p className="text-[10px] text-navy/45">
                            {row.centerNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-left">
                        {row.count}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-left font-semibold">
                        {money(row.amount)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-left font-bold text-emerald-800">
                        {money(row.centerShare)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-navy/55">لا تفاصيل متاحة حالياً</p>
        )}
      </AppDialog>
      <AppDialog
        open={safeDetailOpen}
        tone="info"
        title="تفصيل رصيد الخزنة"
        message="الرصيد = دخل الخزنة (قفل + استلاف) − المصروفات − التسليمات − سداد الاستلاف"
        confirmLabel="حسناً"
        onConfirm={() => setSafeDetailOpen(false)}
        onClose={() => setSafeDetailOpen(false)}
      >
        {cash?.safeBreakdown ? (
          <div className="mt-4 max-h-[60vh] space-y-4 overflow-auto overscroll-contain text-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3">
              <p className="text-[11px] font-bold text-emerald-900">
                المتاح للتسليم الآن
              </p>
              <p className="text-2xl font-black tabular-nums text-navy">
                {money(cash.safeBreakdown.balance)}
              </p>
            </div>

            {cash.safeComposition ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-[11px] font-bold tracking-wide text-amber-900">
                  الرصيد ده عبارة عن إيه؟
                </p>
                <p className="text-[11px] text-navy/55">{cash.safeComposition.note}</p>
                <div className="flex justify-between gap-2 font-bold">
                  <span>من قفل أيام لسه متسلمتش</span>
                  <span className="tabular-nums text-navy">
                    {money(cash.safeComposition.remainingDayCloses)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 font-bold">
                  <span>من أكواد (وجهة خزنة)</span>
                  <span className="tabular-nums text-navy">
                    {money(cash.safeComposition.remainingOnline)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 font-bold">
                  <span>من ملازم (وجهة خزنة)</span>
                  <span className="tabular-nums text-navy">
                    {money(cash.safeComposition.remainingHandouts)}
                  </span>
                </div>
                {(cash.safeComposition.remainingAdvances || 0) > 0.009 ? (
                  <div className="flex justify-between gap-2 font-bold">
                    <span>من استلاف صاحب السنتر</span>
                    <span className="tabular-nums text-navy">
                      {money(cash.safeComposition.remainingAdvances || 0)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-t border-amber-200/80 pt-2 text-base font-black">
                  <span>الإجمالي</span>
                  <span className="tabular-nums">
                    {money(cash.safeComposition.total)}
                  </span>
                </div>
              </div>
            ) : null}

            {cash.safeComposition?.dayCloses?.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold tracking-wide text-navy/50">
                  قفلات أيام لسه جوه الرصيد
                </p>
                <ul className="space-y-1.5">
                  {cash.safeComposition.dayCloses.map((row) => (
                    <li
                      key={row.id}
                      className="flex justify-between gap-2 rounded-lg border border-mist bg-white px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{row.label}</p>
                        <p className="truncate text-[11px] text-navy/45">
                          أصل القفل {money(row.original)}
                          {row.detail ? ` · ${row.detail}` : ''}
                          {row.remaining < row.original - 0.009
                            ? ` · اتخصم منه جزء`
                            : ''}
                        </p>
                      </div>
                      <p className="shrink-0 font-extrabold tabular-nums text-navy">
                        {money(row.remaining)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cash.safeComposition?.onlineSales?.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold tracking-wide text-navy/50">
                  أكواد لسه جوه الرصيد
                </p>
                <ul className="space-y-1.5">
                  {cash.safeComposition.onlineSales.map((row) => (
                    <li
                      key={row.id}
                      className="flex justify-between gap-2 rounded-lg border border-mist bg-white px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{row.label}</p>
                        <p className="truncate text-[11px] text-navy/45">
                          {row.businessDate || ''}
                          {row.detail ? ` · ${row.detail}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 font-extrabold tabular-nums text-navy">
                        {money(row.remaining)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cash.safeComposition?.handoutSales?.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold tracking-wide text-navy/50">
                  ملازم لسه جوه الرصيد
                </p>
                <ul className="space-y-1.5">
                  {cash.safeComposition.handoutSales.map((row) => (
                    <li
                      key={row.id}
                      className="flex justify-between gap-2 rounded-lg border border-mist bg-white px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">{row.label}</p>
                        <p className="truncate text-[11px] text-navy/45">
                          {row.businessDate || ''}
                          {row.detail ? ` · ${row.detail}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 font-extrabold tabular-nums text-navy">
                        {money(row.remaining)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-navy/10 bg-sand/40 p-3">
              <p className="text-[11px] font-bold tracking-wide text-navy/50">
                حركة الخزنة من أول النظام
              </p>
              <div className="flex justify-between gap-2">
                <span>إجمالي دخل الخزنة</span>
                <span className="font-bold tabular-nums text-emerald-800">
                  + {money(cash.safeBreakdown.intoSafe)}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[12px] text-navy/55">
                <span>منها قفل أيام</span>
                <span className="tabular-nums">
                  {money(cash.safeBreakdown.fromDayCloses)}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[12px] text-navy/55">
                <span>منها أكواد → خزنة</span>
                <span className="tabular-nums">
                  {money(cash.safeBreakdown.fromOnlineSafe)}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[12px] text-navy/55">
                <span>منها ملازم → خزنة</span>
                <span className="tabular-nums">
                  {money(cash.safeBreakdown.fromHandoutSafe)}
                </span>
              </div>
              {(cash.safeBreakdown.ownerAdvanceIn || 0) > 0.009 ? (
                <div className="flex justify-between gap-2">
                  <span>استلاف من صاحب السنتر</span>
                  <span className="font-bold tabular-nums text-emerald-800">
                    + {money(cash.safeBreakdown.ownerAdvanceIn || 0)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <span>مصروفات من الخزنة</span>
                <span className="font-bold tabular-nums text-rose-700">
                  − {money(cash.safeBreakdown.safeExpenses)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>تسليمات لصاحب السنتر</span>
                <span className="font-bold tabular-nums text-rose-700">
                  − {money(cash.safeBreakdown.handedToOwner)}
                </span>
              </div>
              {(cash.safeBreakdown.ownerAdvanceOut || 0) > 0.009 ? (
                <div className="flex justify-between gap-2">
                  <span>سداد استلاف</span>
                  <span className="font-bold tabular-nums text-rose-700">
                    − {money(cash.safeBreakdown.ownerAdvanceOut || 0)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-navy/10 pt-2 text-base font-black">
                <span>الرصيد الحالي</span>
                <span className="tabular-nums text-navy">
                  {money(cash.safeBreakdown.balance)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-navy/50">جاري تحميل التفصيل…</p>
        )}
      </AppDialog>
      <AppDialog
        open={confirm?.kind === 'close'}
        tone="danger"
        title={
          confirm?.date ? `قفل ${formatArDay(confirm.date)}` : 'قفل اليوم'
        }
        message={(() => {
          const ymd = confirm?.date;
          const day = ymd
            ? prevDays.find((d) => d.date === ymd)
            : null;
          const exp = day ? day.expected : todayExpected;
          const cnt = ymd
            ? Number(prevCounted[ymd] || 0)
            : Number(counted || 0);
          const diff = cnt - exp;
          const warn = closeWarningText(
            ymd ? day?.warnings : cash?.closeWarnings,
          );
          return `العدّ ${money(cnt)} هيتحوّل للخزنة.\nالمفروض ${money(exp)} · الفرق ${money(diff)}.${
            ymd ? '' : '\nبعد القفل مصروف الاستقبال يبقى من الخزنة.'
          }${warn ? `\n\n${warn}` : ''}`;
        })()}
        confirmLabel={busy === 'close' ? 'جاري القفل...' : 'تأكيد القفل'}
        cancelLabel="رجوع"
        onConfirm={doClose}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'reopen'}
        tone="danger"
        title="فتح اليوم تاني"
        message={`هيتلغى قفل ${formatArDay(
          confirm?.date || cash?.businessDate || cairoYmd(),
        )} ويرجع الدرج يشتغل عادي (مصروفات الدرج والتحصيل).`}
        confirmLabel={busy === 'reopen' ? 'جاري الفتح...' : 'تأكيد فتح اليوم'}
        cancelLabel="رجوع"
        onConfirm={doReopen}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'handover'}
        tone="info"
        title="تسليم لصاحب السنتر"
        message={`تسليم ${money(Number(handAmount) || 0)} من الخزنة لصاحب السنتر؟`}
        confirmLabel={busy === 'handover' ? 'جاري التسليم...' : 'تأكيد التسليم'}
        cancelLabel="رجوع"
        onConfirm={doHandover}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'advance-in'}
        tone="info"
        title="استلاف من صاحب السنتر"
        message={`تسجيل إن صاحب السنتر حط ${money(Number(advanceAmount) || 0)} من جيبه في الخزنة؟\nهيظهر كمستحق استلاف لحد ما يسترجعه.`}
        confirmLabel={
          busy === 'advance-in' ? 'جاري الحفظ...' : 'تأكيد الاستلاف'
        }
        cancelLabel="رجوع"
        onConfirm={() => void doAdvance('IN')}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'advance-out'}
        tone="danger"
        title="سداد استلاف"
        message={`إرجاع ${money(Number(advanceAmount) || 0)} لصاحب السنتر من الخزنة؟\nالمستحق الحالي ${money(cash?.ownerAdvanceOutstanding ?? 0)}.`}
        confirmLabel={
          busy === 'advance-out' ? 'جاري الحفظ...' : 'تأكيد الاسترجاع'
        }
        cancelLabel="رجوع"
        onConfirm={() => void doAdvance('OUT')}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'del-receipt'}
        tone="danger"
        title="مسح إيصال"
        message={`هيتشال الإيصال من السجل والدرج.\n${confirm?.label || ''}`}
        confirmLabel="مسح الإيصال"
        cancelLabel="رجوع"
        onConfirm={() => void doDeleteReceipt()}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'del-expense'}
        tone="danger"
        title="مسح مصروف"
        message={`هيتشال المصروف من السجل.\n${confirm?.label || ''}`}
        confirmLabel="مسح المصروف"
        cancelLabel="رجوع"
        onConfirm={() => void doDeleteExpense()}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'del-extra'}
        tone="danger"
        title="مسح بيع إيراد إضافي"
        message={`هيتشال من السجل والدرج أو حساب المدرس.\n${confirm?.label || ''}`}
        confirmLabel="مسح البيع"
        cancelLabel="رجوع"
        onConfirm={() => void doDeleteExtra()}
        onClose={() => setConfirm(null)}
      />
      <AppDialog
        open={confirm?.kind === 'settle-hold'}
        tone="info"
        title={`تصفية مع ${confirm?.teacherName || 'المدرس'}`}
        message={
          Number(confirm?.centerToSafe || 0) > 0.009
            ? `هتدفع للمدرس ${money(Number(confirm?.teacherPaid || 0))} وهتحط نصيب السنتر القديم ${money(Number(confirm?.centerToSafe || 0))} في درج اليوم.`
            : `هتدفع للمدرس ${money(Number(confirm?.teacherPaid || 0))} بس. نصيب السنتر داخل الدرج بالفعل من يوم البيع.`
        }
        confirmLabel={
          busy.startsWith('settle-') ? 'جاري التصفية...' : 'تأكيد التصفية'
        }
        cancelLabel="رجوع"
        onConfirm={() => void doSettleHold()}
        onClose={() => setConfirm(null)}
      />
    </AppShell>
  );
}
