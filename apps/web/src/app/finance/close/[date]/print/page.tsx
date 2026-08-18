'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

type TallyRow = {
  key: string;
  kind: string;
  label: string;
  count: number;
  unit: string;
  amount: number;
  serials: string;
  note?: string;
};

type DaySheet = {
  generatedAt: string;
  businessDate: string;
  dateLabel: string;
  closed: boolean;
  close: {
    cashCollected: number;
    vodafoneCollected: number;
    drawerExpenses: number;
    expectedAmount: number;
    countedAmount: number;
    difference: number;
    transferredToSafe: number;
    note?: string | null;
    closedAt: string;
    closedByName?: string | null;
  } | null;
  collectedCash: number;
  collectedVodafone: number;
  collectedTotal: number;
  drawerExpenses: number;
  expected: number;
  breakdown: Array<{
    key: string;
    label: string;
    cash: number;
    vodafone: number;
    total: number;
  }>;
  tallies: TallyRow[];
  summaryCounts: {
    forms: number;
    formsAmount: number;
    codes: number;
    codesAmount: number;
    handouts: number;
    handoutsAmount: number;
    sessions: number;
  };
  expenses: Array<{
    id: string;
    amount: number;
    category: string;
    note?: string | null;
    createdByName?: string | null;
  }>;
  holdGross: number;
  holdTeacher: number;
  holdCenter: number;
};

function money(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-EG')} ج.م`;
}

function signedMoney(n: number) {
  const v = Math.round(Number(n) || 0);
  if (v === 0) return 'مطابق';
  const body = `${Math.abs(v).toLocaleString('en-EG')} ج.م`;
  return v > 0 ? `+ ${body}` : `− ${body}`;
}

export default function CloseDayPrintPage() {
  const params = useParams<{ date: string }>();
  const search = useSearchParams();
  const autoPrint = search.get('print') === '1';
  const [sheet, setSheet] = useState<DaySheet | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const date = params.date;
    if (!date) return;
    api<DaySheet>(`/finance/cash/day-sheet?date=${encodeURIComponent(date)}`)
      .then(setSheet)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'فشل تحميل ورقة اليوم'),
      );
  }, [params.date]);

  useEffect(() => {
    if (!sheet || !autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [sheet, autoPrint]);

  const printedAt = useMemo(() => {
    if (!sheet) return '';
    return new Date(sheet.generatedAt).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [sheet]);

  if (error) {
    return (
      <p className="p-8 text-red-600" dir="rtl">
        {error}
      </p>
    );
  }

  if (!sheet) {
    return (
      <p className="p-8 text-navy/50" dir="rtl">
        جاري تجهيز محضر قفل اليوم…
      </p>
    );
  }

  const expected = sheet.close?.expectedAmount ?? sheet.expected;
  const counted = sheet.close?.countedAmount;
  const diff = sheet.close?.difference ?? 0;
  const docNo = `SC-${sheet.businessDate.replace(/-/g, '')}`;
  const closedAt = sheet.close?.closedAt
    ? new Date(sheet.close.closedAt).toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div
      className="min-h-screen bg-[#e8e4dc] p-4 sm:p-6 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2 print:hidden">
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          حفظ PDF / طباعة
        </button>
        <Link href="/finance" className="btn-ghost">
          رجوع للحسابات
        </Link>
      </div>

      <article className="close-sheet mx-auto w-full max-w-[210mm] overflow-hidden bg-[#fbfcfe] text-[#0B2545] shadow-[0_18px_50px_rgba(11,37,69,0.12)] print:overflow-visible print:shadow-none print:max-w-none">
        <header className="print-keep relative bg-[#0B2545] px-7 py-6 text-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#C99612] via-[#e8c547] to-[#C99612]" />
          <div className="flex items-center gap-5">
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/success-logo.png"
                alt={`${CENTER_NAME} · ${FOUNDER_NAME}`}
                className="h-[72px] w-[72px] rounded-full bg-white object-contain p-1"
              />
              <p className="mt-1 text-[10px] font-semibold text-[#e8c547]">
                {FOUNDER_NAME}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#e8c547]">
                {CENTER_TAGLINE}
              </p>
              <p className="mt-1 text-3xl font-extrabold leading-none tracking-tight">
                {CENTER_NAME}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-amber-200">
                {FOUNDER_NAME}
              </p>
              <p className="mt-1 text-sm text-white/70">محضر قفل يوم · أعداد وتسلسل</p>
            </div>
            <div className="hidden shrink-0 text-left sm:block">
              <p className="text-[10px] text-white/45">رقم المحضر</p>
              <p className="font-mono text-sm font-bold tabular-nums text-[#e8c547]">
                {docNo}
              </p>
              <p className="mt-2 text-[10px] text-white/45">تاريخ الطباعة</p>
              <p className="text-xs font-semibold tabular-nums">{printedAt}</p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C99612]" />
        </header>

        <section className="print-keep border-b border-[#ead9a8] bg-[#fbf7ee] px-7 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] text-[#C99612]">
                يوم العمل
              </p>
              <h1 className="mt-1 text-2xl font-extrabold leading-snug">
                {sheet.dateLabel}
              </h1>
              <p className="mt-1 font-mono text-sm tabular-nums text-[#0B2545]/55">
                {sheet.businessDate}
              </p>
            </div>
            <div className="text-left">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-extrabold ${
                  sheet.closed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {sheet.closed ? 'محضر معتمد · مقفل' : 'مسودة · غير مقفل'}
              </span>
              {sheet.closed ? (
                <p className="mt-2 text-[12px] text-[#0B2545]/60">
                  أقفله {sheet.close?.closedByName || 'موظف'}
                  {closedAt ? ` · ${closedAt}` : ''}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-amber-800/80">
                  الأرقام للمعاينة قبل اعتماد القفل
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="تحصيل كاش" value={money(sheet.collectedCash)} />
            <Stat label="تحصيل فودافون" value={money(sheet.collectedVodafone)} />
            <Stat
              label="مصروف الدرج"
              value={`− ${money(sheet.drawerExpenses)}`}
              tone="rose"
            />
            <Stat label="المفروض في الدرج" value={money(expected)} gold />
          </div>

          {sheet.close ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="العدّ الفعلي" value={money(counted ?? 0)} />
              <Stat
                label="فرق العدّ"
                value={signedMoney(diff)}
                tone={diff === 0 ? 'emerald' : 'rose'}
              />
              <Stat
                label="محوّل للخزنة"
                value={money(sheet.close.transferredToSafe)}
                gold
              />
            </div>
          ) : null}

          {sheet.close?.note ? (
            <p className="mt-3 rounded-lg border border-[#ead9a8] bg-white px-3 py-2 text-[12px]">
              <span className="font-bold text-[#C99612]">ملاحظة القفل: </span>
              {sheet.close.note}
            </p>
          ) : null}
        </section>

        {sheet.summaryCounts ? (
          <section className="print-keep border-b border-[#ead9a8] px-5 py-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-4 w-1 rounded-full bg-[#C99612]" />
              <h2 className="text-[13px] font-extrabold tracking-tight">
                ملخص أعداد اليوم
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="استمارات"
                value={`${sheet.summaryCounts.forms.toLocaleString('en-EG')} · ${money(sheet.summaryCounts.formsAmount)}`}
              />
              <Stat
                label="أكواد أونلاين"
                value={`${sheet.summaryCounts.codes.toLocaleString('en-EG')} · ${money(sheet.summaryCounts.codesAmount)}`}
              />
              <Stat
                label="ملازم"
                value={`${sheet.summaryCounts.handouts.toLocaleString('en-EG')} · ${money(sheet.summaryCounts.handoutsAmount)}`}
              />
            </div>
          </section>
        ) : null}

        <Block title="التفاصيل حسب التسلسل">
          {sheet.tallies?.length ? (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  <th className="px-3 py-2 text-right font-bold">البيان</th>
                  <th className="px-3 py-2 text-center font-bold">العدد</th>
                  <th className="px-3 py-2 text-right font-bold">التسلسل</th>
                  <th className="px-3 py-2 text-left font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {sheet.tallies.map((t, i) => (
                  <tr
                    key={t.key}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}
                  >
                    <td className="border-b border-[#eee6d6] px-3 py-2">
                      <p className="font-bold">{t.label}</p>
                      {t.note ? (
                        <p className="mt-0.5 text-[10px] text-[#0B2545]/50">
                          {t.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 text-center font-extrabold tabular-nums">
                      {t.count.toLocaleString('en-EG')} {t.unit}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 font-mono text-[11px] leading-relaxed">
                      {t.serials || '—'}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 text-left font-extrabold tabular-nums">
                      {money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
              لا استمارات أو أكواد أو ملازم في هذا اليوم
            </p>
          )}
        </Block>

        {sheet.breakdown.length ? (
          <Block title="تفصيل مصادر التحصيل">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  <th className="px-3 py-2 text-right font-bold">المصدر</th>
                  <th className="px-3 py-2 text-left font-bold">كاش</th>
                  <th className="px-3 py-2 text-left font-bold">فودافون</th>
                  <th className="px-3 py-2 text-left font-bold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {sheet.breakdown.map((b, i) => (
                  <tr key={b.key} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}>
                    <td className="border-b border-[#eee6d6] px-3 py-2 font-semibold">
                      {b.label}
                    </td>
                    <Td>{money(b.cash)}</Td>
                    <Td>{money(b.vodafone)}</Td>
                    <Td strong>{money(b.total)}</Td>
                  </tr>
                ))}
                <tr className="bg-[#0B2545] text-white">
                  <td className="px-3 py-2 font-extrabold">إجمالي التحصيل</td>
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums">
                    {money(sheet.collectedCash)}
                  </td>
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums">
                    {money(sheet.collectedVodafone)}
                  </td>
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums text-[#e8c547]">
                    {money(sheet.collectedTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Block>
        ) : null}

        <Block title={`مصروفات الدرج · ${sheet.expenses.length}`}>
          {sheet.expenses.length ? (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  <th className="w-8 px-3 py-2 font-bold">م</th>
                  <th className="px-3 py-2 text-right font-bold">البند</th>
                  <th className="px-3 py-2 text-right font-bold">البيان</th>
                  <th className="px-3 py-2 text-right font-bold">سجّله</th>
                  <th className="px-3 py-2 text-left font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {sheet.expenses.map((e, i) => (
                  <tr
                    key={e.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}
                  >
                    <td className="border-b border-[#eee6d6] px-3 py-2 text-center tabular-nums text-[#0B2545]/45">
                      {i + 1}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 font-bold">
                      {e.category}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 text-[#0B2545]/70">
                      {e.note || '—'}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2">
                      {e.createdByName || '—'}
                    </td>
                    <td className="border-b border-[#eee6d6] px-3 py-2 text-left font-extrabold tabular-nums text-rose-800">
                      − {money(e.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#f7f4ee]">
                  <td
                    className="px-3 py-2 font-extrabold"
                    colSpan={4}
                  >
                    إجمالي مصروف الدرج
                  </td>
                  <td className="px-3 py-2 text-left font-extrabold tabular-nums text-rose-800">
                    − {money(sheet.drawerExpenses)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
              لا مصروف درج في هذا اليوم
            </p>
          )}
        </Block>

        <footer className="print-keep px-7 pb-8 pt-6">
          <div className="grid grid-cols-2 gap-8">
            <SignBox
              role="الاستقبال"
              name={sheet.close?.closedByName || ''}
            />
            <SignBox role="المراجعة / الإدارة" name="" />
          </div>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-[#0B2545]/40">
            {CENTER_NAME} Educational Center · {FOUNDER_NAME} · محضر رسمي من نظام الحسابات
            <br />
            {docNo} · طُبع {printedAt}
          </p>
        </footer>
      </article>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm 8mm 12mm;
        }
        @media print {
          html,
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            height: auto !important;
            overflow: visible !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .close-sheet {
            box-shadow: none !important;
            overflow: visible !important;
            max-width: none !important;
            width: 100% !important;
          }
          header,
          footer,
          .print-keep {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          h1,
          h2 {
            break-after: avoid;
            page-break-after: avoid;
          }
          table {
            width: 100%;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            page-break-inside: auto;
            break-inside: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
            page-break-after: auto;
          }
          td,
          th {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function Stat({
  label,
  value,
  gold,
  tone,
}: {
  label: string;
  value: string;
  gold?: boolean;
  tone?: 'rose' | 'emerald';
}) {
  const valueCls = gold
    ? 'text-[#a67c0a]'
    : tone === 'rose'
      ? 'text-rose-800'
      : tone === 'emerald'
        ? 'text-emerald-800'
        : 'text-[#0B2545]';
  return (
    <div className="print-keep rounded-xl border border-[#ead9a8] bg-white px-3 py-2.5 text-center">
      <p className="text-[10px] text-[#0B2545]/45">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums ${valueCls}`}>
        {value}
      </p>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="print-block border-b border-[#ead9a8] px-5 py-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-4 w-1 rounded-full bg-[#C99612]" />
        <h2 className="text-[13px] font-extrabold tracking-tight">{title}</h2>
      </div>
      {note ? (
        <p className="mb-3 rounded-lg border border-[#ead9a8] bg-[#fbf7ee] px-3 py-2 text-[11px] leading-relaxed text-[#0B2545]/65">
          {note}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function Td({
  children,
  strong,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`border-b border-[#eee6d6] px-2 py-1.5 text-left tabular-nums ${
        strong ? 'font-extrabold' : 'font-semibold'
      }`}
    >
      {children}
    </td>
  );
}

function SignBox({ role, name }: { role: string; name: string }) {
  return (
    <div className="print-keep rounded-xl border border-[#ead9a8] bg-[#fbf7ee] px-4 py-4">
      <p className="text-[10px] font-bold tracking-[0.16em] text-[#C99612]">
        {role}
      </p>
      <p className="mt-1 min-h-[1.25rem] text-sm font-bold">
        {name || '\u00a0'}
      </p>
      <div className="mt-8 border-b border-[#0B2545]/25" />
      <p className="mt-2 text-[11px] font-semibold text-[#0B2545]/45">
        التوقيع
      </p>
    </div>
  );
}
