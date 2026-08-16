'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { studentLoginQrSrc, studentLoginUrl } from '@/lib/student-login-qr';

export default function StudentLoginQrPrintPage() {
  const url = useMemo(() => studentLoginUrl(), []);
  const qr = studentLoginQrSrc(url, 520);

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0" dir="rtl">
      <div className="mx-auto max-w-2xl print:hidden mb-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          طباعة الملصق
        </button>
        <Link href="/login-qr" className="btn-ghost">
          رجوع
        </Link>
        <a href={url} target="_blank" rel="noreferrer" className="btn-accent">
          فتح صفحة الطالب
        </a>
      </div>

      <article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:shadow-none print:border-slate-300 print:rounded-none">
        <header className="bg-[#0B2545] text-white px-8 py-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/success-logo.png"
            alt="Success"
            className="mx-auto h-24 w-24 rounded-full bg-white p-1 object-contain shadow"
          />
          <p className="mt-4 text-3xl font-extrabold tracking-tight">Success</p>
          <p className="mt-1 text-[11px] tracking-[0.28em] text-amber-300 uppercase">
            Future Begins Here
          </p>
        </header>

        <div className="px-8 py-8 text-center space-y-3">
          <p className="text-xs tracking-[0.22em] text-amber-700 font-bold">
            دخول الطالب
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B2545] leading-snug">
            امسح الكود وسجّل دخولك
          </h1>
          <p className="text-sm text-slate-500">
            هيفتح صفحة الدخول برقم الموبايل مباشرة
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="Student login QR"
            className="mx-auto mt-4 w-[280px] h-[280px] rounded-2xl border border-slate-200 bg-white p-3"
          />
          <p className="text-xs font-mono text-slate-400 break-all pt-2">{url}</p>
        </div>
      </article>
    </div>
  );
}
