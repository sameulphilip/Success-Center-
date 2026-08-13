'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  ListRow,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

export default function ExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({
    title: '',
    groupId: '',
    subjectId: '',
    maxScore: 100,
    examDate: new Date().toISOString().slice(0, 10),
  });
  const [scores, setScores] = useState<Record<string, number>>({});

  async function load() {
    const [e, g] = await Promise.all([
      api<any[]>('/exams'),
      api<any[]>('/groups'),
    ]);
    setExams(e);
    setGroups(g);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function createExam(e: FormEvent) {
    e.preventDefault();
    const group = groups.find((g) => g.id === form.groupId);
    await api('/exams', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        subjectId: group?.subjectId || form.subjectId,
      }),
    });
    setForm({
      title: '',
      groupId: '',
      subjectId: '',
      maxScore: 100,
      examDate: new Date().toISOString().slice(0, 10),
    });
    await load();
  }

  async function openExam(id: string) {
    const exam = await api<any>(`/exams/${id}`);
    setSelected(exam);
    const initial: Record<string, number> = {};
    for (const en of exam.group.enrollments || []) {
      const existing = exam.grades.find(
        (g: any) => g.studentId === en.studentId,
      );
      initial[en.studentId] = existing ? Number(existing.score) : 0;
    }
    setScores(initial);
  }

  async function saveGrades(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await api(`/exams/${selected.id}/grades`, {
      method: 'POST',
      body: JSON.stringify({
        grades: Object.entries(scores).map(([studentId, score]) => ({
          studentId,
          score,
        })),
      }),
    });
    await openExam(selected.id);
    await load();
  }

  return (
    <AppShell>
      <PageHeader
        title="الامتحانات والدرجات"
        subtitle="إنشاء امتحان، رصد درجات، ترتيب ومتوسط المجموعة"
      />
      <PageHero
        eyebrow="EXAMS"
        title="التقييم الأكاديمي"
        subtitle="أنشئ الامتحان ثم ارصد الدرجات وشوف الترتيب فوراً"
        metrics={[
          { label: 'امتحانات', value: exams.length, highlight: true },
          { label: 'مجموعات', value: groups.length },
          {
            label: 'متوسط مفتوح',
            value: selected ? Number(selected.average || 0).toFixed(1) : '—',
          },
          {
            label: 'الدرجة القصوى',
            value: selected ? Number(selected.maxScore) : form.maxScore,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <SectionCard title="إنشاء امتحان">
            <form onSubmit={createExam} className="space-y-3">
              <FieldLabel label="عنوان الامتحان">
                <input
                  className="field"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </FieldLabel>
              <FieldLabel label="المجموعة">
                <select
                  className="field"
                  value={form.groupId}
                  onChange={(e) => {
                    const group = groups.find((g) => g.id === e.target.value);
                    setForm({
                      ...form,
                      groupId: e.target.value,
                      subjectId: group?.subjectId || '',
                    });
                  }}
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
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="الدرجة القصوى">
                  <input
                    type="number"
                    className="field"
                    value={form.maxScore}
                    onChange={(e) =>
                      setForm({ ...form, maxScore: Number(e.target.value) })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ">
                  <input
                    type="date"
                    className="field"
                    value={form.examDate}
                    onChange={(e) =>
                      setForm({ ...form, examDate: e.target.value })
                    }
                  />
                </FieldLabel>
              </div>
              <button className="btn-accent w-full">حفظ الامتحان</button>
            </form>
          </SectionCard>

          <SectionCard
            title="الامتحانات"
            badge={<span className="badge-navy">{exams.length}</span>}
          >
            <div className="space-y-2 max-h-80 overflow-auto">
              {exams.map((exam) => (
                <ListRow
                  key={exam.id}
                  active={selected?.id === exam.id}
                  onClick={() => void openExam(exam.id)}
                  title={exam.title}
                  subtitle={`${exam.subject?.nameEn} / ${exam.group?.name}`}
                  meta={String(exam.examDate || '').slice(0, 10)}
                />
              ))}
              {!exams.length ? <EmptyState>لا توجد امتحانات</EmptyState> : null}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title={selected ? selected.title : 'رصد الدرجات'}
          subtitle={
            selected
              ? `متوسط المجموعة: ${Number(selected.average || 0).toFixed(1)} / ${Number(selected.maxScore)}`
              : 'اختر امتحاناً من القائمة'
          }
        >
          {!selected ? (
            <EmptyState>اختر امتحاناً لرصد الدرجات</EmptyState>
          ) : (
            <>
              <form onSubmit={saveGrades} className="space-y-3">
                {(selected.group.enrollments || []).map((en: any) => (
                  <div
                    key={en.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-sand px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-navy">
                      {en.student.firstName} {en.student.lastName}
                    </span>
                    <input
                      type="number"
                      className="field mt-0 w-28"
                      value={scores[en.studentId] ?? 0}
                      onChange={(e) =>
                        setScores({
                          ...scores,
                          [en.studentId]: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
                <button className="btn-primary w-full">حفظ الدرجات</button>
              </form>

              <h4 className="section-title mt-6 mb-2">الترتيب</h4>
              <ol className="space-y-2">
                {(selected.ranked || []).map((r: any, idx: number) => (
                  <li
                    key={r.studentId}
                    className="flex items-center justify-between rounded-xl border border-mist px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      {r.student.firstName} {r.student.lastName}
                    </span>
                    <span className="font-extrabold text-navy tabular-nums">
                      {Number(r.score)}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
