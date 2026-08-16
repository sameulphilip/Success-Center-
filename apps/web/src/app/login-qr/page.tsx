'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/ui';
import { studentLoginQrSrc, studentLoginUrl } from '@/lib/student-login-qr';

export default function StudentLoginQrPage() {
  const url = useMemo(() => studentLoginUrl(), []);
  const qr = studentLoginQrSrc(url, 480);
  const [copied, setCopied] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="QR دخول الطالب"
        subtitle="امسح الكود يفتح صفحة تسجيل الدخول برقم الموبايل مباشرة"
        action={
          <Link href="/login-qr/print" target="_blank" className="btn-primary">
            طباعة الملصق
          </Link>
        }
      />
      <SectionCard>
        <div className="mx-auto max-w-md text-center py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR دخول الطالب"
            className="mx-auto h-64 w-64 rounded-2xl border border-mist bg-white p-3"
          />
          <p className="mt-4 text-sm font-mono break-all text-navy bg-sand rounded-xl px-3 py-2">
            {url}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="btn-accent">
              فتح الصفحة
            </a>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
