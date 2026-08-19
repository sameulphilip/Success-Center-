'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api, getStoredUser } from '@/lib/api';
import { SessionGateScanner } from '@/components/SessionGateScanner';
import { TablePager, usePaged } from '@/components/TablePager';

const STATUS_AR: Record<string, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'بعذر',
};

export default function AttendancePage() {
  const me = getStoredUser();
  const isTeacher = me?.role === 'TEACHER';
  const [groups, setGroups] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [absentees, setAbsentees] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [session, setSession] = useState<any>(null);
  const [qrPayload, setQrPayload] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'success' | 'error'>('info');
  const pAbs = usePaged(absentees, absentees.length);
  const pEnroll = usePaged(
    session?.group?.enrollments || [],
    session?.id || '',
  );

  async function load() {
    const [g, s, a] = await Promise.all([
      api<any[]>('/groups'),
      api<any[]>('/attendance/sessions'),
      api<any[]>('/attendance/absentees/today'),
    ]);
    setGroups(g);
    setSessions(s);
    setAbsentees(a);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function createSession(e: FormEvent) {
    e.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    const created = await api<any>('/attendance/sessions', {
      method: 'POST',
      body: JSON.stringify({ groupId: selectedGroup, sessionDate: today }),
    });
    const full = await api(`/attendance/sessions/${created.id}`);
    setSession(full);
    await load();
    setTone('success');
    setMessage('تم فتح جلسة اليوم');
  }

  async function mark(studentId: string, status: string) {
    if (!session) return;
    await api('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        records: [{ studentId, status, source: 'MANUAL' }],
      }),
    });
    const full = await api(`/attendance/sessions/${session.id}`);
    setSession(full);
    await load();
    setTone(status === 'ABSENT' ? 'info' : 'success');
    setMessage(
      status === 'ABSENT'
        ? 'تم تسجيل الغياب وإرسال إشعار لولي الأمر'
        : 'تم حفظ الحضور',
    );
  }

  async function markTeacherPresent() {
    if (!session) return;
    await api('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        records: [
          {
            teacherId: session.group.teacher.id,
            status: 'PRESENT',
            source: 'MANUAL',
          },
        ],
      }),
    });
    setTone('success');
    setMessage('تم تسجيل حضور المدرس');
  }

  async function scanQr(e: FormEvent) {
    e.preventDefault();
    if (!selectedGroup) {
      setTone('error');
      setMessage('اختر المجموعة أولاً');
      return;
    }
    const res = await api<any>('/attendance/qr', {
      method: 'POST',
      body: JSON.stringify({
        payload: qrPayload,
        groupId: selectedGroup,
        source: 'QR_STUDENT',
      }),
    });
    setTone('success');
    setMessage(
      `تم حضور ${res.student?.name || ''} عبر QR — إشعار لأولياء الأمور: ${res.parentsNotified ?? 0}`,
    );
    setQrPayload('');
    if (session) {
      const full = await api(`/attendance/sessions/${session.id}`);
      setSession(full);
    }
    await load();
  }

  async function notifyAbsentees() {
    const res = await api<any>('/attendance/notify-absentees', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setTone('info');
    setMessage(
      `تم إرسال/إعادة إرسال إشعارات لـ ${res.notificationsQueued} ولي أمر (${res.absentees} غائب)`,
    );
  }

  const presentCount =
    session?.records?.filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE')
      .length || 0;

  return (
    <AppShell>
      <PageHeader
        title="الحضور"
        subtitle={
          isTeacher
            ? 'امسح كارت الطالب — لو دفع حصتك يظهر الاسم ويدخل'
            : 'تسجيل يدوي أو QR مع إشعار فوري لولي الأمر'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/check-in" className="btn-ghost">
              مسح الQR
            </Link>
            <button type="button" className="btn-accent" onClick={() => void notifyAbsentees()}>
              إرسال إشعارات الغياب
            </button>
          </div>
        }
      />
      <PageHero
        eyebrow="ATTENDANCE"
        title="تشغيل الحضور"
        subtitle="افتح جلسة، سجّل يدوياً أو بالمسح، وتابع الغياب مباشرة"
        metrics={[
          { label: 'غائبون اليوم', value: absentees.length, highlight: true },
          { label: 'جلسات', value: sessions.length },
          { label: 'حاضر بالجلسة', value: presentCount },
          { label: 'مجموعات', value: groups.length },
        ]}
      />
      {message ? <AlertBanner tone={tone}>{message}</AlertBanner> : null}

      <div className="mb-4">
        <SessionGateScanner teacherOnly={isTeacher} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SectionCard title="فتح جلسة حضور" subtitle="جلسة اليوم للمجموعة المختارة">
            <form onSubmit={createSession} className="space-y-3">
              <FieldLabel label="المجموعة">
                <select
                  className="field"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  required
                >
                  <option value="">اختر المجموعة</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.subject.nameEn} {g.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <button className="btn-primary w-full">فتح جلسة اليوم</button>
            </form>
          </SectionCard>

          <SectionCard
            title="مسح كارت الطالب"
            subtitle="QR أو NFC — JSON أو SUCCESS:uid"
            badge={<span className="badge-gold">سريع</span>}
          >
            <form onSubmit={scanQr} className="space-y-3">
              <textarea
                className="field"
                placeholder='SUCCESS:xxxx أو {"type":"student","uid":"..."}'
                value={qrPayload}
                onChange={(e) => setQrPayload(e.target.value)}
                required
              />
              <button className="btn-accent w-full">تسجيل حضور من الكارت</button>
            </form>
          </SectionCard>

          <SectionCard
            title="غائبون اليوم"
            badge={<span className="badge-warn">{absentees.length}</span>}
          >
            <ul className="space-y-2 text-sm">
              {pAbs.slice.map((a) => (
                <li key={a.id} className="rounded-xl bg-sand px-3 py-2">
                  <p className="font-semibold text-navy">
                    {a.student.firstName} {a.student.lastName}
                  </p>
                  <p className="text-xs text-navy/50">
                    {a.session.group.subject.nameEn}
                    {a.student.parents?.length
                      ? ` · ${a.student.parents.length} ولي أمر`
                      : ''}
                  </p>
                </li>
              ))}
              {!absentees.length ? (
                <EmptyState>لا يوجد غائبون مسجلون</EmptyState>
              ) : null}
            </ul>
            <TablePager
              page={pAbs.page}
              pages={pAbs.pages}
              total={pAbs.total}
              size={pAbs.size}
              from={pAbs.from}
              to={pAbs.to}
              onPage={pAbs.setPage}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="كشف الحضور"
          subtitle={
            session
              ? `${session.group?.subject?.nameEn} — ${session.group?.name}`
              : 'افتح جلسة لعرض الطلاب'
          }
          action={
            session ? (
              <button
                type="button"
                onClick={() => void markTeacherPresent()}
                className="btn-ghost !py-1.5 !px-3 text-xs"
              >
                حضور المدرس
              </button>
            ) : null
          }
        >
          {!session ? (
            <EmptyState>افتح جلسة لعرض الطلاب</EmptyState>
          ) : (
            <>
            <div className="space-y-2">
              {pEnroll.slice.map((e: any) => {
                const record = session.records.find(
                  (r: any) => r.studentId === e.studentId,
                );
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-navy">
                        {e.student.firstName} {e.student.lastName}
                      </p>
                      {record ? (
                        <span
                          className={`mt-1 inline-flex ${
                            record.status === 'ABSENT'
                              ? 'badge-danger'
                              : record.status === 'PRESENT' ||
                                  record.status === 'LATE'
                                ? 'badge-ok'
                                : 'badge-navy'
                          }`}
                        >
                          {STATUS_AR[record.status] || record.status}
                        </span>
                      ) : (
                        <span className="text-xs text-navy/40">لم يُسجّل</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void mark(e.studentId, 'PRESENT')}
                        className="btn-ghost !py-1 !px-2 text-xs"
                      >
                        حاضر
                      </button>
                      <button
                        type="button"
                        onClick={() => void mark(e.studentId, 'ABSENT')}
                        className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"
                      >
                        غائب
                      </button>
                      <button
                        type="button"
                        onClick={() => void mark(e.studentId, 'LATE')}
                        className="btn-ghost !py-1 !px-2 text-xs"
                      >
                        متأخر
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <TablePager
              page={pEnroll.page}
              pages={pEnroll.pages}
              total={pEnroll.total}
              size={pEnroll.size}
              from={pEnroll.from}
              to={pEnroll.to}
              onPage={pEnroll.setPage}
            />
            </>
          )}

          <h4 className="section-title mt-6 mb-2">آخر الجلسات</h4>
          <ul className="text-sm space-y-2 text-navy/70">
            {sessions.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-mist px-3 py-2 flex justify-between gap-2"
              >
                <span>
                  {s.group.subject.nameEn} {s.group.name}
                </span>
                <span className="text-xs text-navy/40">
                  {String(s.sessionDate).slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}
