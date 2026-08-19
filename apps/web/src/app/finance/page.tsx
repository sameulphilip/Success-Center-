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

type FinanceSummary = {
  collectedToday: number;
  drawerCollectedToday?: number;
  collectedMonth: number;
  collectedAll: number;
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
  }>;
  safeBalance: number;
  ownerBalance?: number;
  ownerExtraRevenue?: number;
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
    confirmedCount: number;
    pendingCount: number;
  };
  teacherHolds?: Array<{
    teacherId: string;
    teacherName: string;
    onlineCount: number;
    handoutCount: number;
    gross: number;
    teacherShare: number;
    centerShare: number;
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

export default function FinancePage() {
  const me = getStoredUser();
  const canReceipts = hasPerm(me?.permissions, 'finance.receipts');
  const canSafe = hasPerm(me?.permissions, 'finance.safe');
  const canClose = hasPerm(me?.permissions, 'finance.close');
  const isReception = me?.role === 'RECEPTION';
  const canOwnerExpense = !isReception;
  const canDelete =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';
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
  const [handAmount, setHandAmount] = useState('');
  const [handNote, setHandNote] = useState('');
  const [showExtraSales, setShowExtraSales] = useState(false);
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
      | 'handover'
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
        subtitle="فودافون كاش بتتحسب كاش مع قفل اليوم. قاعات الاستقبال في الدرج. أكواد وملازم الاستقبال على حساب المدرس لحد التصفية، وبعدين نصيب السنتر يدخل الخزنة."
        metrics={[
          {
            label: 'المفروض في الدرج',
            value: money(cash?.expectedInDrawer ?? 0),
            highlight: true,
          },
          { label: 'رصيد الخزنة', value: money(cash?.safeBalance ?? 0) },
          {
            label: 'حسابات المدرسين',
            value: money(cash?.teacherHoldTotal ?? 0),
          },
          ...(canOwnerExpense || cash?.canOwnerExpense
            ? [
                {
                  label: 'عند صاحب السنتر',
                  value: money(cash?.ownerBalance ?? 0),
                },
              ]
            : []),
          {
            label: cash?.closed ? 'اليوم' : 'تحصيل اليوم',
            value: cash?.closed ? 'مقفل' : money(cash?.collectedTotal ?? 0),
          },
        ]}
      />

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
            <p className="text-[11px] text-navy/45">مؤكد</p>
            <p className="text-xl font-black tabular-nums text-navy">
              {money(cash?.onlineFormWallet?.confirmedAmount ?? 0)}
            </p>
            {(cash?.onlineFormWallet?.pendingCount || 0) > 0 ? (
              <p className="text-[12px] font-semibold text-amber-800">
                بانتظار التأكيد{' '}
                {money(cash?.onlineFormWallet?.pendingAmount ?? 0)}
              </p>
            ) : null}
          </div>
        </div>
      </Link>

      {teacherHolds.length ? (
      <SectionCard
        className="mb-4"
        title="حسابات مدرسين مفتوحة"
        subtitle="فلوس أكواد وملازم الاستقبال — تتصفى مع المدرس وبعدين نصيب السنتر يدخل الخزنة"
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
                  {money(h.gross)}
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
                  <p className="text-navy/45">يدخل الخزنة</p>
                  <p className="font-bold tabular-nums text-emerald-900">
                    {money(h.centerShare)}
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
                    centerToSafe: h.centerShare,
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
            ? 'القاعات في الدرج · الأكواد والملازم على حساب المدرس لحد التصفية'
            : `الدرج ${money(extraDrawerTotal)} · حساب مدرس ${money(cash?.teacherHoldTotal ?? 0)} · صاحب السنتر ${money(extraOwnerTotal)}`
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
            <p className="mb-2 text-[11px] font-semibold text-navy/55">
              تصفيات مدرسين سابقة
            </p>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[11px] text-navy/40">
                  <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-right font-medium">المدرس</th>
                  <th className="px-3 py-2 text-left font-medium">للمدرس</th>
                  <th className="px-3 py-2 text-left font-medium">للخزنة</th>
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
        <SectionCard
          title="قفل اليوم"
          subtitle={
            todayClosed
              ? `اتقفل · العدّ ${money(Number(cash.close?.countedAmount || 0))}`
              : 'في آخر اليوم: عدّ الفلوس وحطها في الخزنة'
          }
        >
          {prevDays.length ? (
            <div className="mb-4 space-y-3">
              <p className="text-[11px] font-semibold text-navy/55">
                أيام سابقة — قفّل كل يوم لوحده
              </p>
              {prevDays.map((d) => {
                const countedPrev = Number(prevCounted[d.date] ?? '');
                const diff = Number.isFinite(countedPrev)
                  ? countedPrev - d.expected
                  : 0;
                return (
                  <div
                    key={d.date}
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-bold text-amber-950">
                        {formatArDay(d.date)}
                      </p>
                      <p className="text-[12px] tabular-nums text-amber-900/80">
                        المفروض {money(d.expected)}
                      </p>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-[12px]">
                      <div className="rounded-lg bg-white/80 px-2 py-1.5">
                        <p className="text-[10px] text-navy/45">كاش</p>
                        <p className="font-bold tabular-nums">
                          {money(d.collectedCash)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 px-2 py-1.5">
                        <p className="text-[10px] text-navy/45">فودافون</p>
                        <p className="font-bold tabular-nums">
                          {money(d.collectedVodafone)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 px-2 py-1.5">
                        <p className="text-[10px] text-navy/45">مصروف</p>
                        <p className="font-bold tabular-nums text-rose-700">
                          − {money(d.drawerExpenses)}
                        </p>
                      </div>
                    </div>
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
                      className={`mt-1 text-xs font-semibold ${
                        diff === 0
                          ? 'text-emerald-700'
                          : diff < 0
                            ? 'text-rose-700'
                            : 'text-amber-800'
                      }`}
                    >
                      الفرق:{' '}
                      {diff === 0
                        ? 'مطابق'
                        : `${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString('en-EG')} ج.م`}
                    </p>
                    <button
                      type="button"
                      className="btn-primary mt-2 w-full"
                      disabled={busy === 'close'}
                      onClick={() => setConfirm({ kind: 'close', date: d.date })}
                    >
                      قفل {formatArDay(d.date)} وتحويل للخزنة
                    </button>
                    <a
                      href={daySheetHref(d.date)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost mt-2 w-full"
                    >
                      طباعة ورقة {formatArDay(d.date)}
                    </a>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
            <div className="rounded-xl bg-sand px-3 py-2">
              <p className="text-[11px] text-navy/45">كاش</p>
              <p className="font-extrabold tabular-nums">
                {money(cash?.collectedCash ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-sand px-3 py-2">
              <p className="text-[11px] text-navy/45">فودافون ← كاش</p>
              <p className="font-extrabold tabular-nums">
                {money(cash?.collectedVodafone ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-sand px-3 py-2">
              <p className="text-[11px] text-navy/45">مصروف الدرج</p>
              <p className="font-extrabold tabular-nums text-rose-700">
                − {money(cash?.drawerExpenses ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-gold/10 px-3 py-2">
              <p className="text-[11px] text-navy/45">المفروض يتعدّ النهاردة</p>
              <p className="font-extrabold tabular-nums">
                {money(todayExpected)}
              </p>
            </div>
          </div>

          {cash?.collectedBreakdown?.length ? (
            <div className="mb-4 overflow-hidden rounded-xl border border-navy/10">
              <p className="bg-sand px-3 py-2 text-[11px] font-semibold text-navy/55">
                تفصيل تحصيل النهاردة
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-navy/40">
                    <th className="px-3 py-1.5 text-right font-medium">المصدر</th>
                    <th className="px-3 py-1.5 text-left font-medium">كاش</th>
                    <th className="px-3 py-1.5 text-left font-medium">فودافون</th>
                    <th className="px-3 py-1.5 text-left font-medium">الإجمالي</th>
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
          ) : null}

          {cash?.drawerExpenseLines?.length ? (
            <div className="mb-4 overflow-hidden rounded-xl border border-rose-200/70">
              <p className="bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">
                مصروف الدرج النهاردة
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

          {todayClosed ? (
            <div className="space-y-3">
              <p className="text-sm text-navy/70">
                اتقفل بواسطة {cash.close?.closedByName || 'موظف'} · فرق العدّ{' '}
                <strong className="tabular-nums">
                  {money(Number(cash.close?.difference || 0))}
                </strong>
                {cash.close?.note ? ` · ${cash.close.note}` : ''}
              </p>
              <a
                href={daySheetHref(cash.businessDate, true)}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full"
              >
                طباعة ورقة اليوم
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <FieldLabel label="العدّ الفعلي (بعد تحويل فودافون)">
                <input
                  className="field"
                  type="number"
                  min={0}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
              </FieldLabel>
              <p
                className={`text-xs font-semibold ${
                  closeDiff === 0
                    ? 'text-emerald-700'
                    : closeDiff < 0
                      ? 'text-rose-700'
                      : 'text-amber-800'
                }`}
              >
                الفرق عن المفروض:{' '}
                {closeDiff === 0
                  ? 'مطابق'
                  : `${closeDiff > 0 ? '+' : ''}${Math.round(closeDiff).toLocaleString('en-EG')} ج.م`}
              </p>
              <FieldLabel label="ملاحظة (اختياري)">
                <input
                  className="field"
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="سبب أي فرق"
                />
              </FieldLabel>
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
        <SectionCard
          className="h-full"
          title="آخر أيام اتقفلت"
          badge={
            cash?.closes?.length ? (
              <span className="badge-navy">{cash.closes.length}</span>
            ) : null
          }
        >
          {cash?.closes?.length ? (
            <ul className="max-h-52 space-y-1.5 overflow-auto overscroll-contain text-sm lg:max-h-[28rem]">
              {cash.closes.map((c) => {
                const ymd = String(c.businessDate).slice(0, 10);
                return (
                <li
                  key={c.id}
                  className="flex justify-between gap-2 rounded-lg border border-mist px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      قفل {ymd}
                    </p>
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
          return `العدّ ${money(cnt)} هيتحوّل للخزنة.\nالمفروض ${money(exp)} · الفرق ${money(diff)}.${
            ymd ? '' : '\nبعد القفل مصروف الاستقبال يبقى من الخزنة.'
          }`;
        })()}
        confirmLabel={busy === 'close' ? 'جاري القفل...' : 'تأكيد القفل'}
        cancelLabel="رجوع"
        onConfirm={doClose}
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
        message={`هتدفع للمدرس ${money(Number(confirm?.teacherPaid || 0))} وهتحط نصيب السنتر ${money(Number(confirm?.centerToSafe || 0))} في الخزنة.`}
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
