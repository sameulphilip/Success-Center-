'use client';

import { useEffect, useMemo, useState } from 'react';
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
import {
  reportPrintHref,
  SECTION_LABELS,
  TAB_LABELS,
  TAB_SECTIONS,
  type ReportSection,
  type ReportTab,
} from '@/lib/report-print';
import {
  exportFinanceExcel,
  exportPnlExcel,
  exportProfitExcel,
} from '@/lib/report-excel';

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

type Tab = ReportTab;

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [finance, setFinance] = useState<any>(null);
  const [teachers, setTeachers] = useState<any>(null);
  const [profit, setProfit] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [bookings, setBookings] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('pnl');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState<string>('');
  const [notice, setNotice] = useState('');
  const [openTeacherId, setOpenTeacherId] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printTab, setPrintTab] = useState<Tab>('pnl');
  const [printSections, setPrintSections] = useState<ReportSection[]>([]);
  const [printShowCollected, setPrintShowCollected] = useState(true);

  const printOptions = useMemo(() => TAB_SECTIONS[printTab], [printTab]);

  function openPrintPicker(forTab: Tab, preset?: ReportSection[]) {
    setPrintTab(forTab);
    setPrintSections(preset?.length ? [...preset] : [...TAB_SECTIONS[forTab]]);
    setPrintShowCollected(true);
    setPrintOpen(true);
  }

  function togglePrintSection(section: ReportSection) {
    setPrintSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section],
    );
  }

  function confirmPrint() {
    if (!printSections.length) {
      queueMicrotask(() => setPrintOpen(true));
      return;
    }
    const href = reportPrintHref(printTab, from, to, printSections, {
      hideCollected: printTab === 'teachers' && !printShowCollected,
    });
    window.open(href, '_blank', 'noopener,noreferrer');
  }

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
      const [f, t, p, b, n] = await Promise.all([
        api<any>(`/reports/finance?from=${from}&to=${to}`),
        api<any>(`/reports/teachers?from=${from}&to=${to}`),
        api<any>(`/reports/profit?from=${from}&to=${to}`),
        api<any>(`/reports/bookings?from=${from}&to=${to}`),
        api<any>(`/reports/pnl?from=${from}&to=${to}`),
      ]);
      setFinance(f);
      setTeachers(t);
      setProfit(p);
      setBookings(b);
      setPnl(n);
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
          : tab === 'teachers'
            ? `/reports/teachers/pdf?from=${from}&to=${to}`
            : tab === 'bookings'
              ? `/reports/bookings/pdf?from=${from}&to=${to}`
              : tab === 'pnl'
                ? `/reports/pnl/pdf?from=${from}&to=${to}`
                : `/reports/profit/pdf?from=${from}&to=${to}`;
      const name =
        tab === 'finance'
          ? `finance-${from}-${to}.pdf`
          : tab === 'teachers'
            ? `teachers-${from}-${to}.pdf`
            : tab === 'bookings'
              ? `bookings-${from}-${to}.pdf`
              : tab === 'pnl'
                ? `pnl-${from}-${to}.pdf`
                : `profit-${from}-${to}.pdf`;
      await downloadFile(path, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تصدير PDF');
    } finally {
      setExporting(false);
    }
  }

  async function exportExcel() {
    setError('');
    setExcelBusy(true);
    try {
      if (tab === 'pnl') {
        if (!pnl) throw new Error('حمّل التقرير أولاً');
        await exportPnlExcel(pnl, from, to);
      } else if (tab === 'profit') {
        if (!profit) throw new Error('حمّل التقرير أولاً');
        await exportProfitExcel(profit, from, to);
      } else if (tab === 'finance') {
        if (!finance) throw new Error('حمّل التقرير أولاً');
        await exportFinanceExcel(finance, from, to);
      } else {
        throw new Error('Excel متاح لتبويب أرباح ومصروفات · ربحية · مالي');
      }
      setNotice('تم تنزيل ملف Excel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تصدير Excel');
    } finally {
      setExcelBusy(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const pTeachers = usePaged(profit?.byTeacher || [], `t:${from}:${to}`);
  const pSubjects = usePaged(profit?.bySubject || [], `s:${from}:${to}`);
  const pRooms = usePaged(profit?.byRoom || [], `r:${from}:${to}`);
  const pPays = usePaged(finance?.payments || [], `p:${from}:${to}`);
  const pTeacherSessions = usePaged(
    teachers?.byTeacher || [],
    `ts:${from}:${to}`,
  );
  const pBookingForms = usePaged(bookings?.byForm || [], `bf:${from}:${to}`);
  const pBookingPaid = usePaged(bookings?.paid || [], `bp:${from}:${to}`);
  const pExpenses = usePaged(pnl?.expenses || [], `ex:${from}:${to}`);
  const pExpCats = usePaged(pnl?.byCategory || [], `exc:${from}:${to}`);

  const payMethodAr: Record<string, string> = {
    CASH: 'كاش',
    VODAFONE_CASH: 'فودافون',
    INSTAPAY: 'إنستاباي',
    OTHER: 'أخرى',
  };
  const channelAr: Record<string, string> = {
    center: 'من السنتر',
    online: 'أونلاين',
  };

  return (
    <AppShell>
      <PageHeader
        title="التقارير"
        subtitle="أرباح ومصروفات · ربحية · مالي · استمارات · مدرسين"
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
              className="btn-ghost"
              onClick={() => openPrintPicker(tab)}
            >
              طباعة التقرير
            </button>
            <button
              type="button"
              className="btn-accent"
              disabled={exporting}
              onClick={() => void exportPdf()}
            >
              {exporting ? 'جاري التصدير...' : 'تحميل PDF'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                excelBusy ||
                (tab === 'pnl' && !pnl) ||
                (tab === 'profit' && !profit) ||
                (tab === 'finance' && !finance) ||
                tab === 'bookings' ||
                tab === 'teachers'
              }
              onClick={() => void exportExcel()}
              title={
                tab === 'bookings' || tab === 'teachers'
                  ? 'Excel متاح لأرباح ومصروفات · ربحية · مالي'
                  : 'تحميل Excel'
              }
            >
              {excelBusy ? 'جاري Excel...' : 'تحميل Excel'}
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
            label: 'صافي الفترة',
            value: pnl
              ? Math.round(pnl.summary.netProfit).toLocaleString('en-EG')
              : '—',
            highlight: true,
          },
          {
            label: 'حصة السنتر',
            value: pnl
              ? Math.round(pnl.summary.centerShare).toLocaleString('en-EG')
              : '—',
          },
          {
            label: 'المصروفات',
            value: pnl
              ? Math.round(pnl.summary.totalExpenses).toLocaleString('en-EG')
              : '—',
          },
          {
            label: 'إجمالي التحصيل',
            value: pnl
              ? Math.round(pnl.summary.gross).toLocaleString('en-EG')
              : '—',
          },
        ]}
      />

      {error ? <AlertBanner>{error}</AlertBanner> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['pnl', 'أرباح ومصروفات'],
            ['profit', 'ربحية'],
            ['finance', 'مالي'],
            ['bookings', 'استمارات'],
            ['teachers', 'مدرسين'],
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

      {tab === 'pnl' && pnl ? (
        <>
          <div className="mb-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => openPrintPicker('pnl', ['summary'])}
            >
              طباعة الملخص
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => openPrintPicker('pnl')}
            >
              طباعة كامل
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={excelBusy}
              onClick={() => void exportExcel()}
            >
              {excelBusy ? '...' : 'Excel'}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="إجمالي التحصيل"
              value={money(pnl.summary.gross)}
              accent="gold"
            />
            <KpiCard
              label="حصة السنتر"
              value={money(pnl.summary.centerShare)}
              accent="green"
            />
            <KpiCard
              label="المصروفات"
              value={money(pnl.summary.totalExpenses)}
              accent="red"
              hint={`${pnl.summary.expensesCount} حركة`}
            />
            <KpiCard
              label="صافي الربح"
              value={money(pnl.summary.netProfit)}
              accent={Number(pnl.summary.netProfit) >= 0 ? 'green' : 'red'}
              hint="حصة السنتر − المصروفات"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="حصة المدرسين"
              value={money(pnl.summary.teacherShare)}
            />
            <KpiCard
              label="مصروف الدرج"
              value={money(pnl.summary.drawerExpenses)}
            />
            <KpiCard
              label="مصروف الخزنة"
              value={money(pnl.summary.safeExpenses)}
            />
            <KpiCard
              label="من صاحب السنتر"
              value={money(pnl.summary.ownerExpenses)}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(pnl.profitStreams || []).map((stream: any) => (
              <KpiCard
                key={stream.key}
                label={stream.label}
                value={money(stream.gross)}
                hint={`${stream.count || 0} · سنتر ${money(stream.centerShare)}`}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="المصروفات حسب البند"
              action={
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => openPrintPicker('pnl', ['by-category'])}
                >
                  طباعة
                </button>
              }
            >
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>البند</th>
                      <th>المبلغ</th>
                      <th>عدد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pExpCats.slice.map((row: any) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td className="tabular-nums font-bold">
                          {money(row.amount)}
                        </td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!pnl.byCategory?.length ? (
                  <EmptyState>لا مصروفات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pExpCats.page}
                pages={pExpCats.pages}
                total={pExpCats.total}
                size={pExpCats.size}
                from={pExpCats.from}
                to={pExpCats.to}
                onPage={pExpCats.setPage}
              />
            </SectionCard>

            <SectionCard title="حسب مصدر الصرف">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المصدر</th>
                      <th>المبلغ</th>
                      <th>عدد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pnl.bySource || []).map((row: any) => (
                      <tr key={row.key}>
                        <td className="font-medium">{row.label}</td>
                        <td className="tabular-nums font-bold">
                          {money(row.amount)}
                        </td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!pnl.bySource?.length ? (
                  <EmptyState>لا مصروفات في الفترة</EmptyState>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard
              title="قائمة المصروفات"
              action={
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => openPrintPicker('pnl', ['expense-list'])}
                >
                  طباعة
                </button>
              }
            >
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>البند</th>
                      <th>المصدر</th>
                      <th>المبلغ</th>
                      <th>ملاحظة</th>
                      <th>بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pExpenses.slice.map((e: any) => (
                      <tr key={e.id}>
                        <td className="text-xs tabular-nums">
                          {String(e.businessDate).slice(0, 10)}
                        </td>
                        <td className="font-medium">{e.category}</td>
                        <td className="text-xs">{e.paidFromLabel}</td>
                        <td className="tabular-nums font-bold">
                          {money(e.amount)}
                        </td>
                        <td className="text-xs text-navy/55 max-w-[12rem] truncate">
                          {e.note || '—'}
                        </td>
                        <td className="text-xs text-navy/45">
                          {e.createdByName || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!pnl.expenses?.length ? (
                  <EmptyState>لا مصروفات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pExpenses.page}
                pages={pExpenses.pages}
                total={pExpenses.total}
                size={pExpenses.size}
                from={pExpenses.from}
                to={pExpenses.to}
                onPage={pExpenses.setPage}
              />
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === 'profit' && profit ? (
        <>
          <div className="mb-2 flex justify-end">
            <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('profit', ['summary'])}>طباعة الملخص</button>
          </div>
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
            <SectionCard
              title="حسب المدرس"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('profit', ['by-teacher'])}>طباعة</button>
              }
            >
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

            <SectionCard
              title="حسب المادة"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('profit', ['by-subject'])}>طباعة</button>
              }
            >
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

            <SectionCard
              title="حسب القاعة (تأجير)"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('profit', ['by-room'])}>طباعة</button>
              }
            >
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

            <SectionCard
              title="آخر الحصص المقفلة"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('profit', ['recent-sessions'])}>طباعة</button>
              }
            >
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
          <div className="mb-2 flex justify-end">
            <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('finance', ['summary'])}>طباعة الملخص</button>
          </div>
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
              label="عدد الإيصالات"
              value={finance.summary.paymentsCount}
              hint="في الفترة"
            />
            <KpiCard
              label="صافي تقديري"
              value={`${Number(finance.summary.netEstimate).toLocaleString('en-EG')} EGP`}
              accent="green"
            />
          </div>

          <div className="mt-4">
            <SectionCard
              title="آخر المدفوعات"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('finance', ['payments'])}>طباعة</button>
              }
            >
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
          </div>
        </>
      ) : null}

      {tab === 'bookings' && bookings ? (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => openPrintPicker('bookings', ['summary'])}
            >
              طباعة الملخص
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="استمارات مسجّلة"
              value={bookings.summary.submitted}
              hint={`ملغي ${bookings.summary.cancelled}`}
            />
            <KpiCard
              label="مدفوعة"
              value={bookings.summary.paid}
              accent="green"
            />
            <KpiCard
              label="تحصيل الاستمارات"
              value={money(bookings.summary.paidAmount)}
              accent="gold"
            />
            <KpiCard
              label="بانتظار الدفع"
              value={bookings.summary.pending}
              accent="red"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(bookings.byMethod || []).map((row: any) => (
              <KpiCard
                key={row.method}
                label={payMethodAr[row.method] || row.method}
                value={money(row.amount)}
                hint={`${row.count} استمارة`}
              />
            ))}
            {(bookings.byChannel || []).map((row: any) => (
              <KpiCard
                key={row.channel}
                label={channelAr[row.channel] || row.channel}
                value={money(row.amount)}
                hint={`${row.count} استمارة`}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="حسب الاستمارة"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('bookings', ['by-form'])}>طباعة</button>
              }
            >
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الصف</th>
                      <th>مسجّل</th>
                      <th>مدفوع</th>
                      <th>معلّق</th>
                      <th>التحصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pBookingForms.slice.map((row: any) => (
                      <tr key={row.formId}>
                        <td className="font-medium">
                          {row.gradeLabel || row.label}
                        </td>
                        <td className="tabular-nums">{row.submitted}</td>
                        <td className="tabular-nums font-bold text-navy">
                          {row.paid}
                        </td>
                        <td className="tabular-nums">{row.pending}</td>
                        <td className="tabular-nums font-bold">
                          {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!bookings.byForm?.length ? (
                  <EmptyState>لا توجد استمارات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pBookingForms.page}
                pages={pBookingForms.pages}
                total={pBookingForms.total}
                size={pBookingForms.size}
                from={pBookingForms.from}
                to={pBookingForms.to}
                onPage={pBookingForms.setPage}
              />
            </SectionCard>

            <SectionCard
              title="الاستمارات المدفوعة"
              action={
                <button type="button" className="btn-ghost text-xs" onClick={() => openPrintPicker('bookings', ['paid'])}>طباعة</button>
              }
            >
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>م</th>
                      <th>الطالب</th>
                      <th>الصف</th>
                      <th>الدفع</th>
                      <th>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pBookingPaid.slice.map((s: any) => (
                      <tr key={s.id}>
                        <td className="tabular-nums font-bold">
                          {s.formSerial ?? '—'}
                        </td>
                        <td>
                          <span className="font-medium block">
                            {s.studentName}
                          </span>
                          <span className="text-[11px] text-navy/45">
                            {s.studentPhone}
                          </span>
                        </td>
                        <td className="text-xs">
                          {s.form?.gradeLabel || s.form?.title || '—'}
                        </td>
                        <td className="text-xs">
                          {payMethodAr[s.paymentMethod] ||
                            s.paymentMethod ||
                            '—'}
                          {s.payChannel
                            ? ` · ${channelAr[s.payChannel] || s.payChannel}`
                            : ''}
                        </td>
                        <td className="font-bold tabular-nums">
                          {money(s.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!bookings.paid?.length ? (
                  <EmptyState>لا استمارات مدفوعة في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pBookingPaid.page}
                pages={pBookingPaid.pages}
                total={pBookingPaid.total}
                size={pBookingPaid.size}
                from={pBookingPaid.from}
                to={pBookingPaid.to}
                onPage={pBookingPaid.setPage}
              />
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === 'teachers' && teachers ? (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => openPrintPicker('teachers', ['summary'])}
            >
              طباعة الملخص
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="مدرسين"
              value={teachers.summary.teachers}
              accent="gold"
            />
            <KpiCard label="جلسات" value={teachers.summary.sessions} />
            <KpiCard
              label="حضور"
              value={teachers.summary.present}
              hint={`مسجّل ${teachers.summary.registered}`}
              accent="green"
            />
            <KpiCard
              label="تحصيل الجلسات"
              value={money(teachers.summary.collected)}
            />
          </div>

          <div className="mt-4">
            <SectionCard
              title="المدرسين والجلسات"
              action={
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() =>
                    openPrintPicker('teachers', ['teachers-sessions'])
                  }
                >
                  طباعة
                </button>
              }
            >
              <div className="space-y-3">
                {pTeacherSessions.slice.map((t: any) => {
                  const open = openTeacherId === t.teacherId;
                  return (
                    <div
                      key={t.teacherId}
                      className="rounded-xl border border-mist bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        className="w-full text-right px-4 py-3 hover:bg-sand/60 transition"
                        onClick={() =>
                          setOpenTeacherId(open ? '' : t.teacherId)
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-navy">{t.name}</p>
                            <p className="text-[12px] text-navy/50 mt-0.5">
                              {t.sessionsCount} جلسة · حضور {t.presentCount} ·
                              مسجّل {t.registeredCount}
                            </p>
                          </div>
                          <div className="text-left">
                            <p className="tabular-nums font-black text-navy">
                              {money(t.collected)}
                            </p>
                            <p className="text-[11px] text-navy/40">
                              {open ? 'إخفاء الجلسات' : 'عرض الجلسات'}
                            </p>
                          </div>
                        </div>
                      </button>
                      {open ? (
                        <div className="border-t border-mist px-3 py-2 bg-sand/30">
                          <div className="table-scroll">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>التاريخ</th>
                                  <th>المادة</th>
                                  <th>الحالة</th>
                                  <th>حضور</th>
                                  <th>مسجّل</th>
                                  <th>التحصيل</th>
                                </tr>
                              </thead>
                              <tbody>
                    {t.sessions.map((s: any) => (
                                  <tr key={s.id}>
                                    <td className="tabular-nums text-xs">
                                      {s.sessionDate}
                                    </td>
                                    <td>
                                      <span className="font-medium">
                                        {s.subject}
                                      </span>
                                      {s.title ? (
                                        <span className="block text-[11px] text-navy/40">
                                          {s.title}
                                        </span>
                                      ) : null}
                                      {(s.attendees || []).length ? (
                                        <p className="mt-1 text-[11px] text-navy/55 leading-5">
                                          {(s.attendees as any[])
                                            .map((a) =>
                                              a.discounted
                                                ? `${a.name} (${Number(a.amount).toLocaleString('en-EG')} ج.م)`
                                                : a.name,
                                            )
                                            .join(' · ')}
                                        </p>
                                      ) : null}
                                    </td>
                                    <td className="text-xs">
                                      {s.status === 'CLOSED' ? 'مقفولة' : 'مفتوحة'}
                                    </td>
                                    <td className="font-bold tabular-nums text-navy">
                                      {s.present}
                                    </td>
                                    <td className="tabular-nums">{s.registered}</td>
                                    <td className="tabular-nums font-bold">
                                      {money(s.collected)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!teachers.byTeacher?.length ? (
                  <EmptyState>لا توجد جلسات في الفترة</EmptyState>
                ) : null}
              </div>
              <TablePager
                page={pTeacherSessions.page}
                pages={pTeacherSessions.pages}
                total={pTeacherSessions.total}
                size={pTeacherSessions.size}
                from={pTeacherSessions.from}
                to={pTeacherSessions.to}
                onPage={pTeacherSessions.setPage}
              />
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
      <AppDialog
        open={printOpen}
        tone="info"
        title="تخصيص الطباعة"
        message={`اختر الأجزاء اللي تظهر في ${TAB_LABELS[printTab]}`}
        confirmLabel="طباعة المحدد"
        cancelLabel="إلغاء"
        onConfirm={confirmPrint}
        onClose={() => setPrintOpen(false)}
      >
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setPrintSections([...printOptions])}
            >
              تحديد الكل
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setPrintSections([])}
            >
              إلغاء الكل
            </button>
          </div>
          {printOptions.map((section) => {
            const checked = printSections.includes(section);
            return (
              <label
                key={section}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  checked
                    ? 'border-navy/30 bg-sand'
                    : 'border-mist bg-white hover:bg-sand/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0B2545]"
                  checked={checked}
                  onChange={() => togglePrintSection(section)}
                />
                <span className="text-sm font-bold text-navy">
                  {SECTION_LABELS[section]}
                </span>
              </label>
            );
          })}
          {printTab === 'teachers' ? (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                printShowCollected
                  ? 'border-navy/30 bg-sand'
                  : 'border-mist bg-white hover:bg-sand/40'
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0B2545]"
                checked={printShowCollected}
                onChange={(e) => setPrintShowCollected(e.target.checked)}
              />
              <span className="text-sm font-bold text-navy">
                إظهار عمود التحصيل
              </span>
            </label>
          ) : null}
          {!printSections.length ? (
            <p className="text-xs text-rose-700 mt-2">
              لازم تختار جزء واحد على الأقل
            </p>
          ) : (
            <p className="text-xs text-navy/45 mt-2">
              سيتم طباعة {printSections.length} من {printOptions.length}
              {printTab === 'teachers' && !printShowCollected
                ? ' · بدون عمود التحصيل'
                : ''}
            </p>
          )}
        </div>
      </AppDialog>
    </AppShell>
  );
}
