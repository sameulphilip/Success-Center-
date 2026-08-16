'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PrintBrand } from '@/components/BrandMark';

type SharePack = {
  formId: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  academicYear: string;
  gradeLabel: string;
  formFee: number;
  url: string;
  qrDataUrl: string;
};

export default function BookingFormPrintPage() {
  const params = useParams<{ id: string }>();
  const [pack, setPack] = useState<SharePack | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    const baseUrl = window.location.origin;
    api<SharePack>(
      `/booking/forms/${params.id}/share?baseUrl=${encodeURIComponent(baseUrl)}`,
    )
      .then(setPack)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) {
    return <p className="p-8 text-red-600">{error}</p>;
  }

  if (!pack) {
    return <p className="p-8 text-navy/50">جاري تجهيز ملصق الاستمارة…</p>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0" dir="rtl">
      <div className="mx-auto max-w-2xl print:hidden mb-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          طباعة الملصق
        </button>
        <Link href="/bookings" className="btn-ghost">
          رجوع للحجز
        </Link>
        <a href={pack.url} target="_blank" rel="noreferrer" className="btn-accent">
          فتح الاستمارة
        </a>
      </div>

      <article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:shadow-none print:border-slate-300 print:rounded-none">
        <header className="bg-[#0B2545] text-white px-8 py-8">
          <PrintBrand />
        </header>

        <div className="px-8 py-8 text-center space-y-3">
          <p className="text-xs tracking-[0.22em] text-amber-700 font-bold">
            استمارة حجز
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B2545] leading-snug">
            {pack.title}
          </h1>
          <p className="text-sm text-slate-500">
            {pack.gradeLabel} · {pack.academicYear}
            {pack.subtitle ? ` · ${pack.subtitle}` : ''}
          </p>
          {pack.formFee > 0 ? (
            <p className="text-base font-bold text-[#0B2545]">
              سعر الاستمارة:{' '}
              <span className="tabular-nums">
                {Number(pack.formFee).toLocaleString('en-EG')} ج.م
              </span>
            </p>
          ) : null}
        </div>

        <div className="px-8 pb-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pack.qrDataUrl}
            alt="QR للاستمارة"
            className="h-64 w-64 rounded-2xl border border-slate-200 bg-white"
          />
        </div>

        <div className="px-8 pb-8 text-center space-y-2">
          <p className="text-sm font-semibold text-[#0B2545]">
            امسح الكود للتسجيل في الاستمارة
          </p>
          <p className="text-xs text-slate-500 break-all font-mono leading-relaxed">
            {pack.url}
          </p>
          <p className="text-[11px] text-slate-400 pt-2">
            الدفع كاش داخل السنتر بعد التسجيل
          </p>
        </div>
      </article>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          html,
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
