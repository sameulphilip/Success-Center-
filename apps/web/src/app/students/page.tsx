'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  studentUid: string;
  gradeLevel?: { nameAr: string; nameEn: string };
  enrollments: { group: { name: string; subject: { nameEn: string } } }[];
};

type GradeLevel = { id: string; nameAr: string; nameEn: string };

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    gradeLevelId: '',
  });
  const [error, setError] = useState('');

  async function load() {
    const [s, g] = await Promise.all([
      api<Student[]>(`/students${q ? `?q=${encodeURIComponent(q)}` : ''}`),
      api<GradeLevel[]>('/catalog/grade-levels'),
    ]);
    setStudents(s);
    setGrades(g);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/students', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          gradeLevelId: form.gradeLevelId || undefined,
        }),
      });
      setForm({ firstName: '', lastName: '', phone: '', gradeLevelId: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  const withGroups = students.filter((s) => s.enrollments?.length).length;

  return (
    <AppShell>
      <PageHeader
        title="الطلاب"
        subtitle="سجل الطلاب · البحث · الكروت · المجموعات"
      />
      <PageHero
        eyebrow="STUDENTS"
        title="إدارة الطلاب"
        subtitle="كل طالب له ملف وكارت QR/NFC ومجموعات ومدفوعات"
        metrics={[
          { label: 'الإجمالي', value: students.length, highlight: true },
          { label: 'مسجّلون', value: withGroups },
          { label: 'بدون مجموعة', value: students.length - withGroups },
          { label: 'الصفوف', value: grades.length },
        ]}
      />
      {error ? <AlertBanner>{error}</AlertBanner> : null}

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <SectionCard
          title="سجل الطلاب"
          subtitle="اضغط على الاسم لفتح الملف والـ QR"
          badge={<span className="badge-navy">{students.length}</span>}
        >
          <div className="mb-4 flex flex-col sm:flex-row gap-2">
            <input
              className="field !mt-0 flex-1 min-w-0"
              placeholder="بحث بالاسم أو الهاتف..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load();
              }}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="btn-primary shrink-0"
            >
              بحث
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الصف</th>
                  <th>المجموعات</th>
                  <th>الهاتف</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/students/${s.id}`}
                        className="font-semibold text-navy hover:text-navy-soft"
                      >
                        {s.firstName} {s.lastName}
                      </Link>
                      <p className="text-xs text-navy/35 mt-0.5 font-mono">
                        {s.studentUid}
                      </p>
                    </td>
                    <td>
                      <span className="badge-navy">
                        {s.gradeLevel?.nameAr || '—'}
                      </span>
                    </td>
                    <td className="text-navy/70">
                      {s.enrollments
                        .map((e) => `${e.group.subject.nameEn} ${e.group.name}`)
                        .join('، ') || '—'}
                    </td>
                    <td>{s.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!students.length ? <EmptyState>لا يوجد طلاب</EmptyState> : null}
          </div>
        </SectionCard>

        <SectionCard title="إضافة طالب" subtitle="ينشئ UID وكارت حضور تلقائياً">
          <form onSubmit={onCreate} className="space-y-3">
            <FieldLabel label="الاسم الأول">
              <input
                className="field"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </FieldLabel>
            <FieldLabel label="اسم العائلة">
              <input
                className="field"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </FieldLabel>
            <FieldLabel label="الهاتف">
              <input
                className="field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="الصف">
              <select
                className="field"
                value={form.gradeLevelId}
                onChange={(e) =>
                  setForm({ ...form, gradeLevelId: e.target.value })
                }
              >
                <option value="">اختر الصف</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nameAr}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <button className="btn-accent w-full">حفظ الطالب</button>
          </form>
        </SectionCard>
      </div>
    </AppShell>
  );
}
