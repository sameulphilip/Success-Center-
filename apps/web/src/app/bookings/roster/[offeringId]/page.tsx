'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

type Roster = {
  generatedAt: string;
  paidOnly: boolean;
  offering: {
    id: string;
    teacherName: string;
    subjectName: string;
    isOnline: boolean;
  };
  form: {
    id: string;
    title: string;
    gradeLabel: string;
    academicYear: string;
    subtitle?: string | null;
  };
  totals: { all: number; paid: number; pending: number };
  students: {
    id: string;
    formSerial?: number | null;
    studentName: string;
    studentPhone: string;
    parentPhone: string;
    status: 'SUBMITTED' | 'PAID' | 'CANCELLED';
    receiptNumber?: string | null;
    paidAt?: string | null;
  }[];
};

const STATUS_AR: Record<string, string> = {
  PAID: 'مدفوع',
  SUBMITTED: 'انتظار',
  CANCELLED: 'ملغي',
};

export default function TeacherRosterPrintPage() {
  const params = useParams<{ offeringId: string }>();
  const search = useSearchParams();
  const paidOnly = search.get('paidOnly') === '1';
  const autoPrint = search.get('print') === '1';
  const [pack, setPack] = useState<Roster | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.offeringId) return;
    const q = paidOnly ? '?paidOnly=1' : '';
    api<Roster>(`/booking/offerings/${params.offeringId}/roster${q}`)
      .then(setPack)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'فشل تحميل الكشف'),
      );
  }, [params.offeringId, paidOnly]);

  useEffect(() => {
    if (!pack || !autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [pack, autoPrint]);

  const printedAt = useMemo(() => {
    if (!pack) return '';
    return new Date(pack.generatedAt).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [pack]);

  if (error) {
    return (
      <p className="p-8 text-red-600" dir="rtl">
        {error}
      </p>
    );
  }
  if (!pack) {
    return (
      <p className="p-8 text-navy/50" dir="rtl">
        جاري تجهيز كشف الطلاب…
      </p>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#e8e4dc] p-4 sm:p-6 print:bg-white print:p-0"
      dir="rtl"
    >
      <div className="mx-auto max-w-[210mm] print:hidden mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.print()}
        >
          حفظ PDF / طباعة
        </button>
        <Link
          href={`/bookings/roster/${pack.offering.id}?paidOnly=${paidOnly ? '0' : '1'}`}
          className="btn-ghost"
        >
          {paidOnly ? 'عرض الكل' : 'المدفوع فقط'}
        </Link>
        <Link href="/bookings" className="btn-ghost">
          رجوع للحجز
        </Link>
      </div>

      <article className="roster-sheet mx-auto w-full max-w-[210mm] overflow-hidden bg-white shadow-[0_18px_50px_rgba(11,37,69,0.12)] print:shadow-none">
        <header className="relative bg-[#0B2545] text-white px-7 py-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#C99612] via-[#e8c547] to-[#C99612]" />
          <div className="flex items-center gap-5">
            <div className="text-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/success-logo.png"
                alt={`${CENTER_NAME} · ${FOUNDER_NAME}`}
                className="h-[72px] w-[72px] rounded-full bg-white p-1 object-contain"
              />
              <p className="mt-1 text-[10px] font-semibold text-[#e8c547]">
                {FOUNDER_NAME}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[0.32em] text-[#e8c547] uppercase font-semibold">
                {CENTER_TAGLINE}
              </p>
              <p className="text-3xl font-extrabold tracking-tight leading-none mt-1">
                {CENTER_NAME}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-amber-200">
                {FOUNDER_NAME}
              </p>
              <p className="mt-1 text-sm text-white/70">كشف طلاب المدرس</p>
            </div>
            <div className="hidden sm:block text-left shrink-0">
              <p className="text-[10px] text-white/45">التاريخ</p>
              <p className="text-xs font-semibold tabular-nums">{printedAt}</p>
            </div>
          </div>
        </header>

        <section className="px-7 py-5 border-b border-[#ead9a8] bg-[#fbf7ee]">
          <p className="text-[11px] font-bold tracking-[0.18em] text-[#C99612]">
            {pack.form.gradeLabel} · {pack.form.academicYear}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#0B2545] leading-snug">
            {pack.offering.teacherName}
          </h1>
          <p className="mt-1 text-sm text-[#0B2545]/65">
            {pack.offering.subjectName}
            {pack.offering.isOnline ? ' · Online' : ' · حضور'}
            {' · '}
            {pack.form.title}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white border border-[#ead9a8] px-3 py-2 text-center">
              <p className="text-[10px] text-[#0B2545]/45">الطلاب</p>
              <p className="text-xl font-extrabold text-[#0B2545] tabular-nums">
                {pack.totals.all}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-[#ead9a8] px-3 py-2 text-center">
              <p className="text-[10px] text-[#0B2545]/45">مدفوع</p>
              <p className="text-xl font-extrabold text-emerald-700 tabular-nums">
                {pack.totals.paid}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-[#ead9a8] px-3 py-2 text-center">
              <p className="text-[10px] text-[#0B2545]/45">انتظار</p>
              <p className="text-xl font-extrabold text-amber-700 tabular-nums">
                {pack.totals.pending}
              </p>
            </div>
          </div>
          {pack.paidOnly ? (
            <p className="mt-3 text-[11px] font-semibold text-emerald-800">
              الكشف يشمل الحجوزات المدفوعة فقط
            </p>
          ) : null}
        </section>

        <section className="px-5 py-4">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                <th className="py-2.5 px-2 font-bold w-10">م</th>
                <th className="py-2.5 px-2 font-bold text-right">اسم الطالب</th>
                <th className="py-2.5 px-2 font-bold text-right">الموبايل</th>
                <th className="py-2.5 px-2 font-bold text-right">ولي الأمر</th>
                <th className="py-2.5 px-2 font-bold">الحالة</th>
                <th className="py-2.5 px-2 font-bold">الإيصال</th>
              </tr>
            </thead>
            <tbody>
              {pack.students.map((s, i) => (
                <tr
                  key={s.id}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f4ee]'}
                >
                  <td className="py-2 px-2 tabular-nums text-[#0B2545]/55 font-semibold border-b border-[#eee6d6]">
                    {s.formSerial ?? i + 1}
                  </td>
                  <td className="py-2 px-2 font-bold text-[#0B2545] border-b border-[#eee6d6]">
                    {s.studentName}
                  </td>
                  <td className="py-2 px-2 tabular-nums dir-ltr text-left font-mono text-[11px] border-b border-[#eee6d6]">
                    {s.studentPhone}
                  </td>
                  <td className="py-2 px-2 tabular-nums dir-ltr text-left font-mono text-[11px] border-b border-[#eee6d6]">
                    {s.parentPhone}
                  </td>
                  <td className="py-2 px-2 text-center border-b border-[#eee6d6]">
                    <span
                      className={
                        s.status === 'PAID'
                          ? 'text-emerald-700 font-bold'
                          : 'text-amber-700 font-semibold'
                      }
                    >
                      {STATUS_AR[s.status] || s.status}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center tabular-nums text-[11px] text-[#0B2545]/60 border-b border-[#eee6d6]">
                    {s.receiptNumber || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pack.students.length ? (
            <p className="py-10 text-center text-sm text-[#0B2545]/40">
              لا يوجد طلاب لهذا المدرس في الاستمارة
            </p>
          ) : null}
        </section>

        <footer className="px-7 pb-8 pt-6 grid grid-cols-2 gap-10">
          <div className="text-center">
            <div className="h-12 border-b border-[#0B2545]/25" />
            <p className="mt-2 text-[11px] font-semibold text-[#0B2545]/55">
              توقيع الاستقبال
            </p>
          </div>
          <div className="text-center">
            <div className="h-12 border-b border-[#0B2545]/25" />
            <p className="mt-2 text-[11px] font-semibold text-[#0B2545]/55">
              توقيع المدرس
            </p>
          </div>
          <p className="col-span-2 text-center text-[10px] text-[#0B2545]/35 mt-2">
            Success Center · {FOUNDER_NAME} · كشف رسمي من نظام الحجز · {printedAt}
          </p>
        </footer>
      </article>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          html,
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .roster-sheet {
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
