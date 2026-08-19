'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  KpiCard,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, downloadFile } from '@/lib/api';
import { AppDialog } from '@/components/AppDialog';

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number | string | undefined | null) {
  return `${Number(n || 0).toLocaleString('en-EG')} EGP`;
}

type Tab = 'finance' | 'attendance' | 'profit';

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [finance, setFinance] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [profit, setProfit] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('profit');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState<string>('');
  const [notice, setNotice] = useState('');

  async function createPayoutFromProfit(teacherId: string, label: string) {
    if (!teacherId || teacherId === 'center-only') {
      setError('لا يمكن إنشاء مستحق لهذا الصف');
      return;
    }
    setPayoutBusy(teacherId);
    setError('');
    try {
      await api('/finance/payouts/from-profit', {
        method: 'POST',
        body: JSON.stringify({
          teacherId,
          periodStart: from,
          periodEnd: to,
        }),
      });
      setError('');
      setNotice(`تم إنشاء مستحق ربحية لـ ${label}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء المستحق');
    } finally {
      setPayoutBusy('');
    }
  }

  async function load() {
    setError('');
    try {
      const [f, a, p] = await Promise.all([
        api<any>(`/reports/finance?from=${from}&to=${to}`),
        api<any>(`/reports/attendance?from=${from}&to=${to}`),
        api<any>(`/reports/profit?from=${from}&to=${to}`),
      ]);
      setFinance(f);
      setAttendance(a);
      setProfit(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل التقارير');
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      const path =
        tab === 'finance'
          ? `/reports/finance/pdf?from=${from}&to=${to}`
          : tab === 'attendance'
            ? `/reports/attendance/pdf?from=${from}&to=${to}`
            : `/reports/profit/pdf?from=${from}&to=${to}`;
      const name =
        tab === 'finance'
          ? `finance-${from}-${to}.pdf`
          : tab === 'attendance'
            ? `attendance-${from}-${to}.pdf`
            : `profit-${from}-${to}.pdf`;
      await downloadFile(path, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تصدير PDF');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const pTeachers = usePaged(profit?.byTeacher || [], `t:${from}:${to}`);
  const pSubjects = usePaged(profit?.bySubject || [], `s:${from}:${to}`);
  const pRooms = usePaged(profit?.byRoom || [], `r:${from}:${to}`);
  const pPays = usePaged(finance?.payments || [], `p:${from}:${to}`);
  const pOutstanding = usePaged(finance?.outstanding || [], `o:${from}:${to}`);
  const pAbsents = usePaged(attendance?.byStudent || [], `a:${from}:${to}`);

  return (
    <AppShell>
      <PageHeader
        title="التقارير"
        subtitle="ربحية · مالي · حضور · تصدير PDF"
        action={
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-navy/50">
              من
              <input
                type="date"
                className="field mt-1"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs text-navy/50">
              إلى
              <input
                type="date"
                className="field mt-1"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button type="button" className="btn-ghost" onClick={() => void load()}>
              تحديث
            </button>
            <button
              type="button"
              className="btn-accent"
              disabled={exporting}
              onClick={() => void exportPdf()}
            >
              {exporting ? 'جاري التصدير...' : 'تحميل PDF'}
            </button>
          </div>
        }
      />

      <PageHero
        eyebrow="REPORTS"
        title="تحليلات الفترة"
        subtitle={`${from} → ${to}`}
        metrics={[
          {
            label: 'إجمالي التحصيل',
            value: profit
              ? Math.round(profit.summary.totalGross).toLocaleString('en-EG')
              : '—',
            highlight: true,
          },
          {
            label: 'حصة السنتر',
            value: profit
              ? Math.round(profit.summary.totalCenter).toLocaleString('en-EG')
              : '—',
          },
          {
            label: 'حصة المدرسين',
            value: profit
              ? Math.round(profit.summary.totalTeacher).toLocaleString('en-EG')
              : '—',
          },
          {
            label: 'المتأخرات',
            value: finance
              ? Math.round(finance.summary.outstandingAmount).toLocaleString(
                  'en-EG',
                )
              : '—',
          },
        ]}
      />

      {error ? <AlertBanner>{error}</AlertBanner> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['profit', 'ربحية'],
            ['finance', 'مالي'],
            ['attendance', 'حضور'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profit' && profit ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="إجمالي التحصيل"
              value={money(profit.summary.totalGross)}
              accent="gold"
            />
            <KpiCard
              label="حصة المدرسين"
              value={money(profit.summary.totalTeacher)}
            />
            <KpiCard
              label="حصة السنتر"
              value={money(profit.summary.totalCenter)}
              accent="green"
            />
            <KpiCard
              label="استرجاعات الحصص"
              value={money(profit.summary.totalRefunds)}
              accent="red"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ['sessions', 'حصص'],
                ['online', 'أونلاين'],
                ['handouts', 'ملازم'],
                ['rentals', 'قاعات'],
              ] as const
            ).map(([key, label]) => {
              const stream = profit.summary.streams[key];
              return (
                <KpiCard
                  key={key}
                  label={label}
                  value={money(stream.gross)}
                  hint={`${stream.count} عملية · سنتر ${money(stream.centerShare)}`}
                />
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SectionCard title="حسب المدرس">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المدرس</th>
                      <th>إجمالي</th>
                      <th>حصته</th>
                      <th>السنتر</th>
                      <th>عدد</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pTeachers.slice.map((row: any) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td className="tabular-nums">{money(row.gross)}</td>
                        <td className="tabular-nums font-bold text-navy">
                          {money(row.teacherShare)}
                        </td>
                        <td className="tabular-nums">{money(row.centerShare)}</td>
                        <td>{row.count}</td>
                        <td>
                          {row.key !== 'center-only' && Number(row.teacherShare) > 0 ? (
                            <button
                              type="button"
                              className="btn-ghost text-xs whitespace-nowrap"
                              disabled={payoutBusy === row.key}
                              onClick={() =>
                                void createPayoutFromProfit(row.key, row.label)
                              }
                            >
                              {payoutBusy === row.key
                                ? '...'
                                : 'تحويل لمستحق'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!profit.byTeacher.length ? (
                  <EmptyState>لا توجد بيانات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pTeachers.page}
                pages={pTeachers.pages}
                total={pTeachers.total}
                size={pTeachers.size}
                from={pTeachers.from}
                to={pTeachers.to}
                onPage={pTeachers.setPage}
              />
            </SectionCard>

            <SectionCard title="حسب المادة">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المادة</th>
                      <th>إجمالي</th>
                      <th>المدرس</th>
                      <th>السنتر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pSubjects.slice.map((row: any) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td className="tabular-nums">{money(row.gross)}</td>
                        <td className="tabular-nums">{money(row.teacherShare)}</td>
                        <td className="tabular-nums">{money(row.centerShare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!profit.bySubject.length ? (
                  <EmptyState>لا توجد بيانات مواد</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pSubjects.page}
                pages={pSubjects.pages}
                total={pSubjects.total}
                size={pSubjects.size}
                from={pSubjects.from}
                to={pSubjects.to}
                onPage={pSubjects.setPage}
              />
            </SectionCard>

            <SectionCard title="حسب القاعة (تأجير)">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>القاعة</th>
                      <th>إيراد السنتر</th>
                      <th>حجوزات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pRooms.slice.map((row: any) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td className="tabular-nums font-bold">
                          {money(row.centerShare)}
                        </td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!profit.byRoom.length ? (
                  <EmptyState>لا يوجد تأجير قاعات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pRooms.page}
                pages={pRooms.pages}
                total={pRooms.total}
                size={pRooms.size}
                from={pRooms.from}
                to={pRooms.to}
                onPage={pRooms.setPage}
              />
            </SectionCard>

            <SectionCard title="آخر الحصص المقفلة">
              <ul className="space-y-2 text-sm max-h-96 overflow-auto">
                {profit.recentSessions.slice(0, 8).map((s: any) => (
                  <li
                    key={s.id}
                    className="flex justify-between gap-3 rounded-xl bg-sand px-3 py-2"
                  >
                    <span>
                      {s.teacher.firstName} {s.teacher.lastName}
                      <span className="text-navy/45">
                        {' '}
                        · {s.subject?.nameAr || s.title || 'حصة'}
                      </span>
                      <span className="block text-xs text-navy/40 mt-0.5">
                        {String(s.sessionDate).slice(0, 10)} · {s.entriesCount}{' '}
                        طالب
                      </span>
                    </span>
                    <span className="text-xs text-left tabular-nums text-navy/70">
                      مدرس {money(s.settledTeacherAmount)}
                      <br />
                      سنتر {money(s.settledCenterAmount)}
                    </span>
                  </li>
                ))}
                {!profit.recentSessions.length ? (
                  <EmptyState>لا توجد حصص مقفلة</EmptyState>
                ) : null}
              </ul>
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === 'finance' && finance ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="التحصيل"
              value={`${Number(finance.summary.collected).toLocaleString('en-EG')} EGP`}
              accent="gold"
            />
            <KpiCard
              label="المفوتر"
              value={`${Number(finance.summary.invoiced).toLocaleString('en-EG')} EGP`}
            />
            <KpiCard
              label="المتأخرات"
              value={`${Number(finance.summary.outstandingAmount).toLocaleString('en-EG')} EGP`}
              hint={`${finance.summary.outstandingStudents} طالب`}
              accent="red"
            />
            <KpiCard
              label="صافي تقديري"
              value={`${Number(finance.summary.netEstimate).toLocaleString('en-EG')} EGP`}
              accent="green"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SectionCard title="آخر المدفوعات">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>الإيصال</th>
                      <th>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pPays.slice.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          {p.student.firstName} {p.student.lastName}
                        </td>
                        <td className="text-navy/45 text-xs font-mono">
                          {p.receiptNumber}
                        </td>
                        <td className="font-bold tabular-nums">
                          {Number(p.amount).toLocaleString('en-EG')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!finance.payments.length ? (
                  <EmptyState>لا توجد مدفوعات</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pPays.page}
                pages={pPays.pages}
                total={pPays.total}
                size={pPays.size}
                from={pPays.from}
                to={pPays.to}
                onPage={pPays.setPage}
              />
            </SectionCard>

            <SectionCard title="المتأخرون في الدفع">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>الحالة</th>
                      <th>المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pOutstanding.slice.map((inv: any) => {
                      const due =
                        Number(inv.feeAmount) -
                        Number(inv.discount) +
                        Number(inv.extras) -
                        Number(inv.paidAmount);
                      return (
                        <tr key={inv.id}>
                          <td>
                            {inv.student.firstName} {inv.student.lastName}
                          </td>
                          <td>
                            <span className="badge-warn">{inv.status}</span>
                          </td>
                          <td className="font-bold text-navy tabular-nums">
                            {due.toLocaleString('en-EG')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePager
                page={pOutstanding.page}
                pages={pOutstanding.pages}
                total={pOutstanding.total}
                size={pOutstanding.size}
                from={pOutstanding.from}
                to={pOutstanding.to}
                onPage={pOutstanding.setPage}
              />
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === 'attendance' && attendance ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="سجلات" value={attendance.summary.totalRecords} />
            <KpiCard
              label="حضور"
              value={attendance.summary.present}
              accent="green"
            />
            <KpiCard
              label="غياب"
              value={attendance.summary.absent}
              accent="red"
            />
            <KpiCard
              label="طلاب متابعون"
              value={attendance.summary.uniqueStudents}
              accent="gold"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SectionCard title="أكثر الطلاب غيابًا">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>حاضر</th>
                      <th>غائب</th>
                      <th>متأخر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pAbsents.slice.map((row: any) => (
                      <tr key={row.student.id}>
                        <td>
                          {row.student.firstName} {row.student.lastName}
                        </td>
                        <td>{row.present}</td>
                        <td className="font-bold text-amber-800">{row.absent}</td>
                        <td>{row.late}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager
                page={pAbsents.page}
                pages={pAbsents.pages}
                total={pAbsents.total}
                size={pAbsents.size}
                from={pAbsents.from}
                to={pAbsents.to}
                onPage={pAbsents.setPage}
              />
            </SectionCard>

            <SectionCard title="سجل الغياب">
              <ul className="space-y-2 text-sm max-h-96 overflow-auto">
                {attendance.absentees.slice(0, 8).map((a: any) => (
                  <li
                    key={a.id}
                    className="flex justify-between gap-3 rounded-xl bg-sand px-3 py-2"
                  >
                    <span>
                      {a.student.firstName} {a.student.lastName}
                      <span className="text-navy/45">
                        {' '}
                        — {a.session.group.subject.nameEn}
                      </span>
                    </span>
                    <span className="text-xs text-navy/40">
                      {String(a.markedAt).slice(0, 10)}
                    </span>
                  </li>
                ))}
                {!attendance.absentees.length ? (
                  <EmptyState>لا يوجد غياب في الفترة</EmptyState>
                ) : null}
              </ul>
            </SectionCard>
          </div>
        </>
      ) : null}
      <AppDialog
        open={!!notice}
        tone="success"
        title="تم"
        message={notice}
        confirmLabel="حسناً"
        onClose={() => setNotice('')}
      />
    </AppShell>
  );
}
