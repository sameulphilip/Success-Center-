'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function StudentCardPrintPage() {
  const params = useParams<{ id: string }>();
  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/qr/students/${params.id}`)
      .then(setCard)
      .catch((e) => setError(e.message));
  }, [params.id]);

  if (error) {
    return <p className="p-8 text-red-600">{error}</p>;
  }

  if (!card) {
    return <p className="p-8 text-navy/50">جاري تجهيز الكارت...</p>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl print:hidden mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => window.print()}>
          طباعة الكارت
        </button>
        <a href={`/students/${params.id}`} className="btn-ghost">
          رجوع لملف الطالب
        </a>
      </div>

      <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2 print:grid-cols-2 print:gap-4">
        {/* Front */}
        <article className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm print:shadow-none aspect-[1.6/1] flex flex-col justify-between">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.2em] text-amber-700 font-bold">
                SUCCESS
              </p>
              <p className="text-[10px] text-slate-500">STUDENT CARD</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/success-logo.png"
              alt="Success"
              className="h-12 w-12 object-contain rounded-full shadow-sm"
            />
          </header>

          <div className="flex items-center gap-4 mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.qrDataUrl}
              alt="Student QR"
              className="h-28 w-28 rounded-lg border border-slate-200 bg-white"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight">
                {card.name}
              </h1>
              <p className="text-sm text-slate-600 mt-1">{card.grade || '—'}</p>
              <p className="text-[11px] text-slate-400 mt-2 break-all">
                UID: {card.studentUid}
              </p>
            </div>
          </div>

          <footer className="text-[10px] text-slate-400 mt-3">
            Future Begins Here · Scan QR for attendance
          </footer>
        </article>

        {/* Back / NFC instructions for staff */}
        <article className="rounded-2xl border border-slate-300 bg-slate-900 text-white p-5 aspect-[1.6/1] flex flex-col justify-between print:break-inside-avoid">
          <div>
            <p className="text-xs tracking-[0.2em] text-amber-300 font-bold">
              NFC + QR
            </p>
            <h2 className="text-lg font-bold mt-2">بيانات البرمجة</h2>
            <p className="text-sm text-white/70 mt-2 leading-relaxed">
              اطبع الـ QR على وجه الكارت، واكتب نفس المعرف على شريحة NFC (NDEF
              Text).
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-3 text-xs break-all">
            <p className="text-amber-200 mb-1">NFC Text</p>
            <p className="font-mono">{card.nfcText}</p>
          </div>

          <div className="rounded-xl bg-white/10 p-3 text-[10px] break-all text-white/70">
            <p className="text-amber-200 mb-1">QR JSON (احتياطي)</p>
            <p className="font-mono">{card.payload}</p>
          </div>
        </article>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
