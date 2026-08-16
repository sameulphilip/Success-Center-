'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
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

type NamedItem = {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder?: number;
};

export default function SettingsPage() {
  const [subjects, setSubjects] = useState<NamedItem[]>([]);
  const [grades, setGrades] = useState<NamedItem[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [gateQr, setGateQr] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [subjectForm, setSubjectForm] = useState({ nameAr: '', nameEn: '' });
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);

  const [gradeForm, setGradeForm] = useState({
    nameAr: '',
    nameEn: '',
    sortOrder: 10,
  });
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);

  const [roomForm, setRoomForm] = useState({ name: '', capacity: 30 });
  const [ask, setAsk] = useState<null | {
    kind: 'subject' | 'grade';
    id: string;
    name: string;
  }>(null);

  async function load() {
    const [s, g, c, u, qr] = await Promise.all([
      api<NamedItem[]>('/catalog/subjects'),
      api<NamedItem[]>('/catalog/grade-levels'),
      api<any[]>('/catalog/classrooms'),
      api<any[]>('/users'),
      api('/qr/gate'),
    ]);
    setSubjects(s);
    setGrades(g);
    setClassrooms(c);
    setUsers(u);
    setGateQr(qr);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message || 'فشل التحميل'));
  }, []);

  async function saveSubject(e: FormEvent) {
    e.preventDefault();
    setBusy('subject');
    setError('');
    try {
      if (editingSubjectId) {
        await api(`/catalog/subjects/${editingSubjectId}`, {
          method: 'PATCH',
          body: JSON.stringify(subjectForm),
        });
      } else {
        await api('/catalog/subjects', {
          method: 'POST',
          body: JSON.stringify(subjectForm),
        });
      }
      setSubjectForm({ nameAr: '', nameEn: '' });
      setEditingSubjectId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ المادة');
    } finally {
      setBusy('');
    }
  }

  async function deleteSubject(id: string, name: string) {
    setAsk({ kind: 'subject', id, name });
  }

  async function runDeleteSubject() {
    if (!ask || ask.kind !== 'subject') return;
    const { id } = ask;
    setBusy(`del-s-${id}`);
    setError('');
    try {
      await api(`/catalog/subjects/${id}`, { method: 'DELETE' });
      if (editingSubjectId === id) {
        setEditingSubjectId(null);
        setSubjectForm({ nameAr: '', nameEn: '' });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل مسح المادة');
    } finally {
      setBusy('');
    }
  }

  async function saveGrade(e: FormEvent) {
    e.preventDefault();
    setBusy('grade');
    setError('');
    try {
      const payload = {
        nameAr: gradeForm.nameAr,
        nameEn: gradeForm.nameEn || gradeForm.nameAr,
        sortOrder: Number(gradeForm.sortOrder) || 0,
      };
      if (editingGradeId) {
        await api(`/catalog/grade-levels/${editingGradeId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/catalog/grade-levels', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setGradeForm({ nameAr: '', nameEn: '', sortOrder: 10 });
      setEditingGradeId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الصف');
    } finally {
      setBusy('');
    }
  }

  async function deleteGrade(id: string, name: string) {
    setAsk({ kind: 'grade', id, name });
  }

  async function runDeleteGrade() {
    if (!ask || ask.kind !== 'grade') return;
    const { id } = ask;
    setBusy(`del-g-${id}`);
    setError('');
    try {
      await api(`/catalog/grade-levels/${id}`, { method: 'DELETE' });
      if (editingGradeId === id) {
        setEditingGradeId(null);
        setGradeForm({ nameAr: '', nameEn: '', sortOrder: 10 });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل مسح الصف');
    } finally {
      setBusy('');
    }
  }

  async function addRoom(e: FormEvent) {
    e.preventDefault();
    setBusy('room');
    setError('');
    try {
      await api('/catalog/classrooms', {
        method: 'POST',
        body: JSON.stringify(roomForm),
      });
      setRoomForm({ name: '', capacity: 30 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إضافة القاعة');
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="الإعدادات"
        subtitle="تحكم في الصفوف والمواد والقاعات"
      />
      <PageHero
        eyebrow="SETTINGS"
        title="إعدادات السنتر"
        subtitle="أضف وعدّل وامسح الصفوف والمواد من هنا"
        metrics={[
          { label: 'مواد', value: subjects.length, highlight: true },
          { label: 'صفوف', value: grades.length },
          { label: 'قاعات', value: classrooms.length },
          { label: 'مستخدمون', value: users.length },
        ]}
      />

      {error ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2 mb-4">
        <SectionCard
          title="الصفوف الدراسية"
          subtitle="مثل: الثاني الثانوي · الثالث الثانوي"
          badge={<span className="badge-navy">{grades.length}</span>}
        >
          <ul className="text-sm space-y-2 mb-4 max-h-64 overflow-auto">
            {grades.map((g) => (
              <li
                key={g.id}
                className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                  editingGradeId === g.id ? 'bg-gold/15' : 'bg-sand'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{g.nameAr}</p>
                  <p className="text-[11px] text-navy/45">
                    {g.nameEn}
                    {g.sortOrder != null ? ` · ترتيب ${g.sortOrder}` : ''}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => {
                      setEditingGradeId(g.id);
                      setGradeForm({
                        nameAr: g.nameAr,
                        nameEn: g.nameEn,
                        sortOrder: g.sortOrder ?? 10,
                      });
                    }}
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1 text-red-700"
                    disabled={busy === `del-g-${g.id}`}
                    onClick={() => void deleteGrade(g.id, g.nameAr)}
                  >
                    مسح
                  </button>
                </div>
              </li>
            ))}
            {!grades.length ? <EmptyState>لا توجد صفوف</EmptyState> : null}
          </ul>
          <form onSubmit={saveGrade} className="space-y-2 border-t border-mist pt-3">
            <p className="text-xs font-bold text-navy/55">
              {editingGradeId ? 'تعديل صف' : 'إضافة صف'}
            </p>
            <FieldLabel label="اسم الصف (عربي)">
              <input
                className="field"
                value={gradeForm.nameAr}
                onChange={(e) =>
                  setGradeForm({ ...gradeForm, nameAr: e.target.value })
                }
                placeholder="مثال: الثالث الثانوي"
                required
              />
            </FieldLabel>
            <FieldLabel label="English (اختياري)">
              <input
                className="field"
                value={gradeForm.nameEn}
                onChange={(e) =>
                  setGradeForm({ ...gradeForm, nameEn: e.target.value })
                }
                placeholder="Secondary 3"
              />
            </FieldLabel>
            <FieldLabel label="الترتيب">
              <input
                type="number"
                className="field"
                value={gradeForm.sortOrder}
                onChange={(e) =>
                  setGradeForm({
                    ...gradeForm,
                    sortOrder: Number(e.target.value),
                  })
                }
              />
            </FieldLabel>
            <button className="btn-primary w-full" disabled={busy === 'grade'}>
              {busy === 'grade'
                ? 'جاري الحفظ…'
                : editingGradeId
                  ? 'حفظ التعديل'
                  : 'إضافة صف'}
            </button>
            {editingGradeId ? (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setEditingGradeId(null);
                  setGradeForm({ nameAr: '', nameEn: '', sortOrder: 10 });
                }}
              >
                إلغاء التعديل
              </button>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard
          title="المواد"
          subtitle="مثل: عربي · رياضيات · Physics"
          badge={<span className="badge-navy">{subjects.length}</span>}
        >
          <ul className="text-sm space-y-2 mb-4 max-h-64 overflow-auto">
            {subjects.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                  editingSubjectId === s.id ? 'bg-gold/15' : 'bg-sand'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{s.nameAr}</p>
                  <p className="text-[11px] text-navy/45">{s.nameEn}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => {
                      setEditingSubjectId(s.id);
                      setSubjectForm({
                        nameAr: s.nameAr,
                        nameEn: s.nameEn,
                      });
                    }}
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1 text-red-700"
                    disabled={busy === `del-s-${s.id}`}
                    onClick={() => void deleteSubject(s.id, s.nameAr)}
                  >
                    مسح
                  </button>
                </div>
              </li>
            ))}
            {!subjects.length ? <EmptyState>لا توجد مواد</EmptyState> : null}
          </ul>
          <form
            onSubmit={saveSubject}
            className="space-y-2 border-t border-mist pt-3"
          >
            <p className="text-xs font-bold text-navy/55">
              {editingSubjectId ? 'تعديل مادة' : 'إضافة مادة'}
            </p>
            <FieldLabel label="الاسم عربي">
              <input
                className="field"
                value={subjectForm.nameAr}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, nameAr: e.target.value })
                }
                required
              />
            </FieldLabel>
            <FieldLabel label="English name">
              <input
                className="field"
                value={subjectForm.nameEn}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, nameEn: e.target.value })
                }
                required
              />
            </FieldLabel>
            <button className="btn-primary w-full" disabled={busy === 'subject'}>
              {busy === 'subject'
                ? 'جاري الحفظ…'
                : editingSubjectId
                  ? 'حفظ التعديل'
                  : 'إضافة مادة'}
            </button>
            {editingSubjectId ? (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setEditingSubjectId(null);
                  setSubjectForm({ nameAr: '', nameEn: '' });
                }}
              >
                إلغاء التعديل
              </button>
            ) : null}
          </form>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="القاعات"
          badge={<span className="badge-navy">{classrooms.length}</span>}
        >
          <ul className="text-sm space-y-2 mb-4 max-h-40 overflow-auto">
            {classrooms.map((c) => (
              <li
                key={c.id}
                className="rounded-xl bg-sand px-3 py-2 flex justify-between"
              >
                <span className="font-semibold text-navy">{c.name}</span>
                <span className="badge-gold">{c.capacity}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={addRoom} className="space-y-2">
            <FieldLabel label="اسم القاعة">
              <input
                className="field"
                value={roomForm.name}
                onChange={(e) =>
                  setRoomForm({ ...roomForm, name: e.target.value })
                }
                required
              />
            </FieldLabel>
            <FieldLabel label="السعة">
              <input
                type="number"
                className="field"
                value={roomForm.capacity}
                onChange={(e) =>
                  setRoomForm({ ...roomForm, capacity: Number(e.target.value) })
                }
              />
            </FieldLabel>
            <button className="btn-accent w-full" disabled={busy === 'room'}>
              إضافة قاعة
            </button>
          </form>
        </SectionCard>

        <SectionCard title="QR بوابة السنتر" subtitle="للمسح عند المدخل">
          <div className="text-center">
            {gateQr?.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gateQr.qrDataUrl}
                alt="Gate QR"
                className="mx-auto rounded-xl border border-mist bg-white p-2"
              />
            ) : (
              <EmptyState>جاري التحميل...</EmptyState>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="QR دخول الطالب"
          subtitle="صفحة مستقلة في القائمة الجانبية"
          action={
            <Link href="/login-qr" className="btn-accent text-xs px-2 py-1">
              فتح الصفحة
            </Link>
          }
        >
          <p className="text-sm text-navy/60">
            من القائمة: <strong>QR دخول الطالب</strong> — اطبع الملصق أو انسخ الرابط.
          </p>
        </SectionCard>

        <SectionCard
          title="المستخدمون"
          subtitle="للإدارة الكاملة استخدم صفحة الحسابات"
          action={
            <Link href="/users" className="btn-ghost text-xs px-2 py-1">
              إدارة الحسابات
            </Link>
          }
        >
          <ul className="text-sm space-y-2 max-h-72 overflow-auto">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border border-mist px-3 py-2">
                <p className="font-semibold text-navy">{u.fullName}</p>
                <p className="text-xs text-navy/45 mt-0.5">{u.email}</p>
                <span className="badge-navy mt-2">
                  {u.role?.nameAr || u.role?.code || u.role}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
      <AppDialog
        open={!!ask}
        tone="danger"
        title={ask?.kind === 'grade' ? 'مسح الصف' : 'مسح المادة'}
        message={`مسح «${ask?.name || ''}»؟`}
        confirmLabel="مسح"
        cancelLabel="رجوع"
        onConfirm={() => {
          if (ask?.kind === 'grade') void runDeleteGrade();
          else void runDeleteSubject();
        }}
        onClose={() => setAsk(null)}
      />
    </AppShell>
  );
}
