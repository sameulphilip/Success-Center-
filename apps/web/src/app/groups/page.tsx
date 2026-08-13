'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

const DAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [enroll, setEnroll] = useState({ groupId: '', studentId: '' });
  const [form, setForm] = useState({
    name: 'Group A',
    subjectId: '',
    gradeLevelId: '',
    teacherId: '',
    classroomId: '',
    feeAmount: 800,
    capacity: 25,
    dayOfWeek: 0,
    startTime: '16:00',
    endTime: '18:00',
  });

  async function load() {
    const [g, s, gl, t, c, st] = await Promise.all([
      api<any[]>('/groups'),
      api<any[]>('/catalog/subjects'),
      api<any[]>('/catalog/grade-levels'),
      api<any[]>('/teachers'),
      api<any[]>('/catalog/classrooms'),
      api<any[]>('/students'),
    ]);
    setGroups(g);
    setSubjects(s);
    setGrades(gl);
    setTeachers(t);
    setClassrooms(c);
    setStudents(st);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api('/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        subjectId: form.subjectId,
        gradeLevelId: form.gradeLevelId,
        teacherId: form.teacherId,
        classroomId: form.classroomId || undefined,
        feeAmount: form.feeAmount,
        capacity: form.capacity,
        scheduleSlots: [
          {
            dayOfWeek: Number(form.dayOfWeek),
            startTime: form.startTime,
            endTime: form.endTime,
          },
        ],
      }),
    });
    await load();
  }

  async function onEnroll(e: FormEvent) {
    e.preventDefault();
    await api(`/groups/${enroll.groupId}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ studentId: enroll.studentId }),
    });
    await load();
  }

  const enrolledTotal = groups.reduce(
    (s, g) => s + (g._count?.enrollments ?? 0),
    0,
  );

  return (
    <AppShell>
      <PageHeader
        title="المجموعات"
        subtitle="مادة → صف → مجموعة + جدول ومدرس وقاعة"
      />
      <PageHero
        eyebrow="GROUPS"
        title="تشغيل المجموعات"
        subtitle="أنشئ المجموعات، حدّد الجدول، وسجّل الطلاب"
        metrics={[
          { label: 'المجموعات', value: groups.length, highlight: true },
          { label: 'التسجيلات', value: enrolledTotal },
          { label: 'المدرسون', value: teachers.length },
          { label: 'القاعات', value: classrooms.length },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="المجموعات الحالية"
          badge={<span className="badge-navy">{groups.length}</span>}
        >
          <div className="space-y-3 max-h-[720px] overflow-y-auto">
            {groups.map((g) => {
              const filled = g._count?.enrollments ?? 0;
              const pct = Math.min(100, Math.round((filled / (g.capacity || 1)) * 100));
              return (
                <div
                  key={g.id}
                  className="rounded-xl border border-mist bg-sand/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-navy">
                        {g.subject?.nameEn || g.subject?.nameAr} — {g.name}
                      </p>
                      <p className="text-xs text-navy/50 mt-1">
                        {g.gradeLevel?.nameAr || g.gradeLevel?.nameEn}
                      </p>
                    </div>
                    <span className="badge-gold">
                      {Number(g.feeAmount).toLocaleString('en-EG')} EGP
                    </span>
                  </div>
                  <p className="text-sm text-navy/65 mt-2">
                    المدرس: {g.teacher?.firstName} {g.teacher?.lastName} · القاعة:{' '}
                    {g.classroom?.name || '—'}
                  </p>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-navy/50 mb-1">
                      <span>الإشغال</span>
                      <span>
                        {filled}/{g.capacity} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white overflow-hidden">
                      <div
                        className="h-full bg-navy rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(g.scheduleSlots || []).map((s: any) => (
                      <span key={s.id} className="soft-chip">
                        {DAY_AR[s.dayOfWeek] || s.dayOfWeek} · {s.startTime}-
                        {s.endTime}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {!groups.length ? <EmptyState>لا توجد مجموعات بعد</EmptyState> : null}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="إنشاء مجموعة" subtitle="مع موعد أول في الجدول">
            <form onSubmit={onCreate} className="space-y-3">
              <FieldLabel label="اسم المجموعة">
                <input
                  className="field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FieldLabel>
              <FieldLabel label="المادة">
                <select
                  className="field"
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  required
                >
                  <option value="">اختر المادة</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameEn}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="الصف">
                <select
                  className="field"
                  value={form.gradeLevelId}
                  onChange={(e) =>
                    setForm({ ...form, gradeLevelId: e.target.value })
                  }
                  required
                >
                  <option value="">اختر الصف</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nameEn}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="المدرس">
                <select
                  className="field"
                  value={form.teacherId}
                  onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                  required
                >
                  <option value="">اختر المدرس</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="القاعة">
                <select
                  className="field"
                  value={form.classroomId}
                  onChange={(e) =>
                    setForm({ ...form, classroomId: e.target.value })
                  }
                >
                  <option value="">اختر القاعة</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <FieldLabel label="اليوم">
                  <select
                    className="field"
                    value={form.dayOfWeek}
                    onChange={(e) =>
                      setForm({ ...form, dayOfWeek: Number(e.target.value) })
                    }
                  >
                    {DAY_AR.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel label="من">
                  <input
                    className="field"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="إلى">
                  <input
                    className="field"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  />
                </FieldLabel>
              </div>
              <button className="btn-accent w-full">حفظ المجموعة</button>
            </form>
          </SectionCard>

          <SectionCard title="تسجيل طالب" subtitle="إضافة طالب لمجموعة موجودة">
            <form onSubmit={onEnroll} className="space-y-3">
              <FieldLabel label="المجموعة">
                <select
                  className="field"
                  value={enroll.groupId}
                  onChange={(e) =>
                    setEnroll({ ...enroll, groupId: e.target.value })
                  }
                  required
                >
                  <option value="">اختر المجموعة</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.subject?.nameEn} {g.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="الطالب">
                <select
                  className="field"
                  value={enroll.studentId}
                  onChange={(e) =>
                    setEnroll({ ...enroll, studentId: e.target.value })
                  }
                  required
                >
                  <option value="">اختر الطالب</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <button className="btn-primary w-full">تسجيل</button>
            </form>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
