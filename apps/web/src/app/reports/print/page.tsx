'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  money,
  ReportPeriodBanner,
  ReportPrintArticle,
  ReportPrintBlock,
  ReportPrintFooter,
  ReportPrintHeader,
  ReportPrintShell,
  ReportStat,
  ReportStatsGrid,
  ReportTable,
} from '@/components/ReportPrintSheet';
import {
  parseReportSections,
  parseReportTab,
  sectionTitleFor,
  TAB_LABELS,
  type ReportSection,
  type ReportTab,
} from '@/lib/report-print';

const PAY_METHOD_AR: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون',
  INSTAPAY: 'إنستاباي',
  OTHER: 'أخرى',
};

const CHANNEL_AR: Record<string, string> = {
  center: 'من السنتر',
  online: 'أونلاين',
};

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function docNo(
  tab: ReportTab,
  from: string,
  to: string,
  sections?: ReportSection[] | null,
) {
  const base = `RPT-${tab.slice(0, 3).toUpperCase()}-${from.replace(/-/g, '')}`;
  if (sections?.length === 1) {
    return `${base}-${sections[0].slice(0, 4).toUpperCase()}`;
  }
  return `${base}-${to.replace(/-/g, '')}`;
}

function showSection(
  selected: ReportSection[] | null,
  target: ReportSection,
) {
  if (!selected?.length) return true;
  return selected.includes(target);
}

export default function ReportsPrintPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-navy/50" dir="rtl">
          جاري تجهيز التقرير للطباعة…
        </p>
      }
    >
      <ReportsPrintContent />
    </Suspense>
  );
}

function ReportsPrintContent() {
  const search = useSearchParams();
  const tab = parseReportTab(search.get('tab'));
  const selected = parseReportSections(
    search.get('sections'),
    search.get('section'),
    tab,
  );
  const from = search.get('from') || monthStart();
  const to = search.get('to') || today();
  const autoPrint = search.get('print') === '1';
  const hideCollected = search.get('hideCollected') === '1';

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tab) {
      setError('نوع التقرير غير صالح');
      return;
    }
    const path =
      tab === 'profit'
        ? `/reports/profit?from=${from}&to=${to}`
        : tab === 'finance'
          ? `/reports/finance?from=${from}&to=${to}`
          : tab === 'bookings'
            ? `/reports/bookings?from=${from}&to=${to}`
            : `/reports/teachers?from=${from}&to=${to}`;
    api<any>(path)
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'فشل تحميل التقرير'),
      );
  }, [tab, from, to]);

  useEffect(() => {
    if (!data || !autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [data, autoPrint]);

  const printedAt = useMemo(
    () =>
      new Date().toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [data],
  );

  if (error) {
    return (
      <p className="p-8 text-red-600" dir="rtl">
        {error}
      </p>
    );
  }

  if (!tab || !data) {
    return (
      <p className="p-8 text-navy/50" dir="rtl">
        جاري تجهيز التقرير للطباعة…
      </p>
    );
  }

  const reportTitle = TAB_LABELS[tab];
  const sectionTitle = sectionTitleFor(selected, tab);
  const number = docNo(tab, from, to, selected);

  return (
    <ReportPrintShell>
      <ReportPrintArticle>
        <ReportPrintHeader
          reportTitle={reportTitle}
          sectionTitle={sectionTitle}
          from={from}
          to={to}
          printedAt={printedAt}
          docNo={number}
        />
        <ReportPeriodBanner from={from} to={to} />

        {tab === 'profit' ? (
          <ProfitReport data={data} selected={selected} />
        ) : null}
        {tab === 'finance' ? (
          <FinanceReport data={data} selected={selected} />
        ) : null}
        {tab === 'bookings' ? (
          <BookingsReport data={data} selected={selected} />
        ) : null}
        {tab === 'teachers' ? (
          <TeachersReport
            data={data}
            selected={selected}
            hideCollected={hideCollected}
          />
        ) : null}

        <ReportPrintFooter docNo={number} printedAt={printedAt} />
      </ReportPrintArticle>
    </ReportPrintShell>
  );
}

function ProfitReport({
  data,
  selected,
}: {
  data: any;
  selected: ReportSection[] | null;
}) {
  const s = data.summary;
  return (
    <>
      {showSection(selected, 'summary') ? (
        <>
          <ReportPrintBlock title="ملخص الربحية">
            <ReportStatsGrid>
              <ReportStat label="إجمالي التحصيل" value={money(s.totalGross)} tone="gold" />
              <ReportStat label="حصة المدرسين" value={money(s.totalTeacher)} />
              <ReportStat label="حصة السنتر" value={money(s.totalCenter)} tone="emerald" />
              <ReportStat label="استرجاعات الحصص" value={money(s.totalRefunds)} tone="rose" />
            </ReportStatsGrid>
          </ReportPrintBlock>
          <ReportPrintBlock title="مصادر الإيراد">
            <ReportStatsGrid>
              {(
                [
                  ['sessions', 'حصص'],
                  ['online', 'أونلاين'],
                  ['handouts', 'ملازم'],
                  ['rentals', 'قاعات'],
                ] as const
              ).map(([key, label]) => {
                const stream = s.streams[key];
                return (
                  <ReportStat
                    key={key}
                    label={label}
                    value={money(stream.gross)}
                  />
                );
              })}
            </ReportStatsGrid>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['sessions', 'حصص'],
                  ['online', 'أونلاين'],
                  ['handouts', 'ملازم'],
                  ['rentals', 'قاعات'],
                ] as const
              ).map(([key, label]) => {
                const stream = s.streams[key];
                return (
                  <ReportStat
                    key={`${key}-detail`}
                    label={`${label} · عمليات`}
                    value={`${stream.count} · سنتر ${money(stream.centerShare)}`}
                  />
                );
              })}
            </div>
          </ReportPrintBlock>
        </>
      ) : null}

      {showSection(selected, 'by-teacher') ? (
        <ReportPrintBlock title="حسب المدرس">
          <ReportTable
            headers={['المدرس', 'إجمالي', 'حصته', 'السنتر', 'عدد']}
            rows={(data.byTeacher || []).map((row: any) => [
              row.label,
              money(row.gross),
              money(row.teacherShare),
              money(row.centerShare),
              String(row.count),
            ])}
            empty="لا توجد بيانات في الفترة"
          />
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'by-subject') ? (
        <ReportPrintBlock title="حسب المادة">
          <ReportTable
            headers={['المادة', 'إجمالي', 'المدرس', 'السنتر']}
            rows={(data.bySubject || []).map((row: any) => [
              row.label,
              money(row.gross),
              money(row.teacherShare),
              money(row.centerShare),
            ])}
            empty="لا توجد بيانات مواد"
          />
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'by-room') ? (
        <ReportPrintBlock title="حسب القاعة (تأجير)">
          <ReportTable
            headers={['القاعة', 'إيراد السنتر', 'حجوزات']}
            rows={(data.byRoom || []).map((row: any) => [
              row.label,
              money(row.centerShare),
              String(row.count),
            ])}
            empty="لا يوجد تأجير قاعات في الفترة"
          />
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'recent-sessions') ? (
        <ReportPrintBlock title="آخر الحصص المقفلة">
          <ReportTable
            headers={['التاريخ', 'المدرس', 'المادة', 'طلاب', 'مدرس', 'سنتر']}
            rows={(data.recentSessions || []).map((sess: any) => [
              String(sess.sessionDate).slice(0, 10),
              `${sess.teacher.firstName} ${sess.teacher.lastName}`,
              sess.subject?.nameAr || sess.title || 'حصة',
              String(sess.entriesCount),
              money(sess.settledTeacherAmount),
              money(sess.settledCenterAmount),
            ])}
            empty="لا توجد حصص مقفلة"
          />
        </ReportPrintBlock>
      ) : null}
    </>
  );
}

function FinanceReport({
  data,
  selected,
}: {
  data: any;
  selected: ReportSection[] | null;
}) {
  const s = data.summary;
  return (
    <>
      {showSection(selected, 'summary') ? (
        <ReportPrintBlock title="ملخص مالي">
          <ReportStatsGrid>
            <ReportStat label="التحصيل" value={money(s.collected)} tone="gold" />
            <ReportStat label="المفوتر" value={money(s.invoiced)} />
            <ReportStat label="عدد الإيصالات" value={String(s.paymentsCount)} />
            <ReportStat label="صافي تقديري" value={money(s.netEstimate)} tone="emerald" />
          </ReportStatsGrid>
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'payments') ? (
        <ReportPrintBlock title="المدفوعات">
          <ReportTable
            headers={['التاريخ', 'الطالب', 'الإيصال', 'المبلغ']}
            rows={(data.payments || []).map((p: any) => [
              String(p.paidAt).slice(0, 10),
              `${p.student.firstName} ${p.student.lastName}`,
              p.receiptNumber,
              money(p.amount),
            ])}
            empty="لا توجد مدفوعات في الفترة"
          />
        </ReportPrintBlock>
      ) : null}
    </>
  );
}

function BookingsReport({
  data,
  selected,
}: {
  data: any;
  selected: ReportSection[] | null;
}) {
  const s = data.summary;
  return (
    <>
      {showSection(selected, 'summary') ? (
        <>
          <ReportPrintBlock title="ملخص الاستمارات">
            <ReportStatsGrid>
              <ReportStat
                label="استمارات مسجّلة"
                value={String(s.submitted)}
              />
              <ReportStat label="مدفوعة" value={String(s.paid)} tone="emerald" />
              <ReportStat
                label="تحصيل الاستمارات"
                value={money(s.paidAmount)}
                tone="gold"
              />
              <ReportStat
                label="بانتظار الدفع"
                value={String(s.pending)}
                tone="rose"
              />
            </ReportStatsGrid>
          </ReportPrintBlock>
          {(data.byMethod?.length || data.byChannel?.length) ? (
            <ReportPrintBlock title="حسب طريقة الدفع والقناة">
              <ReportStatsGrid>
                {(data.byMethod || []).map((row: any) => (
                  <ReportStat
                    key={row.method}
                    label={PAY_METHOD_AR[row.method] || row.method}
                    value={money(row.amount)}
                  />
                ))}
                {(data.byChannel || []).map((row: any) => (
                  <ReportStat
                    key={row.channel}
                    label={CHANNEL_AR[row.channel] || row.channel}
                    value={money(row.amount)}
                  />
                ))}
              </ReportStatsGrid>
            </ReportPrintBlock>
          ) : null}
        </>
      ) : null}

      {showSection(selected, 'by-form') ? (
        <ReportPrintBlock title="حسب الاستمارة">
          <ReportTable
            headers={['الصف', 'مسجّل', 'مدفوع', 'معلّق', 'التحصيل']}
            rows={(data.byForm || []).map((row: any) => [
              row.gradeLabel || row.label,
              String(row.submitted),
              String(row.paid),
              String(row.pending),
              money(row.amount),
            ])}
            empty="لا توجد استمارات في الفترة"
          />
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'paid') ? (
        <ReportPrintBlock title="الاستمارات المدفوعة">
          <ReportTable
            headers={['م', 'الطالب', 'الهاتف', 'الصف', 'الدفع', 'المبلغ']}
            rows={(data.paid || []).map((row: any) => [
              row.formSerial ?? '—',
              row.studentName,
              row.studentPhone,
              row.form?.gradeLabel || row.form?.title || '—',
              `${PAY_METHOD_AR[row.paymentMethod] || row.paymentMethod || '—'}${
                row.payChannel
                  ? ` · ${CHANNEL_AR[row.payChannel] || row.payChannel}`
                  : ''
              }`,
              money(row.totalAmount),
            ])}
            empty="لا استمارات مدفوعة في الفترة"
          />
        </ReportPrintBlock>
      ) : null}
    </>
  );
}

function TeachersReport({
  data,
  selected,
  hideCollected,
}: {
  data: any;
  selected: ReportSection[] | null;
  hideCollected?: boolean;
}) {
  const s = data.summary;
  return (
    <>
      {showSection(selected, 'summary') ? (
        <ReportPrintBlock title="ملخص المدرسين">
          <ReportStatsGrid>
            <ReportStat label="مدرسين" value={String(s.teachers)} tone="gold" />
            <ReportStat label="جلسات" value={String(s.sessions)} />
            <ReportStat
              label="حضور"
              value={String(s.present)}
              tone="emerald"
            />
            {!hideCollected ? (
              <ReportStat label="تحصيل الجلسات" value={money(s.collected)} />
            ) : (
              <ReportStat
                label="مسجّل"
                value={String(s.registered)}
              />
            )}
          </ReportStatsGrid>
          {hideCollected ? null : (
            <p className="mt-2 text-[11px] text-[#0B2545]/50">
              مسجّل في الجلسات: {s.registered}
            </p>
          )}
        </ReportPrintBlock>
      ) : null}

      {showSection(selected, 'teachers-sessions') ? (
        <>
          {(data.byTeacher || []).map((t: any) => (
            <ReportPrintBlock
              key={t.teacherId}
              title={`${t.name} · ${t.sessionsCount} جلسة · حضور ${t.presentCount}`}
            >
              <p className="mb-2 text-[11px] text-[#0B2545]/55">
                مسجّل {t.registeredCount}
                {hideCollected ? '' : ` · تحصيل ${money(t.collected)}`}
              </p>
              <ReportTable
                headers={
                  hideCollected
                    ? ['التاريخ', 'المادة', 'الحالة', 'حضور', 'مسجّل']
                    : [
                        'التاريخ',
                        'المادة',
                        'الحالة',
                        'حضور',
                        'مسجّل',
                        'التحصيل',
                      ]
                }
                rows={(t.sessions || []).map((sess: any) => {
                  const base = [
                    sess.sessionDate,
                    sess.title
                      ? `${sess.subject} (${sess.title})`
                      : sess.subject,
                    sess.status === 'CLOSED' ? 'مقفولة' : 'مفتوحة',
                    String(sess.present),
                    String(sess.registered),
                  ];
                  return hideCollected
                    ? base
                    : [...base, money(sess.collected)];
                })}
                empty="لا جلسات"
              />
            </ReportPrintBlock>
          ))}
          {!data.byTeacher?.length ? (
            <ReportPrintBlock title="المدرسين والجلسات">
              <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
                لا توجد جلسات في الفترة
              </p>
            </ReportPrintBlock>
          ) : null}
        </>
      ) : null}
    </>
  );
}
