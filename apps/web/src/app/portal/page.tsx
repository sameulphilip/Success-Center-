'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, changePortalPin, getStoredUser } from '@/lib/api';
import { CENTER_NAME } from '@/lib/brand';

const DAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const STATUS_AR: Record<string, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'بعذر',
};

const SOURCE_AR: Record<string, string> = {
  MANUAL: 'يدوي',
  QR_STUDENT: 'QR',
  QR_GATE: 'بوابة',
  NFC_CARD: 'NFC',
};

const PAY_STATUS_AR: Record<string, string> = {
  CONFIRMED: 'مؤكد',
  PENDING_CONFIRM: 'بانتظار التأكيد',
  REFUNDED: 'مسترجع',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isSessionAttended(e: any) {
  return (
    !!e?.checkedInAt ||
    e?.payStatus === 'CONFIRMED' ||
    e?.payStatus === 'PARTIALLY_REFUNDED'
  );
}

function sessionTeacherName(e: any) {
  return `${e?.session?.teacher?.firstName || ''} ${e?.session?.teacher?.lastName || ''}`.trim() || 'مدرس';
}

function sessionClassName(e: any) {
  return e?.session?.subject?.nameAr || e?.session?.title || 'حصة';
}

function childStats(student: any) {
  const rows = student?.attendance || [];
  const present = rows.filter(
    (a: any) => a.status === 'PRESENT' || a.status === 'LATE',
  ).length;
  const absent = rows.filter((a: any) => a.status === 'ABSENT').length;
  const sessionEntries = student?.sessionEntries || [];
  const sessionPresent = sessionEntries.filter(isSessionAttended).length;
  const sessionPaid = sessionEntries.filter(
    (e: any) => e.payStatus === 'CONFIRMED' || e.payStatus === 'PARTIALLY_REFUNDED',
  ).length;
  const byTeacher: Record<
    string,
    { name: string; present: number; paid: number }
  > = {};
  for (const e of sessionEntries) {
    const name = `${e.session?.teacher?.firstName || ''} ${e.session?.teacher?.lastName || ''}`.trim() || 'مدرس';
    const key = e.session?.teacherId || name;
    if (!byTeacher[key]) byTeacher[key] = { name, present: 0, paid: 0 };
    if (isSessionAttended(e)) {
      byTeacher[key].present += 1;
    }
    if (e.payStatus === 'CONFIRMED' || e.payStatus === 'PARTIALLY_REFUNDED') {
      byTeacher[key].paid += 1;
    }
  }
  const overdue = (student?.invoices || []).reduce((sum: number, inv: any) => {
    const due =
      Number(inv.feeAmount) -
      Number(inv.discount) +
      Number(inv.extras) -
      Number(inv.paidAmount);
    return sum + Math.max(due, 0);
  }, 0);
  const doorPaid = sessionEntries
    .filter((e: any) => e.payStatus === 'CONFIRMED')
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  return {
    present,
    absent,
    sessionPresent,
    sessionPaid,
    sessionByTeacher: Object.values(byTeacher),
    overdue,
    doorPaid,
    blocks: student?.blocks?.length || 0,
    groups: student?.enrollments?.length || 0,
  };
}

export default function StudentPortalPage() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [qr, setQr] = useState<any>(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [pinForm, setPinForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'STUDENT' && user.role !== 'PARENT') {
      router.replace('/dashboard');
      return;
    }
    setRole(user.role);

    (async () => {
      try {
        const list = await api<any[]>('/students/mine/children');
        if (!list.length) {
          setError('لا توجد بيانات طالب مرتبطة بالحساب');
          return;
        }
        setStudents(list);
        const preferred =
          list.find((s) => s.id === user.studentId)?.id || list[0].id;
        setSelectedId(preferred);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'فشل التحميل');
      }
    })();
  }, [router]);

  const student = useMemo(
    () => students.find((s) => s.id === selectedId) || students[0] || null,
    [students, selectedId],
  );
  const pAtt = usePaged(student?.attendance || [], student?.id || 'att');
  const pGrades = usePaged(student?.grades || [], student?.id || 'gr');
  const pInv = usePaged(student?.invoices || [], student?.id || 'inv');

  const family = useMemo(() => {
    if (role !== 'PARENT') return null;
    return students.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      grade: s.gradeLevel?.nameAr || '—',
      ...childStats(s),
    }));
  }, [role, students]);

  const familyTotals = useMemo(() => {
    if (!family?.length) return null;
    return family.reduce(
      (acc, c) => ({
        present: acc.present + c.present,
        absent: acc.absent + c.absent,
        sessionPresent: acc.sessionPresent + c.sessionPresent,
        overdue: acc.overdue + c.overdue,
        doorPaid: acc.doorPaid + c.doorPaid,
        blocks: acc.blocks + c.blocks,
      }),
      {
        present: 0,
        absent: 0,
        sessionPresent: 0,
        overdue: 0,
        doorPaid: 0,
        blocks: 0,
      },
    );
  }, [family]);

  useEffect(() => {
    if (!student?.id) {
      setQr(null);
      return;
    }

    const path =
      role === 'STUDENT' ? '/qr/mine' : `/qr/students/${student.id}`;

    api<any>(path)
      .then(setQr)
      .catch(() => setQr(null));
  }, [student?.id, role]);

  async function saveNewPin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (pinForm.next.length < 6) {
      setPinMsg({ ok: false, text: 'الرقم السري الجديد لازم 6 على الأقل' });
      return;
    }
    if (pinForm.next !== pinForm.confirm) {
      setPinMsg({ ok: false, text: 'تأكيد الرقم السري غير متطابق' });
      return;
    }
    setPinBusy(true);
    try {
      const res = await changePortalPin(pinForm.current, pinForm.next);
      setPinForm({ current: '', next: '', confirm: '' });
      setPinMsg({ ok: true, text: res.message || 'تم تغيير الرقم السري' });
    } catch (err) {
      setPinMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'فشل التغيير',
      });
    } finally {
      setPinBusy(false);
    }
  }

  const attendanceStats = useMemo(() => childStats(student), [student]);

  const isParent = role === 'PARENT';

  return (
    <AppShell>
      <PageHeader
        title={
          isParent
            ? 'بوابة ولي الأمر'
            : student
              ? `مرحباً ${student.firstName}`
              : 'بوابة الطالب'
        }
        subtitle={
          isParent
            ? 'متابعة الأبناء والحضور والمدفوعات'
            : 'امسح الـ QR عند الدخول'
        }
      />

      {error ? <AlertBanner>{error}</AlertBanner> : null}

      {!student && !error ? (
        <p className="text-navy/50">جاري التحميل...</p>
      ) : null}

      {/* Desktop summary only — mobile stays focused on QR */}
      <div className="hidden md:block">
        {isParent && familyTotals ? (
          <PageHero
            eyebrow="PARENT PORTAL"
            title="ملخص الأسرة"
            subtitle={`${students.length} أبناء مرتبطين بحسابك`}
            metrics={[
              {
                label: 'حضور مجمّع',
                value: familyTotals.present,
                highlight: true,
              },
              {
                label: 'حصص جلسات',
                value: familyTotals.sessionPresent,
              },
              { label: 'غياب مجمّع', value: familyTotals.absent },
              {
                label: 'متأخرات',
                value: Math.round(familyTotals.overdue).toLocaleString('en-EG'),
              },
              {
                label: 'مدفوع عند الباب',
                value: Math.round(familyTotals.doorPaid).toLocaleString('en-EG'),
              },
            ]}
          />
        ) : student && !isParent ? (
          <PageHero
            eyebrow="STUDENT PORTAL"
            title={`${student.firstName} ${student.lastName}`}
            subtitle="بياناتك · حضورك · كارت QR · الدرجات والمدفوعات"
            metrics={[
              {
                label: 'حضور مجموعات',
                value: attendanceStats.present,
              },
              {
                label: 'حصص جلسات',
                value: attendanceStats.sessionPresent,
                highlight: true,
              },
              { label: 'غياب', value: attendanceStats.absent },
              {
                label: 'مجموعات',
                value: attendanceStats.groups,
              },
            ]}
          />
        ) : null}
      </div>

      {isParent && family?.length ? (
        <SectionCard className="mb-4" title="الأبناء">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {family.map((c) => {
              const active = c.id === student?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`rounded-2xl border px-4 py-3 text-right transition ${
                    active
                      ? 'border-gold bg-gold/10 shadow-sm'
                      : 'border-mist bg-white hover:border-navy/20'
                  }`}
                >
                  <p className="font-extrabold text-navy">{c.name}</p>
                  <p className="text-xs text-navy/45 mt-1">{c.grade}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
                      حضور {c.present}
                    </span>
                    <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">
                      جلسات {c.sessionPresent}
                    </span>
                    <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700">
                      غياب {c.absent}
                    </span>
                  </div>
                  {c.blocks > 0 ? (
                    <p className="mt-2 text-[11px] font-bold text-red-700">
                      عليه حظر نشط
                    </p>
                  ) : null}
                  {c.overdue > 0 ? (
                    <p className="mt-1 text-[11px] text-amber-800">
                      متأخرات:{' '}
                      {Math.round(c.overdue).toLocaleString('en-EG')} EGP
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </SectionCard>
      ) : students.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                s.id === student?.id
                  ? 'bg-navy text-white'
                  : 'bg-white text-navy border border-mist'
              }`}
            >
              {s.firstName} {s.lastName}
            </button>
          ))}
        </div>
      ) : null}

      {student ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {(student.blocks || []).length ? (
            <div className="lg:col-span-2">
              <AlertBanner>
                حظر نشط:{' '}
                {student.blocks
                  .map((b: any) =>
                    b.scope === 'CENTER'
                      ? `السنتر كله — ${b.reason}`
                      : `مدرس ${b.teacher?.firstName || ''} ${b.teacher?.lastName || ''} — ${b.reason}`,
                  )
                  .join(' · ')}
              </AlertBanner>
            </div>
          ) : null}

          {/* QR first — full width, large on phone */}
          <SectionCard className="lg:col-span-2 !p-0 overflow-hidden">
            <div className="bg-navy px-4 py-3 text-center sm:text-right sm:flex sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-gold text-[11px] font-bold tracking-[0.18em]">
                  كارت الدخول
                </p>
                <p className="text-white font-extrabold text-base sm:text-lg mt-0.5">
                  {student.firstName} {student.lastName}
                </p>
              </div>
              <p className="text-white/55 text-xs mt-1 sm:mt-0">
                ارفع السطوع وامسح عند البوابة
              </p>
            </div>
            <div className="flex flex-col items-center px-4 py-5 sm:py-6 bg-white">
              {qr?.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr.qrDataUrl}
                  alt="Student QR"
                  className="w-[min(100%,280px)] sm:w-[240px] md:w-[260px] aspect-square rounded-2xl bg-white p-3 border border-mist shadow-soft [image-rendering:pixelated]"
                />
              ) : (
                <div className="w-[min(100%,280px)] aspect-square rounded-2xl bg-sand border border-dashed border-mist grid place-items-center text-sm text-navy/40">
                  جاري تحميل QR...
                </div>
              )}
              <p className="mt-3 text-sm font-semibold text-navy">
                {student.gradeLevel?.nameAr || `طالب ${CENTER_NAME}`}
              </p>
              <p className="mt-1 font-mono text-[11px] text-navy/40 tabular-nums">
                {qr?.studentUid || student.studentUid}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 w-full max-w-sm text-center text-[11px] sm:text-xs">
                <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-800">
                  <p className="opacity-70">حصص حضرتها</p>
                  <p className="font-extrabold text-sm tabular-nums">
                    {attendanceStats.sessionPresent}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50 px-2 py-2 text-sky-800">
                  <p className="opacity-70">حضور مجموعات</p>
                  <p className="font-extrabold text-sm tabular-nums">
                    {attendanceStats.present}
                  </p>
                </div>
                <div className="rounded-xl bg-sand px-2 py-2 text-navy">
                  <p className="opacity-70">مجموعات</p>
                  <p className="font-extrabold text-sm tabular-nums">
                    {attendanceStats.groups}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            className="lg:col-span-2"
            title="حضور الحصص"
            badge={
              <span className="badge-ok">
                حضرت {attendanceStats.sessionPresent} حصة
              </span>
            }
          >
            {(() => {
              const attended = (student.sessionEntries || []).filter(
                isSessionAttended,
              );
              const latest = attended[0];
              return (
                <>
                  {latest ? (
                    <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-[11px] font-bold text-emerald-800/70">
                        آخر حصة
                      </p>
                      <p className="mt-0.5 text-lg font-extrabold text-emerald-950">
                        حضرت · {sessionTeacherName(latest)} · {sessionClassName(latest)}
                      </p>
                      <p className="mt-1 text-xs text-emerald-800/70">
                        {formatDate(latest.session?.sessionDate)}
                        {latest.checkedInAt
                          ? ` · ${formatDateTime(latest.checkedInAt)}`
                          : ''}
                      </p>
                    </div>
                  ) : null}

                  {attendanceStats.sessionByTeacher.length ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-3">
                      {attendanceStats.sessionByTeacher.map((t) => (
                        <div
                          key={t.name}
                          className="rounded-2xl border border-mist bg-sand/70 px-4 py-3"
                        >
                          <p className="font-extrabold text-navy">{t.name}</p>
                          <p className="mt-1 text-sm text-navy/70">
                            حضرت{' '}
                            <strong className="tabular-nums">{t.present}</strong>{' '}
                            حصة
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>لسه مفيش حصص مسجّلة — بعد الدفع هتظهر هنا</EmptyState>
                  )}

                  <ul className="space-y-2">
                    {(student.sessionEntries || []).slice(0, 12).map((e: any) => {
                      const attendedRow = isSessionAttended(e);
                      return (
                        <li
                          key={e.id}
                          className={`rounded-xl border px-3 py-2.5 text-sm ${
                            attendedRow
                              ? 'border-emerald-200 bg-emerald-50/70'
                              : 'border-mist bg-sand/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-navy">
                                {sessionTeacherName(e)} · {sessionClassName(e)}
                              </p>
                              <p className="text-[11px] text-navy/45 mt-0.5">
                                {formatDate(e.session?.sessionDate)}
                              </p>
                            </div>
                            <span
                              className={
                                attendedRow
                                  ? 'badge-ok shrink-0'
                                  : 'badge-warn shrink-0'
                              }
                            >
                              {attendedRow ? 'حضرت' : 'لم تدخل'}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              );
            })()}
          </SectionCard>

          <SectionCard title="بياناتك">
            <div className="grid gap-2 sm:grid-cols-2 text-sm text-navy/80">
              <p>
                <span className="text-navy/45">الاسم:</span>{' '}
                {student.firstName} {student.lastName}
              </p>
              <p>
                <span className="text-navy/45">الصف:</span>{' '}
                {student.gradeLevel?.nameAr || '—'}
              </p>
              <p>
                <span className="text-navy/45">الهاتف:</span>{' '}
                {student.phone || '—'}
              </p>
              <p>
                <span className="text-navy/45">الحالة:</span>{' '}
                {student.isActive ? 'نشط' : 'غير نشط'}
              </p>
              {student.email ? (
                <p className="sm:col-span-2 break-all">
                  <span className="text-navy/45">البريد:</span> {student.email}
                </p>
              ) : null}
              {student.notes ? (
                <p className="sm:col-span-2">
                  <span className="text-navy/45">ملاحظات:</span> {student.notes}
                </p>
              ) : null}
            </div>

            {(student.parents || []).length ? (
              <div className="mt-4 pt-3 border-t border-mist">
                <p className="text-xs font-bold text-navy/45 mb-2">
                  أولياء الأمور
                </p>
                <ul className="space-y-1 text-sm">
                  {student.parents.map((p: any) => (
                    <li key={`${p.parentId}-${p.relation}`}>
                      {p.parent?.firstName} {p.parent?.lastName}
                      {p.parent?.phone ? ` · ${p.parent.phone}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="الرقم السري"
            subtitle="غيّر الرقم السري وأنت داخل البوابة"
          >
            <form onSubmit={saveNewPin} className="space-y-3 max-w-md">
              <label className="block text-sm font-medium text-navy/80">
                الرقم السري الحالي
                <input
                  className="field"
                  type="password"
                  value={pinForm.current}
                  onChange={(e) =>
                    setPinForm((f) => ({ ...f, current: e.target.value }))
                  }
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className="block text-sm font-medium text-navy/80">
                الرقم السري الجديد
                <input
                  className="field"
                  type="password"
                  minLength={6}
                  value={pinForm.next}
                  onChange={(e) =>
                    setPinForm((f) => ({ ...f, next: e.target.value }))
                  }
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm font-medium text-navy/80">
                تأكيد الرقم السري الجديد
                <input
                  className="field"
                  type="password"
                  minLength={6}
                  value={pinForm.confirm}
                  onChange={(e) =>
                    setPinForm((f) => ({ ...f, confirm: e.target.value }))
                  }
                  required
                  autoComplete="new-password"
                />
              </label>
              {pinMsg ? (
                <p
                  className={`rounded-lg px-3 py-2 text-sm ${
                    pinMsg.ok
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {pinMsg.text}
                </p>
              ) : (
                <p className="text-[11px] text-navy/45">
                  لو نسيت الرقم الحالي: من صفحة الدخول اختر «نسيت الرقم السري؟»
                  واكتب كود الكارت.
                </p>
              )}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={pinBusy}
              >
                {pinBusy ? 'جاري الحفظ...' : 'حفظ الرقم السري الجديد'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="المجموعات والجدول">
            <ul className="space-y-3 text-sm">
              {(student.enrollments || []).map((e: any) => (
                <li key={e.id} className="rounded-xl bg-sand px-3 py-3">
                  <p className="font-semibold text-navy">
                    {e.group?.subject?.nameAr ||
                      e.group?.subject?.nameEn ||
                      'مادة'}{' '}
                    — {e.group?.name}
                  </p>
                  <p className="text-navy/55 mt-1">
                    المدرس: {e.group?.teacher?.firstName}{' '}
                    {e.group?.teacher?.lastName}
                  </p>
                  <p className="text-navy/55">
                    القاعة: {e.group?.classroom?.name || '—'}
                  </p>
                  {(e.group?.scheduleSlots || []).length ? (
                    <ul className="mt-2 space-y-1 text-xs text-navy/60">
                      {e.group.scheduleSlots.map((s: any) => (
                        <li key={s.id}>
                          {DAY_AR[s.dayOfWeek] || s.dayOfWeek} · {s.startTime} –{' '}
                          {s.endTime}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-navy/40">لا يوجد جدول بعد</p>
                  )}
                </li>
              ))}
              {!student.enrollments?.length ? (
                <li className="text-navy/45">لا توجد مجموعات</li>
              ) : null}
            </ul>
          </SectionCard>

          <SectionCard title="المدفوعات والفواتير">
            <ul className="space-y-2 text-sm">
              {pInv.slice.map((inv: any) => {
                const due =
                  Number(inv.feeAmount) -
                  Number(inv.discount) +
                  Number(inv.extras) -
                  Number(inv.paidAmount);
                return (
                  <li
                    key={inv.id}
                    className="rounded-xl bg-sand px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {inv.group?.name || 'فاتورة'} · {inv.status}
                      </span>
                      <span className="font-bold text-navy">
                        {due.toLocaleString('en-EG')} EGP
                      </span>
                    </div>
                    <p className="text-xs text-navy/45">
                      المدفوع: {Number(inv.paidAmount).toLocaleString('en-EG')} ·
                      الإجمالي:{' '}
                      {(
                        Number(inv.feeAmount) -
                        Number(inv.discount) +
                        Number(inv.extras)
                      ).toLocaleString('en-EG')}
                    </p>
                  </li>
                );
              })}
              {!student.invoices?.length ? (
                <li className="text-navy/45">لا توجد فواتير</li>
              ) : null}
            </ul>
            <TablePager
              page={pInv.page}
              pages={pInv.pages}
              total={pInv.total}
              size={pInv.size}
              from={pInv.from}
              to={pInv.to}
              onPage={pInv.setPage}
            />
          </SectionCard>

          <SectionCard
            className="lg:col-span-2"
            title="سجل الحضور"
            badge={
              <span className="text-xs text-navy/45">
                آخر {Math.min(student.attendance?.length || 0, 100)} سجل
              </span>
            }
          >
            <div className="space-y-2 md:hidden">
              {pAtt.slice.map((a: any) => (
                <article
                  key={a.id}
                  className="rounded-xl border border-mist bg-white px-3 py-2.5 text-sm flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy truncate">
                      {a.session?.group?.name || 'حصة'}
                    </p>
                    <p className="text-[11px] text-navy/45 mt-0.5">
                      {formatDate(a.session?.sessionDate)} ·{' '}
                      {SOURCE_AR[a.source] || a.source}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                      a.status === 'PRESENT' || a.status === 'LATE'
                        ? 'bg-emerald-50 text-emerald-800'
                        : a.status === 'ABSENT'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-sand text-navy'
                    }`}
                  >
                    {STATUS_AR[a.status] || a.status}
                  </span>
                </article>
              ))}
              {!student.attendance?.length ? (
                <p className="text-sm text-navy/45 py-2">لا يوجد سجل حضور بعد</p>
              ) : null}
            </div>
            <div className="table-scroll hidden md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المجموعة</th>
                    <th>الحالة</th>
                    <th>المصدر</th>
                    <th>وقت التسجيل</th>
                  </tr>
                </thead>
                <tbody>
                  {pAtt.slice.map((a: any) => (
                    <tr key={a.id}>
                      <td>{formatDate(a.session?.sessionDate)}</td>
                      <td>
                        {a.session?.group?.name || 'حصة'}
                        {a.session?.group?.subject?.nameEn
                          ? ` · ${a.session.group.subject.nameEn}`
                          : ''}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            a.status === 'PRESENT' || a.status === 'LATE'
                              ? 'bg-emerald-50 text-emerald-800'
                              : a.status === 'ABSENT'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-sand text-navy'
                          }`}
                        >
                          {STATUS_AR[a.status] || a.status}
                        </span>
                      </td>
                      <td>{SOURCE_AR[a.source] || a.source}</td>
                      <td className="text-xs text-navy/55">
                        {formatDateTime(a.markedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!student.attendance?.length ? (
                <p className="text-sm text-navy/45 py-4">لا يوجد سجل حضور بعد</p>
              ) : null}
            </div>
            <TablePager
              page={pAtt.page}
              pages={pAtt.pages}
              total={pAtt.total}
              size={pAtt.size}
              from={pAtt.from}
              to={pAtt.to}
              onPage={pAtt.setPage}
            />
          </SectionCard>

          <SectionCard className="lg:col-span-2" title="الدرجات">
            <div className="space-y-2 md:hidden">
              {pGrades.slice.map((g: any) => (
                <article
                  key={g.id}
                  className="rounded-xl border border-mist px-3 py-2.5 text-sm flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy truncate">
                      {g.exam?.title}
                    </p>
                    <p className="text-[11px] text-navy/45 mt-0.5">
                      {g.exam?.subject?.nameEn || '—'} ·{' '}
                      {formatDate(g.exam?.examDate)}
                    </p>
                  </div>
                  <p className="font-extrabold text-navy tabular-nums text-base">
                    {Number(g.score)}
                  </p>
                </article>
              ))}
              {!student.grades?.length ? (
                <p className="text-sm text-navy/45 py-2">لا توجد درجات بعد</p>
              ) : null}
            </div>
            <div className="table-scroll hidden md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الامتحان</th>
                    <th>المادة</th>
                    <th>التاريخ</th>
                    <th>الدرجة</th>
                  </tr>
                </thead>
                <tbody>
                  {pGrades.slice.map((g: any) => (
                    <tr key={g.id}>
                      <td>{g.exam?.title}</td>
                      <td>{g.exam?.subject?.nameEn || '—'}</td>
                      <td>{formatDate(g.exam?.examDate)}</td>
                      <td className="font-bold">{Number(g.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!student.grades?.length ? (
                <p className="text-sm text-navy/45 py-4">لا توجد درجات بعد</p>
              ) : null}
            </div>
            <TablePager
              page={pGrades.page}
              pages={pGrades.pages}
              total={pGrades.total}
              size={pGrades.size}
              from={pGrades.from}
              to={pGrades.to}
              onPage={pGrades.setPage}
            />
          </SectionCard>
        </div>
      ) : null}
    </AppShell>
  );
}
