'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, PageHero, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { CENTER_NAME } from '@/lib/brand';

function money(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-EG')} ج.م`;
}

function formatArDay(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type ShareBlock = {
  count: number;
  teacherShare: number;
  centerShare: number;
  gross: number;
};

type SettlementRow = {
  id: string;
  date: string;
  createdAt: string;
  teacherName: string;
  online: ShareBlock;
  handout: ShareBlock;
  teacherPaid: number;
  centerShare: number;
  grossAmount: number;
  settledByName?: string | null;
};

type DayGroup = {
  date: string;
  settlements: SettlementRow[];
  teacherPaid: number;
  centerShare: number;
  grossAmount: number;
  onlineTeacher: number;
  onlineCenter: number;
  handoutTeacher: number;
  handoutCenter: number;
  onlineCount: number;
  handoutCount: number;
};

type Report = {
  from: string | null;
  to: string | null;
  generatedAt: string;
  settlements: SettlementRow[];
  byDay: DayGroup[];
  totals: {
    count: number;
    teacherPaid: number;
    centerShare: number;
    grossAmount: number;
    onlineTeacher: number;
    onlineCenter: number;
    handoutTeacher: number;
    handoutCenter: number;
    onlineCount: number;
    handoutCount: number;
  };
};

export default function TeacherSettlementsReportPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (nextFrom) q.set('from', nextFrom);
      if (nextTo) q.set('to', nextTo);
      const suffix = q.toString() ? `?${q}` : '';
      const res = await api<Report>(`/finance/cash/teacher-settlements${suffix}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل التقرير');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const printedAt = useMemo(
    () =>
      new Date().toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [data?.generatedAt],
  );

  return (
    <AppShell>
      <div className="print:hidden">
        <PageHeader
          title="تقرير تصفية المدرسين"
          subtitle="كل أيام التصفية · نصيب المدرس والسنتر في الأكواد والملازم"
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/finance" className="btn-secondary">
                رجوع للحسابات
              </Link>
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.print()}
                disabled={!data?.byDay.length}
              >
                طباعة
              </button>
            </div>
          }
        />

        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <SectionCard className="mb-4" title="الفترة">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-navy/50">من</span>
              <input
                type="date"
                className="field"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-navy/50">إلى</span>
              <input
                type="date"
                className="field"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={() => void load(from, to)}
            >
              {loading ? 'جاري التحميل...' : 'عرض'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={loading}
              onClick={() => {
                setFrom('');
                setTo('');
                void load('', '');
              }}
            >
              كل الأيام
            </button>
          </div>
        </SectionCard>

        {data ? (
          <PageHero
            title={`${data.totals.count} تصفية`}
            subtitle="إجمالي نصيب المدرس ونصيب السنتر من الأكواد والملازم بعد التصفية"
            metrics={[
              { label: 'للمدرس', value: money(data.totals.teacherPaid) },
              {
                label: 'للسنتر',
                value: money(data.totals.centerShare),
                highlight: true,
              },
              { label: 'أكواد · مدرس', value: money(data.totals.onlineTeacher) },
              { label: 'أكواد · سنتر', value: money(data.totals.onlineCenter) },
              {
                label: 'ملازم · مدرس',
                value: money(data.totals.handoutTeacher),
              },
              {
                label: 'ملازم · سنتر',
                value: money(data.totals.handoutCenter),
              },
            ]}
          />
        ) : null}
      </div>

      <div className="mb-4 hidden text-center print:block">
        <p className="text-lg font-black">{CENTER_NAME}</p>
        <p className="text-base font-bold">تقرير تصفية المدرسين — أكواد وملازم</p>
        <p className="text-xs text-black/60">طُبع {printedAt}</p>
      </div>

      {loading && !data ? (
        <p className="text-sm text-navy/50">جاري تحميل التقرير...</p>
      ) : null}

      {data && !data.byDay.length ? (
        <EmptyState>مفيش تصفيات في الفترة دي</EmptyState>
      ) : null}

      {data?.byDay.map((day) => (
        <SectionCard
          key={day.date}
          className="mb-4 break-inside-avoid"
          title={formatArDay(day.date)}
          subtitle={`للمدرس ${money(day.teacherPaid)} · للسنتر ${money(day.centerShare)} · أكواد ${day.onlineCount} · ملازم ${day.handoutCount}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-[11px] text-navy/45">
                  <th className="px-2 py-2 text-right font-medium">المدرس</th>
                  <th className="px-2 py-2 text-left font-medium">أكواد · مدرس</th>
                  <th className="px-2 py-2 text-left font-medium">أكواد · سنتر</th>
                  <th className="px-2 py-2 text-left font-medium">ملازم · مدرس</th>
                  <th className="px-2 py-2 text-left font-medium">ملازم · سنتر</th>
                  <th className="px-2 py-2 text-left font-medium">إجمالي مدرس</th>
                  <th className="px-2 py-2 text-left font-medium">إجمالي سنتر</th>
                </tr>
              </thead>
              <tbody>
                {day.settlements.map((s) => (
                  <tr key={s.id} className="border-t border-navy/5">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-navy">{s.teacherName}</p>
                      <p className="text-[11px] text-navy/40">
                        {s.online.count
                          ? `${s.online.count.toLocaleString('en-EG')} كود`
                          : null}
                        {s.online.count && s.handout.count ? ' · ' : null}
                        {s.handout.count
                          ? `${s.handout.count.toLocaleString('en-EG')} ملزمة`
                          : null}
                        {s.settledByName ? ` · ${s.settledByName}` : ''}
                      </p>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left">
                      {money(s.online.teacherShare)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left text-emerald-800">
                      {money(s.online.centerShare)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left">
                      {money(s.handout.teacherShare)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left text-emerald-800">
                      {money(s.handout.centerShare)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left font-bold">
                      {money(s.teacherPaid)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-left font-bold text-emerald-900">
                      {money(s.centerShare)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-navy/10 bg-sand/40 font-semibold">
                  <td className="px-2 py-2">إجمالي اليوم</td>
                  <td className="px-2 py-2 tabular-nums text-left">
                    {money(day.onlineTeacher)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-left text-emerald-800">
                    {money(day.onlineCenter)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-left">
                    {money(day.handoutTeacher)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-left text-emerald-800">
                    {money(day.handoutCenter)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-left">
                    {money(day.teacherPaid)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-left text-emerald-900">
                    {money(day.centerShare)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      ))}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          nav,
          aside,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </AppShell>
  );
}
