'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  ListRow,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

function dueOf(inv: any) {
  return (
    Number(inv.feeAmount) -
    Number(inv.discount) +
    Number(inv.extras) -
    Number(inv.paidAmount)
  );
}

export default function FinancePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [payForm, setPayForm] = useState({
    studentId: '',
    invoiceId: '',
    amount: 0,
  });
  const [payoutForm, setPayoutForm] = useState({
    teacherId: '',
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    deductions: 0,
  });

  async function load() {
    const [i, p, po, t] = await Promise.all([
      api<any[]>('/finance/invoices'),
      api<any[]>('/finance/payments'),
      api<any[]>('/finance/payouts'),
      api<any[]>('/teachers'),
    ]);
    setInvoices(i);
    setPayments(p);
    setPayouts(po);
    setTeachers(t);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    await api('/finance/payments', {
      method: 'POST',
      body: JSON.stringify(payForm),
    });
    await load();
  }

  async function computePayout(e: FormEvent) {
    e.preventDefault();
    await api('/finance/payouts', {
      method: 'POST',
      body: JSON.stringify(payoutForm),
    });
    await load();
  }

  async function computePayoutFromProfit(e: FormEvent) {
    e.preventDefault();
    await api('/finance/payouts/from-profit', {
      method: 'POST',
      body: JSON.stringify(payoutForm),
    });
    await load();
  }

  async function markPayoutPaid(id: string, gross: number, paid: number, deductions: number) {
    const remaining = Math.max(Number(gross) - Number(deductions) - Number(paid), 0);
    if (remaining <= 0) return;
    await api(`/finance/payouts/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount: remaining }),
    });
    await load();
  }

  const outstanding = useMemo(
    () =>
      invoices.reduce((s, inv) => s + Math.max(dueOf(inv), 0), 0),
    [invoices],
  );
  const collected = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments],
  );

  return (
    <AppShell>
      <PageHeader
        title="الحسابات والمدفوعات"
        subtitle="اشتراكات الطلاب ومستحقات المدرسين"
      />
      <PageHero
        eyebrow="FINANCE"
        title="التحصيل والمستحقات"
        subtitle="اختر فاتورة لتسجيل دفعة، أو احتسب مستحقات المدرس"
        metrics={[
          {
            label: 'المتحصل',
            value: Math.round(collected).toLocaleString('en-EG'),
            highlight: true,
          },
          {
            label: 'المتأخرات',
            value: Math.round(outstanding).toLocaleString('en-EG'),
          },
          { label: 'فواتير', value: invoices.length },
          { label: 'إيصالات', value: payments.length },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="فواتير الطلاب"
          subtitle="اضغط فاتورة لتعبئة نموذج الدفع"
          badge={<span className="badge-warn">{invoices.length}</span>}
        >
          <div className="space-y-2 max-h-80 overflow-auto">
            {invoices.map((inv) => {
              const due = dueOf(inv);
              return (
                <ListRow
                  key={inv.id}
                  active={payForm.invoiceId === inv.id}
                  onClick={() =>
                    setPayForm({
                      studentId: inv.studentId,
                      invoiceId: inv.id,
                      amount: Math.max(due, 0),
                    })
                  }
                  title={`${inv.student.firstName} ${inv.student.lastName}`}
                  subtitle={`${inv.group?.name || 'فاتورة'} · ${inv.status}`}
                  trailing={
                    <span className="font-extrabold text-navy tabular-nums">
                      {due.toLocaleString('en-EG')}
                    </span>
                  }
                />
              );
            })}
            {!invoices.length ? <EmptyState>لا توجد فواتير</EmptyState> : null}
          </div>
        </SectionCard>

        <SectionCard title="تسجيل دفعة" subtitle="يصدر إيصالاً تلقائياً">
          <form onSubmit={recordPayment} className="space-y-3">
            <FieldLabel label="معرف الطالب">
              <input
                className="field"
                value={payForm.studentId}
                onChange={(e) =>
                  setPayForm({ ...payForm, studentId: e.target.value })
                }
                required
              />
            </FieldLabel>
            <FieldLabel label="معرف الفاتورة">
              <input
                className="field"
                value={payForm.invoiceId}
                onChange={(e) =>
                  setPayForm({ ...payForm, invoiceId: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="المبلغ">
              <input
                type="number"
                className="field"
                value={payForm.amount}
                onChange={(e) =>
                  setPayForm({ ...payForm, amount: Number(e.target.value) })
                }
                required
              />
            </FieldLabel>
            <button className="btn-primary w-full">إصدار إيصال</button>
          </form>
        </SectionCard>

        <SectionCard title="آخر الإيصالات">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الإيصال</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <td className="font-semibold">
                      {p.student.firstName} {p.student.lastName}
                    </td>
                    <td className="font-mono text-xs">{p.receiptNumber}</td>
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

        <div className="space-y-4">
          <SectionCard title="حساب مستحقات مدرس">
            <form onSubmit={computePayout} className="space-y-3">
              <FieldLabel label="المدرس">
                <select
                  className="field"
                  value={payoutForm.teacherId}
                  onChange={(e) =>
                    setPayoutForm({ ...payoutForm, teacherId: e.target.value })
                  }
                  required
                >
                  <option value="">اختر المدرس</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="من">
                  <input
                    type="date"
                    className="field"
                    value={payoutForm.periodStart}
                    onChange={(e) =>
                      setPayoutForm({
                        ...payoutForm,
                        periodStart: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="إلى">
                  <input
                    type="date"
                    className="field"
                    value={payoutForm.periodEnd}
                    onChange={(e) =>
                      setPayoutForm({
                        ...payoutForm,
                        periodEnd: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
              </div>
              <button className="btn-accent w-full">احتساب من الحضور</button>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={(e) => void computePayoutFromProfit(e as any)}
              >
                احتساب من الربحية
              </button>
            </form>
          </SectionCard>

          <SectionCard title="مستحقات المدرسين">
            <ul className="space-y-2 text-sm">
              {payouts.map((p) => {
                const net =
                  Number(p.grossAmount) - Number(p.deductions || 0);
                const remaining = Math.max(net - Number(p.paidAmount || 0), 0);
                return (
                  <li
                    key={p.id}
                    className="rounded-xl bg-sand px-3 py-2.5 space-y-2"
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-semibold text-navy">
                          {p.teacher.firstName} {p.teacher.lastName}
                        </p>
                        <p className="text-xs text-navy/50">
                          {Number(p.rate) > 0
                            ? `${p.sessionsCount} حصة × ${Number(p.rate)}`
                            : `${p.sessionsCount} عملية ربحية`}{' '}
                          · {p.status}
                        </p>
                      </div>
                      <span className="font-extrabold text-navy tabular-nums">
                        {Number(p.grossAmount).toLocaleString('en-EG')}
                      </span>
                    </div>
                    {remaining > 0 ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs w-full"
                        onClick={() =>
                          void markPayoutPaid(
                            p.id,
                            p.grossAmount,
                            p.paidAmount,
                            p.deductions,
                          )
                        }
                      >
                        تسجيل صرف كامل ({remaining.toLocaleString('en-EG')} EGP)
                      </button>
                    ) : (
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        تم الصرف
                      </p>
                    )}
                  </li>
                );
              })}
              {!payouts.length ? (
                <EmptyState>لا توجد مستحقات محسوبة</EmptyState>
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
