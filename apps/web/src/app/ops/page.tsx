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
import { api, getStoredUser } from '@/lib/api';

type Teacher = { id: string; firstName: string; lastName: string };
type Subject = { id: string; nameAr: string };
type Student = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  studentUid: string;
  phoneCheckInUsed?: number;
};

type Session = {
  id: string;
  title?: string | null;
  status: 'OPEN' | 'CLOSED';
  feeAmount: string | number;
  teacherPercent: string | number;
  settledTeacherAmount?: string | number | null;
  settledCenterAmount?: string | number | null;
  teacher: Teacher;
  subject?: Subject | null;
  _count?: { entries: number };
  entries?: Entry[];
};

type Entry = {
  id: string;
  amount: string | number;
  method: 'CASH' | 'VODAFONE_CASH';
  payStatus: string;
  vodafoneTxn?: string | null;
  receiptNumber: string;
  checkedInAt?: string | null;
  refundedAmount?: string | number;
  student: Student;
};

type Block = {
  id: string;
  scope: 'CENTER' | 'TEACHER';
  reason: string;
  student: Student;
  teacher?: Teacher | null;
};

const payStatusAr: Record<string, string> = {
  PENDING_CONFIRM: 'بانتظار تأكيد فودافون',
  CONFIRMED: 'مؤكد',
  REFUNDED: 'مسترجع كامل',
  PARTIALLY_REFUNDED: 'مسترجع جزئي',
};

export default function OpsPage() {
  const me = getStoredUser();
  const isManager =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Session | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const [openForm, setOpenForm] = useState({
    teacherId: '',
    subjectId: '',
    title: '',
    feeAmount: 0,
    teacherPercent: 50,
    notes: '',
  });

  const [payForm, setPayForm] = useState({
    phone: '',
    method: 'CASH' as 'CASH' | 'VODAFONE_CASH',
    vodafoneTxn: '',
  });

  const [checkForm, setCheckForm] = useState({
    phone: '',
    qrPayload: '',
    source: 'MANUAL' as 'MANUAL' | 'PHONE' | 'QR',
  });
  const [choiceSessions, setChoiceSessions] = useState<any[] | null>(null);
  const [choiceStudent, setChoiceStudent] = useState<Student | null>(null);

  const [refundForm, setRefundForm] = useState({
    entryId: '',
    amount: '',
    reason: 'CANCELLED',
    note: '',
  });

  const [blockForm, setBlockForm] = useState({
    phone: '',
    scope: 'CENTER' as 'CENTER' | 'TEACHER',
    teacherId: '',
    reason: '',
  });

  async function loadLists() {
    const [s, t, sub, b] = await Promise.all([
      api<Session[]>('/ops/sessions'),
      api<Teacher[]>('/teachers'),
      api<Subject[]>('/catalog/subjects'),
      api<Block[]>('/ops/blocks'),
    ]);
    setSessions(s);
    setTeachers(t);
    setSubjects(sub);
    setBlocks(b);
    if (!selectedId && s[0]) setSelectedId(s[0].id);
    if (!openForm.teacherId && t[0]) {
      setOpenForm((f) => ({ ...f, teacherId: t[0].id }));
    }
  }

  async function loadDetail(id: string) {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetail(await api<Session>(`/ops/sessions/${id}`));
  }

  useEffect(() => {
    loadLists().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId).catch((e) => setError(e.message));
  }, [selectedId]);

  const openCount = useMemo(
    () => sessions.filter((s) => s.status === 'OPEN').length,
    [sessions],
  );

  async function openSession(e: FormEvent) {
    e.preventDefault();
    setBusy('open');
    setError('');
    try {
      const created = await api<Session>('/ops/sessions', {
        method: 'POST',
        body: JSON.stringify({
          ...openForm,
          subjectId: openForm.subjectId || undefined,
          title: openForm.title || undefined,
        }),
      });
      await loadLists();
      setSelectedId(created.id);
      setMsg('تم فتح الجلسة');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function collectPay(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy('pay');
    setError('');
    try {
      await api(`/ops/sessions/${selectedId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          phone: payForm.phone,
          method: payForm.method,
          vodafoneTxn:
            payForm.method === 'VODAFONE_CASH'
              ? payForm.vodafoneTxn
              : undefined,
        }),
      });
      setPayForm({ phone: '', method: 'CASH', vodafoneTxn: '' });
      await loadDetail(selectedId);
      await loadLists();
      setMsg('تم تسجيل الدفع');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function confirmEntry(id: string) {
    setBusy(`c-${id}`);
    try {
      await api(`/ops/entries/${id}/confirm`, { method: 'POST' });
      if (selectedId) await loadDetail(selectedId);
      setMsg('تم تأكيد فودافون كاش');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function doCheckIn(e: FormEvent) {
    e.preventDefault();
    setBusy('in');
    setError('');
    setChoiceSessions(null);
    try {
      const res = await api<any>('/ops/check-in', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: selectedId || undefined,
          phone: checkForm.phone || undefined,
          qrPayload: checkForm.qrPayload || undefined,
          source: checkForm.source,
        }),
      });
      if (res.needsSessionChoice) {
        setChoiceStudent(res.student);
        setChoiceSessions(res.sessions);
        setMsg('اختَر الجلسة/المدرس للطالب');
      } else if (res.alreadyCheckedIn) {
        setMsg('الطالب حاضر بالفعل');
      } else {
        setMsg('تم تسجيل الحضور');
        setCheckForm({ phone: '', qrPayload: '', source: 'MANUAL' });
        if (selectedId) await loadDetail(selectedId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function checkInToSession(sessionId: string) {
    if (!choiceStudent) return;
    setBusy('in');
    try {
      await api('/ops/check-in', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          studentId: choiceStudent.id,
          source: checkForm.source,
        }),
      });
      setChoiceSessions(null);
      setChoiceStudent(null);
      setMsg('تم تسجيل الحضور');
      setSelectedId(sessionId);
      await loadDetail(sessionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function closeSession() {
    if (!selectedId || !confirm('قفل الجلسة وتثبيت نسب المدرس/السنتر؟')) return;
    setBusy('close');
    try {
      await api(`/ops/sessions/${selectedId}/close`, { method: 'POST' });
      await loadLists();
      await loadDetail(selectedId);
      setMsg('تم قفل الجلسة وتسوية الحساب');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function doRefund(e: FormEvent) {
    e.preventDefault();
    if (!refundForm.entryId) return;
    setBusy('refund');
    try {
      await api(`/ops/entries/${refundForm.entryId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: refundForm.amount
            ? Number(refundForm.amount)
            : undefined,
          reason: refundForm.reason,
          note: refundForm.note || undefined,
        }),
      });
      setRefundForm({ entryId: '', amount: '', reason: 'CANCELLED', note: '' });
      if (selectedId) await loadDetail(selectedId);
      setMsg('تم الاسترجاع');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function addBlock(e: FormEvent) {
    e.preventDefault();
    setBusy('block');
    try {
      const student = await api<Student>(
        `/ops/students/lookup?phone=${encodeURIComponent(blockForm.phone)}`,
      );
      await api('/ops/blocks', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          scope: blockForm.scope,
          teacherId:
            blockForm.scope === 'TEACHER' ? blockForm.teacherId : undefined,
          reason: blockForm.reason,
        }),
      });
      setBlockForm({
        phone: '',
        scope: 'CENTER',
        teacherId: '',
        reason: '',
      });
      await loadLists();
      setMsg('تم تفعيل الحظر');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function removeBlock(id: string) {
    setBusy(`b-${id}`);
    try {
      await api(`/ops/blocks/${id}/deactivate`, { method: 'PATCH' });
      await loadLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="تشغيل الحصص"
        subtitle="جلسة مرنة · دفع قبل الدخول · حضور · استرجاع · حظر"
      />
      <PageHero
        eyebrow="OPS"
        title="الاستقبال — تشغيل اليوم"
        subtitle="افتح جلسة، حصّل، أكّد فودافون، سجّل حضور، واقفل الحساب"
        metrics={[
          { label: 'جلسات مفتوحة', value: openCount, highlight: true },
          { label: 'كل الجلسات', value: sessions.length },
          { label: 'حظر نشط', value: blocks.length },
        ]}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {msg ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <SectionCard title="فتح جلسة مرنة" subtitle="استقبال فقط · سعر ونسبة يدوي">
            <form onSubmit={openSession} className="space-y-2">
              <FieldLabel label="المدرس">
                <select
                  className="field"
                  required
                  value={openForm.teacherId}
                  onChange={(e) =>
                    setOpenForm({ ...openForm, teacherId: e.target.value })
                  }
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="المادة (اختياري)">
                <select
                  className="field"
                  value={openForm.subjectId}
                  onChange={(e) =>
                    setOpenForm({ ...openForm, subjectId: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="عنوان مختصر">
                <input
                  className="field"
                  value={openForm.title}
                  onChange={(e) =>
                    setOpenForm({ ...openForm, title: e.target.value })
                  }
                  placeholder="مراجعة / حصة عادية"
                />
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="سعر الحصة">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    required
                    value={openForm.feeAmount}
                    onChange={(e) =>
                      setOpenForm({
                        ...openForm,
                        feeAmount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="نسبة المدرس %">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={openForm.teacherPercent}
                    onChange={(e) =>
                      setOpenForm({
                        ...openForm,
                        teacherPercent: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === 'open'}
              >
                فتح الجلسة
              </button>
            </form>
          </SectionCard>

          <SectionCard title="الجلسات">
            <ul className="space-y-2 max-h-80 overflow-auto">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-xl px-3 py-2 text-right text-sm ${
                      selectedId === s.id
                        ? 'bg-[#0B2545] text-white'
                        : 'bg-sand text-navy'
                    }`}
                  >
                    <span className="font-semibold block">
                      {s.teacher.firstName} {s.teacher.lastName}
                      {s.title ? ` · ${s.title}` : ''}
                    </span>
                    <span
                      className={`text-[11px] ${
                        selectedId === s.id ? 'text-white/60' : 'text-navy/45'
                      }`}
                    >
                      {s.status === 'OPEN' ? 'مفتوحة' : 'مقفولة'} ·{' '}
                      {Number(s.feeAmount).toLocaleString('en-EG')} ج.م · مدرس{' '}
                      {Number(s.teacherPercent)}% · {s._count?.entries ?? 0} قيد
                    </span>
                  </button>
                </li>
              ))}
              {!sessions.length ? <EmptyState>لا توجد جلسات</EmptyState> : null}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {detail ? (
            <>
              <SectionCard
                title={`${detail.teacher.firstName} ${detail.teacher.lastName}`}
                subtitle={`${detail.subject?.nameAr || 'بدون مادة'} · سعر ${Number(detail.feeAmount).toLocaleString('en-EG')} · نسبة مدرس ${Number(detail.teacherPercent)}%`}
                badge={
                  <span
                    className={
                      detail.status === 'OPEN' ? 'badge-ok' : 'badge-warn'
                    }
                  >
                    {detail.status === 'OPEN' ? 'مفتوحة' : 'مقفولة'}
                  </span>
                }
                action={
                  detail.status === 'OPEN' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy === 'close'}
                      onClick={closeSession}
                    >
                      قفل وتسوية
                    </button>
                  ) : (
                    <span className="text-xs text-navy/50">
                      مدرس:{' '}
                      {Number(detail.settledTeacherAmount || 0).toLocaleString(
                        'en-EG',
                      )}{' '}
                      · سنتر:{' '}
                      {Number(detail.settledCenterAmount || 0).toLocaleString(
                        'en-EG',
                      )}
                    </span>
                  )
                }
              >
                {detail.status === 'OPEN' ? (
                  <div className="grid gap-4 lg:grid-cols-2 mb-4">
                    <form
                      onSubmit={collectPay}
                      className="rounded-xl border border-mist p-3 space-y-2"
                    >
                      <p className="font-bold text-navy text-sm">تحصيل قبل الدخول</p>
                      <FieldLabel label="موبايل الطالب">
                        <input
                          className="field"
                          required
                          value={payForm.phone}
                          onChange={(e) =>
                            setPayForm({ ...payForm, phone: e.target.value })
                          }
                          placeholder="01xxxxxxxxx"
                        />
                      </FieldLabel>
                      <FieldLabel label="طريقة الدفع">
                        <select
                          className="field"
                          value={payForm.method}
                          onChange={(e) =>
                            setPayForm({
                              ...payForm,
                              method: e.target.value as any,
                            })
                          }
                        >
                          <option value="CASH">كاش</option>
                          <option value="VODAFONE_CASH">فودافون كاش</option>
                        </select>
                      </FieldLabel>
                      {payForm.method === 'VODAFONE_CASH' ? (
                        <FieldLabel label="رقم العملية">
                          <input
                            className="field"
                            required
                            value={payForm.vodafoneTxn}
                            onChange={(e) =>
                              setPayForm({
                                ...payForm,
                                vodafoneTxn: e.target.value,
                              })
                            }
                          />
                        </FieldLabel>
                      ) : null}
                      <button
                        type="submit"
                        className="btn-accent w-full"
                        disabled={busy === 'pay'}
                      >
                        تسجيل الدفع
                      </button>
                    </form>

                    <form
                      onSubmit={doCheckIn}
                      className="rounded-xl border border-mist p-3 space-y-2"
                    >
                      <p className="font-bold text-navy text-sm">حضور</p>
                      <FieldLabel label="موبايل أو QR">
                        <input
                          className="field"
                          value={checkForm.phone}
                          onChange={(e) =>
                            setCheckForm({
                              ...checkForm,
                              phone: e.target.value,
                              qrPayload: '',
                            })
                          }
                          placeholder="موبايل الطالب"
                        />
                      </FieldLabel>
                      <FieldLabel label="أو لصق QR payload">
                        <input
                          className="field font-mono text-xs"
                          value={checkForm.qrPayload}
                          onChange={(e) =>
                            setCheckForm({
                              ...checkForm,
                              qrPayload: e.target.value,
                              phone: '',
                            })
                          }
                        />
                      </FieldLabel>
                      <FieldLabel label="المصدر">
                        <select
                          className="field"
                          value={checkForm.source}
                          onChange={(e) =>
                            setCheckForm({
                              ...checkForm,
                              source: e.target.value as any,
                            })
                          }
                        >
                          <option value="MANUAL">يدوي / QR عند الاستقبال</option>
                          <option value="PHONE">استثناء موبايل (مرتين كحد أقصى)</option>
                          <option value="QR">QR</option>
                        </select>
                      </FieldLabel>
                      <button
                        type="submit"
                        className="btn-primary w-full"
                        disabled={busy === 'in'}
                      >
                        تسجيل حضور
                      </button>
                    </form>
                  </div>
                ) : null}

                {choiceSessions ? (
                  <div className="mb-4 rounded-xl bg-sand p-3">
                    <p className="text-sm font-bold text-navy mb-2">
                      اختر جلسة لـ {choiceStudent?.firstName}{' '}
                      {choiceStudent?.lastName}
                    </p>
                    <ul className="space-y-2">
                      {choiceSessions.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                        >
                          <span>
                            {s.teacher.firstName} {s.teacher.lastName}
                            {s.title ? ` · ${s.title}` : ''}
                          </span>
                          {s.canCheckIn ? (
                            <button
                              type="button"
                              className="btn-accent text-xs"
                              onClick={() => checkInToSession(s.id)}
                            >
                              حضور
                            </button>
                          ) : s.needsConfirm ? (
                            <span className="text-amber-700 text-xs">
                              يحتاج تأكيد فودافون
                            </span>
                          ) : (
                            <span className="text-navy/45 text-xs">
                              يحتاج دفع أولًا
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="overflow-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>الطالب</th>
                        <th>الدفع</th>
                        <th>الحضور</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.entries || []).map((e) => (
                        <tr key={e.id}>
                          <td>
                            <p className="font-semibold">
                              {e.student.firstName} {e.student.lastName}
                            </p>
                            <p className="text-[11px] text-navy/45">
                              {e.student.phone}
                            </p>
                          </td>
                          <td className="text-xs">
                            <div>
                              {Number(e.amount).toLocaleString('en-EG')} ·{' '}
                              {e.method === 'CASH' ? 'كاش' : 'فودافون'}
                            </div>
                            <div>{payStatusAr[e.payStatus] || e.payStatus}</div>
                            {e.vodafoneTxn ? (
                              <div className="font-mono text-navy/40">
                                {e.vodafoneTxn}
                              </div>
                            ) : null}
                          </td>
                          <td className="text-xs">
                            {e.checkedInAt
                              ? new Date(e.checkedInAt).toLocaleTimeString('ar-EG')
                              : '—'}
                          </td>
                          <td className="space-y-1">
                            {e.payStatus === 'PENDING_CONFIRM' ? (
                              <button
                                type="button"
                                className="btn-accent text-xs px-2 py-1 w-full"
                                disabled={busy === `c-${e.id}`}
                                onClick={() => confirmEntry(e.id)}
                              >
                                تأكيد فودافون
                              </button>
                            ) : null}
                            {(e.payStatus === 'CONFIRMED' ||
                              e.payStatus === 'PARTIALLY_REFUNDED') &&
                            (detail.status === 'OPEN' || isManager) ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs px-2 py-1 w-full"
                                onClick={() =>
                                  setRefundForm({
                                    entryId: e.id,
                                    amount: String(
                                      Number(e.amount) -
                                        Number(e.refundedAmount || 0),
                                    ),
                                    reason: 'CANCELLED',
                                    note: '',
                                  })
                                }
                              >
                                استرجاع
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!detail.entries?.length ? (
                    <EmptyState>لا يوجد طلاب في الجلسة بعد</EmptyState>
                  ) : null}
                </div>

                {refundForm.entryId ? (
                  <form
                    onSubmit={doRefund}
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3 grid gap-2 sm:grid-cols-4"
                  >
                    <FieldLabel label="المبلغ">
                      <input
                        className="field"
                        type="number"
                        min={0}
                        value={refundForm.amount}
                        onChange={(e) =>
                          setRefundForm({
                            ...refundForm,
                            amount: e.target.value,
                          })
                        }
                      />
                    </FieldLabel>
                    <FieldLabel label="السبب">
                      <select
                        className="field"
                        value={refundForm.reason}
                        onChange={(e) =>
                          setRefundForm({
                            ...refundForm,
                            reason: e.target.value,
                          })
                        }
                      >
                        <option value="CANCELLED">إلغاء</option>
                        <option value="LATE">تأخير</option>
                        <option value="EXPULSION">طرد</option>
                        <option value="OTHER">أخرى</option>
                      </select>
                    </FieldLabel>
                    <FieldLabel label="ملاحظة">
                      <input
                        className="field"
                        value={refundForm.note}
                        onChange={(e) =>
                          setRefundForm({ ...refundForm, note: e.target.value })
                        }
                      />
                    </FieldLabel>
                    <div className="pt-6 flex gap-2">
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={busy === 'refund'}
                      >
                        تنفيذ
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() =>
                          setRefundForm({
                            entryId: '',
                            amount: '',
                            reason: 'CANCELLED',
                            note: '',
                          })
                        }
                      >
                        إلغاء
                      </button>
                    </div>
                    {detail.status === 'CLOSED' ? (
                      <p className="sm:col-span-4 text-xs text-amber-800">
                        استثناء مدير بعد قفل الحصة
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </SectionCard>
            </>
          ) : (
            <SectionCard title="تفاصيل الجلسة">
              <EmptyState>افتح جلسة أو اختر واحدة</EmptyState>
            </SectionCard>
          )}

          <SectionCard title="الحظر" subtitle="من مدرس معيّن أو من السنتر كله">
            <form
              onSubmit={addBlock}
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 mb-4"
            >
              <FieldLabel label="موبايل الطالب">
                <input
                  className="field"
                  required
                  value={blockForm.phone}
                  onChange={(e) =>
                    setBlockForm({ ...blockForm, phone: e.target.value })
                  }
                />
              </FieldLabel>
              <FieldLabel label="النطاق">
                <select
                  className="field"
                  value={blockForm.scope}
                  onChange={(e) =>
                    setBlockForm({
                      ...blockForm,
                      scope: e.target.value as any,
                    })
                  }
                >
                  <option value="CENTER">السنتر كله</option>
                  <option value="TEACHER">مدرس معيّن</option>
                </select>
              </FieldLabel>
              {blockForm.scope === 'TEACHER' ? (
                <FieldLabel label="المدرس">
                  <select
                    className="field"
                    required
                    value={blockForm.teacherId}
                    onChange={(e) =>
                      setBlockForm({ ...blockForm, teacherId: e.target.value })
                    }
                  >
                    <option value="">اختر</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              ) : (
                <div />
              )}
              <FieldLabel label="السبب">
                <input
                  className="field"
                  required
                  value={blockForm.reason}
                  onChange={(e) =>
                    setBlockForm({ ...blockForm, reason: e.target.value })
                  }
                />
              </FieldLabel>
              <div className="pt-6">
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={busy === 'block'}
                >
                  حظر
                </button>
              </div>
            </form>
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-mist px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-semibold">
                      {b.student.firstName} {b.student.lastName}
                    </span>
                    <span className="text-navy/45">
                      {' '}
                      ·{' '}
                      {b.scope === 'CENTER'
                        ? 'السنتر'
                        : `مدرس ${b.teacher?.firstName || ''}`}{' '}
                      · {b.reason}
                    </span>
                  </span>
                  {isManager ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 font-semibold"
                      onClick={() => removeBlock(b.id)}
                    >
                      إلغاء الحظر
                    </button>
                  ) : null}
                </li>
              ))}
              {!blocks.length ? <EmptyState>لا يوجد حظر نشط</EmptyState> : null}
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
