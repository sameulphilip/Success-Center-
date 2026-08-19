'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';

type DashboardStats = {
  generatedAt?: string;
  totalStudents: number;
  totalTeachers: number;
  classesToday: number;
  studentsPresent: number;
  collectedToday: number;
  outstandingStudents: number;
  recentPayments: {
    id: string;
    amount: string;
    receiptNumber: string;
    paidAt?: string;
    student: { firstName: string; lastName: string };
    invoice?: { group?: { name?: string } | null } | null;
  }[];
  attendanceByStatus: { status: string; _count: number }[];
  kpis?: {
    totalStudents: number;
    totalTeachers: number;
    totalGroups: number;
    activeEnrollments: number;
    classesToday: number;
    studentsPresent: number;
    studentsAbsent: number;
    studentsLate: number;
    checkInsToday: number;
    attendanceRateToday: number;
    attendanceRateWeek: number;
    collectedToday: number;
    paymentsTodayCount: number;
    collectedMonth: number;
    paymentsMonthCount: number;
    outstandingStudents: number;
    outstandingAmount: number;
    newStudentsMonth: number;
    markedToday: number;
    intakeToday?: number;
    sessionsTodayAmount?: number;
    extraToday?: number;
    openSessions?: number;
    pendingSessionPay?: number;
  };
  collectionTrend?: { date: string; amount: number }[];
  intakeTrend?: {
    date: string;
    receipts: number;
    sessions: number;
    extra: number;
    total: number;
  }[];
  opsTrend?: { date: string; students: number; amount: number }[];
  attendanceTrend?: {
    date: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    rate: number;
  }[];
  attendanceBySource?: { source: string; _count: number }[];
  topAbsentees?: {
    studentId: string;
    name: string;
    studentUid: string;
    absent: number;
    present: number;
    late: number;
  }[];
  topOutstanding?: {
    id: string;
    status: string;
    due: number;
    dueDate?: string | null;
    student: { id: string; firstName: string; lastName: string };
    groupName: string;
    subject: string;
  }[];
  invoiceStatusBreakdown?: Record<string, number>;
  todaySchedule?: {
    id: string;
    startTime: string;
    endTime: string;
    groupName: string;
    subject: string;
    teacher: string;
    classroom: string;
    enrolled: number;
  }[];
  finance?: {
    receiptsToday: { cash: number; electronic: number; total: number; count: number };
    sessionsToday: {
      cash: number;
      electronic: number;
      total: number;
      count: number;
      centerCut: number;
      checkedIn: number;
    };
    extraToday: {
      codes: number;
      codesCount: number;
      handouts: number;
      handoutsCount: number;
      rentals: number;
      rentalsCount: number;
      total: number;
    };
    extraMonth: number;
    mixToday: { receipts: number; sessions: number; extra: number; bookings: number };
    intakeToday: number;
    expensesToday: number;
    expensesCount: number;
    dayClosed: boolean;
    closeDiff: number | null;
    bookings: { pending: number; paidToday: number; paidTodayCount: number };
    onlineWallet: {
      confirmedAmount: number;
      pendingAmount: number;
      confirmedCount: number;
      pendingCount: number;
    };
  };
  ops?: {
    openCount: number;
    closedToday: number;
    pendingPay: number;
    unpaidTeachers: number;
    entriesToday: number;
    checkedInToday: number;
    amountToday: number;
    centerCutToday: number;
    teacherCutToday: number;
    cashToday: number;
    electronicToday: number;
    openSessions: {
      id: string;
      title?: string | null;
      teacher: string;
      subject: string;
      fee: number;
      entries: number;
    }[];
    topTeachers: {
      teacherId: string;
      name: string;
      students: number;
      amount: number;
      centerCut: number;
    }[];
  };
};

const STATUS_AR: Record<string, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'بعذر',
};

const SOURCE_AR: Record<string, string> = {
  MANUAL: 'يدوي',
  QR_STUDENT: 'QR طالب',
  QR_GATE: 'بوابة',
  NFC_CARD: 'NFC',
};

const INVOICE_AR: Record<string, string> = {
  PENDING: 'معلّق',
  PARTIAL: 'جزئي',
  OVERDUE: 'متأخر',
  PAID: 'مدفوع',
};

const CHART = {
  navy: '#0B2545',
  gold: '#C99612',
  soft: '#163A5F',
  present: '#059669',
  absent: '#DC2626',
  late: '#D97706',
  excused: '#64748B',
  grid: '#E2E8F0',
};

const PIE_COLORS = ['#0B2545', '#C99612', '#163A5F', '#64748B', '#059669'];

function money(n: number) {
  return `${Math.round(Number(n || 0)).toLocaleString('en-EG')} ج.م`;
}

function shortDay(date: string) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12));
  return dt.toLocaleDateString('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'Africa/Cairo',
  });
}

function Kpi({
  label,
  value,
  hint,
  accent = 'navy',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'navy' | 'gold' | 'green' | 'red';
}) {
  const bar = {
    navy: 'bg-navy',
    gold: 'bg-gold',
    green: 'bg-emerald-600',
    red: 'bg-red-600',
  }[accent];

  return (
    <div className="panel relative overflow-hidden p-4 sm:p-5">
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <p className="text-xs font-semibold text-navy/50">{label}</p>
      <p className="mt-2 text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-navy">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-navy/45">{hint}</p> : null}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontFamily: 'Cairo',
  fontSize: 12,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<DashboardStats>('/dashboard/stats');
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل اللوحة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const k = stats?.kpis;
  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const attendancePie = useMemo(
    () =>
      (stats?.attendanceByStatus || []).map((a) => ({
        name: STATUS_AR[a.status] || a.status,
        value: a._count,
        key: a.status,
      })),
    [stats],
  );

  const sourceBars = useMemo(
    () =>
      (stats?.attendanceBySource || []).map((a) => ({
        source: SOURCE_AR[a.source] || a.source,
        count: a._count,
      })),
    [stats],
  );

  const collectionChart = useMemo(
    () =>
      (stats?.collectionTrend || []).map((d) => ({
        ...d,
        label: shortDay(d.date),
      })),
    [stats],
  );

  const attendanceRateChart = useMemo(
    () =>
      (stats?.attendanceTrend || []).map((d) => ({
        ...d,
        label: shortDay(d.date),
      })),
    [stats],
  );

  const intakeChart = useMemo(
    () =>
      (stats?.intakeTrend || []).map((d) => ({
        ...d,
        label: shortDay(d.date),
      })),
    [stats],
  );

  const opsChart = useMemo(
    () =>
      (stats?.opsTrend || []).map((d) => ({
        ...d,
        label: shortDay(d.date),
      })),
    [stats],
  );

  const mixPie = useMemo(() => {
    const m = stats?.finance?.mixToday;
    if (!m) return [];
    return [
      { name: 'إيصالات', value: m.receipts, key: 'receipts' },
      { name: 'حصص', value: m.sessions, key: 'sessions' },
      { name: 'إيراد إضافي', value: m.extra, key: 'extra' },
    ].filter((x) => x.value > 0);
  }, [stats]);

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = (stats?.todaySchedule || []).filter((s) => {
    const [h, m] = s.startTime.split(':').map(Number);
    return h * 60 + m >= nowMinutes - 30;
  });

  return (
    <AppShell>
      <PageHeader
        title="لوحة التشغيل"
        subtitle={`${today} · تحليلات مباشرة لإدارة السنتر`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="btn-ghost text-sm"
              disabled={loading}
            >
              {loading ? 'جاري التحديث...' : 'تحديث'}
            </button>
            <Link href="/reports" className="btn-primary text-sm">
              التقارير التفصيلية
            </Link>
          </div>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Pulse strip */}
      <section className="mb-5 overflow-hidden rounded-2xl bg-[#0B2545] text-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.22em] text-amber-300 font-bold">
              SUCCESS OPS
            </p>
            <p className="mt-2 text-sm text-white/60">
              حسابات · تشغيل حصص · حضور — يُحدَّث كل دقيقة
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/10 px-3 py-2 min-w-[96px]">
              <p className="text-[11px] text-white/55">دخل اليوم</p>
              <p className="text-xl font-extrabold text-amber-300 tabular-nums">
                {Number(k?.intakeToday ?? 0).toLocaleString('en-EG')}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 min-w-[96px]">
              <p className="text-[11px] text-white/55">حصص مفتوحة</p>
              <p className="text-xl font-extrabold tabular-nums">
                {k?.openSessions ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 min-w-[96px]">
              <p className="text-[11px] text-white/55">تحصيل اليوم</p>
              <p className="text-xl font-extrabold tabular-nums">
                {Number(k?.collectedToday ?? stats?.collectedToday ?? 0).toLocaleString('en-EG')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="الطلاب النشطون"
          value={k?.totalStudents ?? stats?.totalStudents ?? '—'}
          hint={`جدد هذا الشهر: ${k?.newStudentsMonth ?? 0}`}
        />
        <Kpi
          label="المدرسون / المجموعات"
          value={`${k?.totalTeachers ?? stats?.totalTeachers ?? 0} / ${k?.totalGroups ?? 0}`}
          hint={`تسجيلات نشطة: ${k?.activeEnrollments ?? 0}`}
          accent="gold"
        />
        <Kpi
          label="حضور اليوم"
          value={k?.studentsPresent ?? stats?.studentsPresent ?? '—'}
          hint={`غياب ${k?.studentsAbsent ?? 0} · تأخير ${k?.studentsLate ?? 0}`}
          accent="green"
        />
        <Kpi
          label="تحصيل اليوم"
          value={money(k?.collectedToday ?? stats?.collectedToday ?? 0)}
          hint={`${k?.paymentsTodayCount ?? 0} عملية`}
          accent="gold"
        />
        <Kpi
          label="تحصيل الشهر"
          value={money(k?.collectedMonth ?? 0)}
          hint={`${k?.paymentsMonthCount ?? 0} إيصال`}
        />
        <Kpi
          label="تسجيلات اليوم"
          value={k?.markedToday ?? '—'}
          hint="كل حالات الحضور المسجّلة"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="دخل السنتر اليوم"
          value={money(stats?.finance?.intakeToday ?? k?.intakeToday ?? 0)}
          hint={`إيصالات ${money(stats?.finance?.mixToday?.receipts ?? 0)} · حصص ${money(stats?.finance?.mixToday?.sessions ?? 0)} · إضافي ${money(stats?.finance?.mixToday?.extra ?? 0)}`}
          accent="gold"
        />
        <Kpi
          label="تشغيل الحصص اليوم"
          value={money(stats?.ops?.amountToday ?? 0)}
          hint={`${stats?.ops?.entriesToday ?? 0} طالب · دخول ${stats?.ops?.checkedInToday ?? 0}`}
          accent="green"
        />
        <Kpi
          label="نصيب السنتر من الحصص"
          value={money(stats?.ops?.centerCutToday ?? 0)}
          hint={`نصيب المدرسين ${money(stats?.ops?.teacherCutToday ?? 0)}`}
        />
        <Kpi
          label="محفظة أونلاين"
          value={money(stats?.finance?.onlineWallet.confirmedAmount ?? 0)}
          hint={`بانتظار ${stats?.finance?.onlineWallet?.pendingCount ?? 0} · استمارات معلّقة ${stats?.finance?.bookings?.pending ?? 0}`}
          accent="red"
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="حصص مفتوحة الآن"
          value={stats?.ops?.openCount ?? 0}
          hint={`اتقفلت النهاردة ${stats?.ops?.closedToday ?? 0} · مدرسين من غير تسوية ${stats?.ops?.unpaidTeachers ?? 0}`}
        />
        <Kpi
          label="إيراد إضافي اليوم"
          value={money(stats?.finance?.extraToday?.total ?? 0)}
          hint={`أكواد ${stats?.finance?.extraToday?.codesCount ?? 0} · ملازم ${stats?.finance?.extraToday?.handoutsCount ?? 0} · قاعات ${stats?.finance?.extraToday?.rentalsCount ?? 0}`}
          accent="gold"
        />
        <Kpi
          label="مصروف اليوم"
          value={money(stats?.finance?.expensesToday ?? 0)}
          hint={
            stats?.finance?.dayClosed
              ? 'اليوم مقفول'
              : `${stats?.finance?.expensesCount ?? 0} حركة`
          }
        />
        <Kpi
          label="كاش / إلكتروني (حصص)"
          value={`${money(stats?.ops?.cashToday ?? 0)}`}
          hint={`فودافون ${money(stats?.ops?.electronicToday ?? 0)}`}
        />
      </div>

      {/* Charts row */}
      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">دخل السنتر حسب المصدر</h3>
              <p className="text-xs text-navy/45 mt-1">
                آخر 14 يوم · إيصالات + حصص + إيراد إضافي
              </p>
            </div>
            <span className="badge-gold">حسابات</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intakeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [money(value), name]}
                />
                <Legend />
                <Bar dataKey="receipts" name="إيصالات" stackId="in" fill={CHART.navy} />
                <Bar dataKey="sessions" name="حصص" stackId="in" fill={CHART.gold} />
                <Bar
                  dataKey="extra"
                  name="إيراد إضافي"
                  stackId="in"
                  fill={CHART.present}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">توزيع دخل اليوم</h3>
              <p className="text-xs text-navy/45 mt-1">منين الفلوس جت</p>
            </div>
            <Link href="/finance" className="text-xs font-semibold text-gold-deep">
              الحسابات
            </Link>
          </div>
          <div className="h-72">
            {mixPie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mixPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {mixPie.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={
                          entry.key === 'receipts'
                            ? CHART.navy
                            : entry.key === 'sessions'
                              ? CHART.gold
                              : CHART.present
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => money(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-navy/40">
                لا يوجد دخل مسجّل اليوم بعد
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">طلاب الحصص اليوم بيوم</h3>
              <p className="text-xs text-navy/45 mt-1">تشغيل الحصص · آخر 14 يوم</p>
            </div>
            <Link href="/ops" className="text-xs font-semibold text-gold-deep">
              تشغيل الحصص
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={opsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) =>
                    name === 'amount' ? [money(value), 'تحصيل'] : [value, 'طلاب']
                  }
                />
                <Bar dataKey="students" name="طلاب" fill={CHART.navy} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">حصص مفتوحة</h3>
            <Link href="/ops" className="text-xs font-semibold text-gold-deep">
              فتح التشغيل
            </Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {(stats?.ops?.openSessions || []).map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-mist bg-sand/60 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-navy text-sm truncate">
                    {s.teacher}
                  </p>
                  <span className="text-[11px] font-bold tabular-nums text-navy">
                    {s.entries} طالب
                  </span>
                </div>
                <p className="text-xs text-navy/45 mt-0.5">
                  {s.subject}
                  {s.title ? ` · ${s.title}` : ''} · {money(s.fee)}
                </p>
              </div>
            ))}
            {!stats?.ops?.openSessions?.length ? (
              <p className="text-sm text-navy/45 py-8 text-center">
                مفيش حصة مفتوحة دلوقتي
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">اتجاه التحصيل (إيصالات)</h3>
              <p className="text-xs text-navy/45 mt-1">آخر 14 يوم</p>
            </div>
            <span className="badge-gold">مالي</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={collectionChart}>
                <defs>
                  <linearGradient id="collectFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.gold} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [money(value), 'التحصيل']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={CHART.gold}
                  strokeWidth={2.5}
                  fill="url(#collectFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">حضور اليوم</h3>
              <p className="text-xs text-navy/45 mt-1">توزيع الحالات</p>
            </div>
            <span className="badge-navy">مباشر</span>
          </div>
          <div className="h-72">
            {attendancePie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendancePie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {attendancePie.map((entry, i) => (
                      <Cell
                        key={entry.key}
                        fill={
                          entry.key === 'PRESENT'
                            ? CHART.present
                            : entry.key === 'ABSENT'
                              ? CHART.absent
                              : entry.key === 'LATE'
                                ? CHART.late
                                : PIE_COLORS[i % PIE_COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-navy/40">
                لا يوجد حضور مسجّل اليوم بعد
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">نسبة الحضور اليومية</h3>
              <p className="text-xs text-navy/45 mt-1">آخر 14 يوم (%)</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceRateChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [`${value}%`, 'نسبة الحضور']}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={CHART.navy}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: CHART.gold }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="section-title">مصدر التسجيل</h3>
              <p className="text-xs text-navy/45 mt-1">اليوم: يدوي / QR / NFC</p>
            </div>
          </div>
          <div className="h-64">
            {sourceBars.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceBars} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="source"
                    width={72}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={CHART.navy} radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-navy/40">
                لا توجد بيانات مصادر بعد
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Tables / lists */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">جدول اليوم</h3>
            <Link href="/calendar" className="text-xs font-semibold text-gold-deep">
              عرض الكل
            </Link>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {(upcoming.length ? upcoming : stats?.todaySchedule || [])
              .slice(0, 10)
              .map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-mist bg-sand/60 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-navy text-sm">
                      {s.startTime} – {s.endTime}
                    </p>
                    <span className="text-[11px] text-navy/45">{s.classroom}</span>
                  </div>
                  <p className="text-sm text-navy/80 mt-1">
                    {s.subject} — {s.groupName}
                  </p>
                  <p className="text-xs text-navy/45 mt-0.5">
                    {s.teacher || '—'} · {s.enrolled} طالب
                  </p>
                </div>
              ))}
            {!stats?.todaySchedule?.length ? (
              <p className="text-sm text-navy/45 py-8 text-center">
                لا توجد حصص اليوم
              </p>
            ) : null}
          </div>
        </section>

        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">أعلى الغياب (الشهر)</h3>
            <Link href="/reports" className="text-xs font-semibold text-gold-deep">
              تقرير الحضور
            </Link>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {(stats?.topAbsentees || []).map((a, idx) => (
              <Link
                key={a.studentId}
                href={`/students/${a.studentId}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-sand px-3 py-2.5 hover:bg-amber-50 transition"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-navy truncate">{a.name}</p>
                    <p className="text-[11px] text-navy/40 font-mono truncate">
                      {a.studentUid}
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="font-extrabold text-red-600 tabular-nums">
                    {a.absent}
                  </p>
                  <p className="text-[10px] text-navy/40">غياب</p>
                </div>
              </Link>
            ))}
            {!stats?.topAbsentees?.length ? (
              <p className="text-sm text-navy/45 py-8 text-center">
                لا يوجد غياب ملحوظ هذا الشهر
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">أعلى المدرسين اليوم (تشغيل الحصص)</h3>
            <Link href="/ops" className="text-xs font-semibold text-gold-deep">
              التشغيل
            </Link>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المدرس</th>
                  <th>الطلاب</th>
                  <th>التحصيل</th>
                  <th>نصيب السنتر</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.ops?.topTeachers || []).map((t) => (
                  <tr key={t.teacherId}>
                    <td className="font-semibold">{t.name}</td>
                    <td className="tabular-nums">{t.students}</td>
                    <td className="font-bold tabular-nums">{money(t.amount)}</td>
                    <td className="tabular-nums">{money(t.centerCut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stats?.ops?.topTeachers?.length ? (
              <p className="text-sm text-navy/45 py-8 text-center">
                مفيش تحصيل حصص مؤكد النهاردة
              </p>
            ) : null}
          </div>
        </section>
        <section className="panel p-5 xl:col-span-2">
          <h3 className="section-title mb-3">كاش مقابل إلكتروني اليوم</h3>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-sand px-3 py-3">
              <p className="text-navy/45 text-xs">إيصالات</p>
              <p className="font-bold text-navy mt-1">
                كاش {money(stats?.finance?.receiptsToday?.cash ?? 0)} · إلكتروني{' '}
                {money(stats?.finance?.receiptsToday?.electronic ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-sand px-3 py-3">
              <p className="text-navy/45 text-xs">حصص</p>
              <p className="font-bold text-navy mt-1">
                كاش {money(stats?.ops?.cashToday ?? 0)} · فودافون{' '}
                {money(stats?.ops?.electronicToday ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-sand px-3 py-3">
              <p className="text-navy/45 text-xs">استمارات مدفوعة اليوم</p>
              <p className="font-bold text-navy mt-1">
                {money(stats?.finance?.bookings?.paidToday ?? 0)} ·{' '}
                {stats?.finance?.bookings?.paidTodayCount ?? 0} استمارة
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">آخر المدفوعات</h3>
            <span className="badge-gold">إيصالات</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>المجموعة</th>
                  <th>الإيصال</th>
                  <th>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentPayments || []).map((p) => (
                  <tr key={p.id}>
                    <td className="font-semibold">
                      {p.student.firstName} {p.student.lastName}
                    </td>
                    <td>{p.invoice?.group?.name || '—'}</td>
                    <td className="font-mono text-xs">{p.receiptNumber}</td>
                    <td className="font-bold tabular-nums">
                      {Number(p.amount).toLocaleString('en-EG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!stats?.recentPayments?.length ? (
              <p className="text-sm text-navy/45 py-8 text-center">
                لا توجد مدفوعات حديثة
              </p>
            ) : null}
          </div>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h3 className="section-title mb-4">اختصارات التشغيل</h3>
          <div className="grid gap-2">
            {[
              { href: '/check-in', label: 'مسح الQR', desc: 'جهاز الباب' },
              { href: '/attendance', label: 'تسجيل الحضور', desc: 'يدوي أو مسح' },
              { href: '/students', label: 'إدارة الطلاب', desc: 'إضافة · كروت' },
              { href: '/finance', label: 'التحصيل والفواتير', desc: 'مدفوعات اليوم' },
              { href: '/bookings', label: 'استمارات الحجز', desc: 'تأكيد دفع كاش' },
              { href: '/ops', label: 'تشغيل الحصص', desc: 'دفع · حضور · قفل' },
              { href: '/check-in', label: 'كشك الباب', desc: 'مسح بعد الدفع فقط' },
              { href: '/revenue', label: 'إيرادات إضافية', desc: 'أونلاين · ملازم · قاعات' },
              { href: '/messaging', label: 'التواصل مع الأولياء', desc: 'حملات رسائل' },
              { href: '/reports', label: 'التقارير', desc: 'ربحية · مالي · حضور' },
            ].map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-xl border border-mist px-3 py-3 hover:border-navy/30 hover:bg-sand transition"
              >
                <p className="font-semibold text-navy text-sm">{item.label}</p>
                <p className="text-xs text-navy/45 mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
