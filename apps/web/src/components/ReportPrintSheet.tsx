import type { ReactNode } from 'react';
import Link from 'next/link';
import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

export function money(n: number | string | undefined | null) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-EG')} ج.م`;
}

export function ReportPrintShell({
  children,
  backHref = '/reports',
}: {
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <div
      className="min-h-screen bg-[#e8e4dc] p-4 sm:p-6 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2 print:hidden">
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          حفظ PDF / طباعة
        </button>
        <Link href={backHref} className="btn-ghost">
          رجوع للتقارير
        </Link>
      </div>
      {children}
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
          .report-sheet {
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
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

export function ReportPrintArticle({ children }: { children: ReactNode }) {
  return (
    <article className="report-sheet mx-auto w-full max-w-[210mm] overflow-hidden bg-[#fbfcfe] text-[#0B2545] shadow-[0_18px_50px_rgba(11,37,69,0.12)] print:overflow-visible print:shadow-none print:max-w-none">
      {children}
    </article>
  );
}

export function ReportPrintHeader({
  reportTitle,
  sectionTitle,
  from,
  to,
  printedAt,
  docNo,
}: {
  reportTitle: string;
  sectionTitle?: string;
  from: string;
  to: string;
  printedAt: string;
  docNo: string;
}) {
  return (
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
          <p className="mt-1 text-sm text-white/70">{reportTitle}</p>
          {sectionTitle ? (
            <p className="mt-0.5 text-xs text-white/55">{sectionTitle}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 text-left sm:block">
          <p className="text-[10px] text-white/45">رقم التقرير</p>
          <p className="font-mono text-sm font-bold tabular-nums text-[#e8c547]">
            {docNo}
          </p>
          <p className="mt-2 text-[10px] text-white/45">تاريخ الطباعة</p>
          <p className="text-xs font-semibold tabular-nums">{printedAt}</p>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C99612]" />
    </header>
  );
}

export function ReportPeriodBanner({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  return (
    <section className="print-keep border-b border-[#ead9a8] bg-[#fbf7ee] px-7 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-[#C99612]">
            فترة التقرير
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-snug tabular-nums">
            {from} → {to}
          </h1>
        </div>
      </div>
    </section>
  );
}

export function ReportPrintBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="print-keep border-b border-[#ead9a8] px-5 py-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-4 w-1 rounded-full bg-[#C99612]" />
        <h2 className="text-[13px] font-extrabold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ReportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'gold' | 'emerald' | 'rose';
}) {
  const valueClass =
    tone === 'gold'
      ? 'text-[#C99612]'
      : tone === 'emerald'
        ? 'text-emerald-800'
        : tone === 'rose'
          ? 'text-rose-800'
          : 'text-[#0B2545]';
  return (
    <div className="rounded-lg border border-[#ead9a8] bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-[#0B2545]/50">{label}</p>
      <p className={`mt-0.5 text-sm font-extrabold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

export function ReportStatsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
  );
}

export function ReportTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
  empty?: string;
}) {
  if (!rows.length) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
        {empty || 'لا توجد بيانات'}
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="bg-[#0B2545] text-white">
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 text-right font-bold first:text-right last:text-left">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}>
            {row.map((cell, j) => (
              <td
                key={j}
                className={`border-b border-[#eee6d6] px-3 py-2 ${
                  j === row.length - 1 ? 'text-left font-bold tabular-nums' : ''
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportPrintFooter({
  docNo,
  printedAt,
}: {
  docNo: string;
  printedAt: string;
}) {
  return (
    <footer className="print-keep px-7 pb-8 pt-6">
      <p className="text-center text-[10px] leading-relaxed text-[#0B2545]/40">
        {CENTER_NAME} Educational Center · {FOUNDER_NAME} · تقرير رسمي من نظام
        التقارير
        <br />
        {docNo} · طُبع {printedAt}
      </p>
    </footer>
  );
}
