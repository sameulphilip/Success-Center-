'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { AppDialog } from '@/components/AppDialog';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
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

type FinanceSummary = {
  collectedToday: number;
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
  student?: { firstName?: string; lastName?: string };
  receiptNumber: string;
  amount: string | number;
  method?: string;
  paidAt?: string;
  reason: string;
  reasonDetail?: string;
};

type CashSnapshot = {
  businessDate: string;
  closed: boolean;
  collectedCash: number;
  collectedVodafone: number;
  collectedTotal: number;
  drawerExpenses: number;
  expectedInDrawer: number;
  safeBalance: number;
  ownerBalance: number;
  totalHandedToOwner: number;
  ownerSpent: number;
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

export default function FinancePage() {
  const me = getStoredUser();
  const canReceipts = hasPerm(me?.permissions, 'finance.receipts');
  const canSafe = hasPerm(me?.permissions, 'finance.safe');
  const canClose = hasPerm(me?.permissions, 'finance.close');
  const [payments, setPayments] = useState<ReceiptRow[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [cash, setCash] = useState<CashSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [expForm, setExpForm] = useState({
    amount: '',
    category: 'مستلزمات',
    paidFrom: 'DRAWER' as 'DRAWER' | 'SAFE' | 'OWNER',
    note: '',
  });
  const [counted, setCounted] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [handAmount, setHandAmount] = useState('');
  const [handNote, setHandNote] = useState('');
  const [tab, setTab] = useState<'receipts' | 'safe' | 'close'>(
    canReceipts ? 'receipts' : canSafe ? 'safe' : 'close',
  );
  const [confirm, setConfirm] = useState<null | {
    kind: 'close' | 'handover';
  }>(null);

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
          if (!counted && snap && !snap.closed) {
            setCounted(String(Math.round(snap.expectedInDrawer)));
          }
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

  const expected = cash?.expectedInDrawer ?? 0;
  const countedN = Number(counted);
  const closeDiff = useMemo(() => {
    if (!Number.isFinite(countedN)) return 0;
    return countedN - expected;
  }, [countedN, expected]);

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
      await api('/finance/cash/close-day', {
        method: 'POST',
        body: JSON.stringify({
          countedAmount: Number(counted),
          note: closeNote || undefined,
        }),
      });
      setConfirm(null);
      setCloseNote('');
      await load();
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

      <div
        className={`mb-4 grid gap-2 rounded-xl bg-sand p-1 ${
          [canReceipts, canSafe, canClose].filter(Boolean).length >= 3
            ? 'grid-cols-3'
            : 'grid-cols-2'
        }`}
      >
        {canReceipts ? (
          <button
            type="button"
            className={`rounded-lg py-2.5 text-sm font-bold transition ${
              tab === 'receipts' ? 'bg-[#0B2545] text-white' : 'text-navy/60'
            }`}
            onClick={() => setTab('receipts')}
          >
            الإيصالات ({payments.length})
          </button>
        ) : null}
        {canSafe ? (
          <button
            type="button"
            className={`rounded-lg py-2.5 text-sm font-bold transition ${
              tab === 'safe' ? 'bg-[#0B2545] text-white' : 'text-navy/60'
            }`}
            onClick={() => setTab('safe')}
          >
            الخزنة
          </button>
        ) : null}
        {canClose ? (
          <button
            type="button"
            className={`rounded-lg py-2.5 text-sm font-bold transition ${
              tab === 'close' ? 'bg-[#0B2545] text-white' : 'text-navy/60'
            }`}
            onClick={() => setTab('close')}
          >
            قفل اليوم
          </button>
        ) : null}
      </div>

      {tab === 'safe' || tab === 'close' ? (
      <>
      <PageHero
        eyebrow="CASH"
        title="الخزنة والدرج"
        subtitle="فودافون كاش بتتحسب كاش مع قفل اليوم. مصروف الاستقبال من الدرج، وصاحب السنتر من الخزنة أو بعد التسليم."
        metrics={[
          {
            label: 'المفروض في الدرج',
            value: money(cash?.expectedInDrawer ?? 0),
            highlight: true,
          },
          { label: 'رصيد الخزنة', value: money(cash?.safeBalance ?? 0) },
          {
            label: 'عند صاحب السنتر',
            value: money(cash?.ownerBalance ?? 0),
          },
          {
            label: cash?.closed ? 'اليوم' : 'تحصيل اليوم',
            value: cash?.closed ? 'مقفل' : money(cash?.collectedTotal ?? 0),
          },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-2 mb-4">
        {tab === 'close' ? (
        <SectionCard
          title="قفل اليوم"
          subtitle={
            cash?.closed
              ? `اتقفل · العدّ ${money(Number(cash.close?.countedAmount || 0))}`
              : 'في آخر اليوم: عدّ الفلوس وحطها في الخزنة'
          }
        >
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
              <p className="text-[11px] text-navy/45">المفروض يتعدّ</p>
              <p className="font-extrabold tabular-nums">
                {money(cash?.expectedInDrawer ?? 0)}
              </p>
            </div>
          </div>

          {cash?.closed ? (
            <p className="text-sm text-navy/70">
              اتقفل بواسطة {cash.close?.closedByName || 'موظف'} · فرق العدّ{' '}
              <strong className="tabular-nums">
                {money(Number(cash.close?.difference || 0))}
              </strong>
              {cash.close?.note ? ` · ${cash.close.note}` : ''}
            </p>
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
            </div>
          )}
        </SectionCard>
        ) : null}

        {tab === 'safe' ? (
        <SectionCard
          title="مصروف"
          subtitle="استقبال من الدرج · صاحب السنتر من الخزنة أو بعد التسليم"
        >
          <form onSubmit={submitExpense} className="space-y-3">
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
                <option value="DRAWER" disabled={!!cash?.closed}>
                  درج اليوم (استقبال)
                </option>
                <option value="SAFE">الخزنة (صاحب السنتر في السنتر)</option>
                <option value="OWNER">فلوس صاحب السنتر بعد التسليم</option>
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
      </div>

      {tab === 'safe' ? (
      <>
      <SectionCard
        className="mb-4"
        title="تسليم لصاحب السنتر"
        subtitle="فلوس الخزنة اللي بتديها لصاحب السنتر (عادة مرة في الأسبوع)"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
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
            className="btn-primary w-full sm:w-auto min-h-[42px]"
            disabled={busy === 'handover' || (cash?.safeBalance ?? 0) <= 0}
            onClick={() => setConfirm({ kind: 'handover' })}
          >
            تسليم من الخزنة
          </button>
        </div>
        <p className="mt-2 text-xs text-navy/45">
          المتاح في الخزنة الآن {money(cash?.safeBalance ?? 0)}
        </p>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2 mb-4">
        <SectionCard title="آخر المصروفات">
          <ul className="space-y-2 text-sm">
            {(cash?.expenses || []).map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-mist px-3 py-2 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {e.category} · {fromLabel[e.paidFrom] || e.paidFrom}
                  </p>
                  <p className="text-[11px] text-navy/45">
                    {new Date(e.createdAt).toLocaleString('ar-EG')}
                    {e.createdByName ? ` · ${e.createdByName}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <p className="font-extrabold tabular-nums text-rose-700 shrink-0">
                  {money(Number(e.amount))}
                </p>
              </li>
            ))}
            {!cash?.expenses?.length ? (
              <EmptyState>لا توجد مصروفات بعد</EmptyState>
            ) : null}
          </ul>
        </SectionCard>
        <SectionCard title="التسليمات وقفل الأيام">
          <ul className="space-y-2 text-sm mb-3">
            {(cash?.handovers || []).map((h) => (
              <li
                key={h.id}
                className="rounded-xl bg-sand px-3 py-2 flex justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">تسليم لصاحب السنتر</p>
                  <p className="text-[11px] text-navy/45">
                    {new Date(h.createdAt).toLocaleString('ar-EG')}
                    {h.createdByName ? ` · ${h.createdByName}` : ''}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </div>
                <p className="font-extrabold tabular-nums">
                  {money(Number(h.amount))}
                </p>
              </li>
            ))}
          </ul>
          <ul className="space-y-2 text-sm">
            {(cash?.closes || []).map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-mist px-3 py-2 flex justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">
                    قفل{' '}
                    {String(c.businessDate).slice(0, 10)}
                  </p>
                  <p className="text-[11px] text-navy/45">
                    فودافون {money(Number(c.vodafoneCollected))} · فرق{' '}
                    {money(Number(c.difference))}
                    {c.closedByName ? ` · ${c.closedByName}` : ''}
                  </p>
                </div>
                <p className="font-extrabold tabular-nums">
                  {money(Number(c.countedAmount))}
                </p>
              </li>
            ))}
            {!cash?.handovers?.length && !cash?.closes?.length ? (
              <EmptyState>لا توجد حركات خزنة بعد</EmptyState>
            ) : null}
          </ul>
        </SectionCard>
      </div>
      </>
      ) : null}

      {tab === 'close' ? (
        <SectionCard className="mb-4" title="آخر أيام اتقفلت">
          <ul className="space-y-2 text-sm">
            {(cash?.closes || []).map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-mist px-3 py-2 flex justify-between gap-2"
              >
                <div>
                  <p className="font-semibold">
                    قفل {String(c.businessDate).slice(0, 10)}
                  </p>
                  <p className="text-[11px] text-navy/45">
                    فودافون {money(Number(c.vodafoneCollected))} · فرق{' '}
                    {money(Number(c.difference))}
                    {c.closedByName ? ` · ${c.closedByName}` : ''}
                  </p>
                </div>
                <p className="font-extrabold tabular-nums">
                  {money(Number(c.countedAmount))}
                </p>
              </li>
            ))}
            {!cash?.closes?.length ? (
              <EmptyState>لا يوجد قفل يوم بعد</EmptyState>
            ) : null}
          </ul>
        </SectionCard>
      ) : null}
      </>
      ) : canReceipts ? (
      <>
      <PageHero
        eyebrow="FINANCE"
        title="سجل التحصيل"
        subtitle="كل الإيصالات محفوظة — استمارة / حضور / تحصيل"
        metrics={[
          {
            label: 'تحصيل اليوم',
            value: money(summary?.collectedToday ?? 0),
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
            value: summary?.paymentCount ?? payments.length,
          },
        ]}
      />
      <SectionCard
        title="الإيصالات"
        subtitle="سبب كل إيصال: استمارة حجز، حضور حصة، أو تحصيل آخر"
        badge={
          <span className="badge-ok">
            {summary?.paymentCount ?? payments.length}
          </span>
        }
      >
        <div className="space-y-3 md:hidden">
          {payments.map((p) => (
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
              <p className="font-extrabold tabular-nums text-navy">
                {Number(p.amount).toLocaleString('en-EG')} ج.م
              </p>
            </article>
          ))}
          {!payments.length ? <EmptyState>لا توجد إيصالات</EmptyState> : null}
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
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
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
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length ? <EmptyState>لا توجد إيصالات</EmptyState> : null}
        </div>
      </SectionCard>
      </>
      ) : null}

      <AppDialog
        open={confirm?.kind === 'close'}
        tone="danger"
        title="قفل اليوم"
        message={`العدّ ${money(Number(counted) || 0)} هيتحوّل للخزنة.\nالمفروض ${money(expected)} · الفرق ${money(closeDiff)}.\nبعد القفل مصروف الاستقبال يبقى من الخزنة.`}
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
    </AppShell>
  );
}
