'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, PageHero, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';

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

const reasonBadge: Record<string, string> = {
  'استمارة حجز': 'badge-navy',
  'حضور حصة': 'badge-ok',
  'اشتراك مجموعة': 'badge-gold',
  تحصيل: 'badge-warn',
};

export default function FinancePage() {
  const [payments, setPayments] = useState<ReceiptRow[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);

  async function load() {
    const [p, s] = await Promise.all([
      api<ReceiptRow[]>('/finance/payments'),
      api<FinanceSummary>('/finance/summary'),
    ]);
    setPayments(p);
    setSummary(s);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="الحسابات والمدفوعات"
        subtitle="سجل التحصيل الكاش — الإيصالات"
      />
      <PageHero
        eyebrow="FINANCE"
        title="سجل التحصيل"
        subtitle="كل خدمة بتتدفع قبل ما تقدَّم — الإيصال يوضح السبب (استمارة / حضور / …)"
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
    </AppShell>
  );
}
