'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';
import { AppDialog } from '@/components/AppDialog';
import { TablePager, usePaged } from '@/components/TablePager';

type TeacherForm = {
  firstName: string;
  lastName: string;
  phone: string;
  hourlyRate: number;
  subjectIds: string[];
  gradeLevelIds: string[];
};

const emptyForm = (): TeacherForm => ({
  firstName: '',
  lastName: '',
  phone: '',
  hourlyRate: 200,
  subjectIds: [],
  gradeLevelIds: [],
});

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [form, setForm] = useState<TeacherForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  async function load() {
    const [t, s, g] = await Promise.all([
      api<any[]>('/teachers'),
      api<any[]>('/catalog/subjects'),
      api<any[]>('/catalog/grade-levels'),
    ]);
    setTeachers(t);
    setSubjects(s);
    setGrades(g);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function startEdit(t: any) {
    setEditingId(t.id);
    setError('');
    setForm({
      firstName: t.firstName || '',
      lastName: t.lastName === '-' ? '' : t.lastName || '',
      phone: t.phone || '',
      hourlyRate: Number(t.hourlyRate || 0),
      subjectIds: (t.subjects || [])
        .map((s: any) => s.subjectId || s.subject?.id)
        .filter(Boolean),
      gradeLevelIds: (t.gradeLevels || [])
        .map((g: any) => g.gradeLevelId || g.gradeLevel?.id)
        .filter(Boolean),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      const payload = {
        ...form,
        lastName: form.lastName.trim() || '-',
        phone: form.phone.trim() || undefined,
      };
      if (editingId) {
        await api(`/teachers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/teachers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy('');
    }
  }

  async function onDelete(t: any) {
    const name = `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim();
    setPendingDelete({ id: t.id, name });
  }

  async function runDeleteTeacher() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setBusy(`del-${id}`);
    setError('');
    try {
      await api(`/teachers/${id}`, { method: 'DELETE' });
      if (editingId === id) cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل المسح');
    } finally {
      setBusy('');
    }
  }

  const totalGroups = useMemo(
    () => teachers.reduce((sum, t) => sum + (t.groups?.length ?? 0), 0),
    [teachers],
  );

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => {
      const name = `${t.firstName || ''} ${t.lastName === '-' ? '' : t.lastName || ''}`
        .toLowerCase()
        .trim();
      const phone = String(t.phone || '').toLowerCase();
      const subjectsText = (t.subjects || [])
        .map((s: any) => `${s.subject?.nameAr || ''} ${s.subject?.nameEn || ''}`)
        .join(' ')
        .toLowerCase();
      const gradesText = (t.gradeLevels || [])
        .map((g: any) => g.gradeLevel?.nameAr || '')
        .join(' ')
        .toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        subjectsText.includes(q) ||
        gradesText.includes(q)
      );
    });
  }, [teachers, search]);

  const paged = usePaged(filteredTeachers, search);

  return (
    <AppShell>
      <PageHeader
        title="المدرسون"
        subtitle="البيانات · الصفوف · المواد · سعر الحصة"
      />
      <PageHero
        eyebrow="TEACHERS"
        title="طاقم التدريس"
        subtitle="كل مدرس مربوط بالصف الدراسي والمواد"
        metrics={[
          { label: 'المدرسون', value: teachers.length, highlight: true },
          { label: 'المجموعات', value: totalGroups },
          { label: 'المواد', value: subjects.length },
          { label: 'الصفوف', value: grades.length },
        ]}
      />

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="قائمة المدرسين"
          badge={
            <span className="badge-navy">
              {search.trim()
                ? `${filteredTeachers.length} / ${teachers.length}`
                : teachers.length}
            </span>
          }
        >
          <div className="mb-3">
            <FieldLabel label="بحث">
              <input
                className="field"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم المدرس، المادة، الصف، أو الموبايل…"
              />
            </FieldLabel>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الصفوف</th>
                  <th>المواد</th>
                  <th>سعر الحصة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((t) => (
                  <tr
                    key={t.id}
                    className={editingId === t.id ? 'bg-gold/10' : undefined}
                  >
                    <td className="font-semibold text-navy">
                      {t.firstName} {t.lastName === '-' ? '' : t.lastName}
                      {t.phone ? (
                        <p className="text-xs text-navy/40 font-normal mt-0.5">
                          {t.phone}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {t.gradeLevels?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {t.gradeLevels.map((g: any) => (
                            <span
                              key={g.gradeLevelId || g.gradeLevel?.id}
                              className="badge-info"
                            >
                              {g.gradeLevel?.nameAr || '—'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-navy/35">—</span>
                      )}
                    </td>
                    <td>
                      {t.subjects?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {t.subjects.map((s: any) => (
                            <span
                              key={s.subjectId || s.subject?.id}
                              className="badge-gold"
                            >
                              {s.subject?.nameEn || s.subject?.nameAr}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="font-bold tabular-nums">
                      {Number(t.hourlyRate).toLocaleString('en-EG')}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-1"
                          onClick={() => startEdit(t)}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-1 text-red-700"
                          disabled={busy === `del-${t.id}`}
                          onClick={() => void onDelete(t)}
                        >
                          {busy === `del-${t.id}` ? '…' : 'مسح'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!teachers.length ? (
              <EmptyState>لا يوجد مدرسون</EmptyState>
            ) : !filteredTeachers.length ? (
              <EmptyState>لا يوجد مدرس مطابق للبحث</EmptyState>
            ) : null}
          </div>
          <TablePager
            page={paged.page}
            pages={paged.pages}
            total={paged.total}
            size={paged.size}
            from={paged.from}
            to={paged.to}
            onPage={paged.setPage}
          />
        </SectionCard>

        <SectionCard
          title={editingId ? 'تعديل مدرس' : 'إضافة مدرس'}
          subtitle="اختَر الصف الدراسي والمادة"
        >
          <form onSubmit={onSubmit} className="space-y-3">
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
              />
            </FieldLabel>
            <FieldLabel label="الهاتف">
              <input
                className="field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="سعر الحصة">
              <input
                type="number"
                className="field"
                value={form.hourlyRate}
                onChange={(e) =>
                  setForm({ ...form, hourlyRate: Number(e.target.value) })
                }
              />
            </FieldLabel>
            <FieldLabel label="الصف الدراسي (اختيار متعدد)">
              <select
                multiple
                className="field min-h-24"
                value={form.gradeLevelIds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gradeLevelIds: Array.from(e.target.selectedOptions).map(
                      (o) => o.value,
                    ),
                  })
                }
                required={!editingId}
              >
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nameAr}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="المواد (اختيار متعدد)">
              <select
                multiple
                className="field min-h-28"
                value={form.subjectIds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    subjectIds: Array.from(e.target.selectedOptions).map(
                      (o) => o.value,
                    ),
                  })
                }
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr} / {s.nameEn}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <button className="btn-accent w-full" disabled={busy === 'save'}>
              {busy === 'save'
                ? 'جاري الحفظ…'
                : editingId
                  ? 'حفظ التعديلات'
                  : 'حفظ المدرس'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={cancelEdit}
              >
                إلغاء التعديل
              </button>
            ) : null}
          </form>
        </SectionCard>
      </div>
      <AppDialog
        open={!!pendingDelete}
        tone="danger"
        title="مسح المدرس"
        message={`مسح المدرس «${pendingDelete?.name || ''}» من القائمة؟`}
        confirmLabel="مسح"
        cancelLabel="رجوع"
        onConfirm={() => void runDeleteTeacher()}
        onClose={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}
