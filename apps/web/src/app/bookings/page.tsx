'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type Offering = {
  id: string;
  teacherName: string;
  subjectName: string;
  isOnline: boolean;
  feeAmount: string | number;
  pageNumber: number;
  sortOrder: number;
  isActive: boolean;
};

type FormRow = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  academicYear: string;
  gradeLabel: string;
  isPublished: boolean;
  defaultFee: string | number;
  notes?: string | null;
  _count?: { offerings: number; submissions: number };
  offerings?: Offering[];
};

type Submission = {
  id: string;
  studentName: string;
  studentPhone: string;
  parentPhone: string;
  status: 'SUBMITTED' | 'PAID' | 'CANCELLED';
  totalAmount: string | number;
  receiptNumber?: string | null;
  paidAt?: string | null;
  createdAt: string;
  form: { id: string; title: string; slug: string };
  selections: {
    feeAmount: string | number;
    offering: {
      teacherName: string;
      subjectName: string;
      isOnline: boolean;
    };
  }[];
};

type SharePack = {
  url: string;
  qrDataUrl: string;
  title: string;
  slug: string;
};

const statusLabel: Record<string, string> = {
  SUBMITTED: 'بانتظار الدفع',
  PAID: 'تم الدفع',
  CANCELLED: 'ملغي',
};

export default function BookingsAdminPage() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [formDetail, setFormDetail] = useState<FormRow | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [offeringForm, setOfferingForm] = useState({
    teacherName: '',
    subjectName: '',
    isOnline: false,
  });
  const [createForm, setCreateForm] = useState({
    slug: 'g3-2026-2027',
    title: 'استمارة حجز الصف الثالث الثانوي',
    academicYear: '2026-2027',
    gradeLabel: 'الثالث الثانوي',
    defaultFee: 0,
    seedTeachers: true,
    isPublished: true,
  });

  const gradePresets = [
    {
      gradeLabel: 'الثالث الثانوي',
      slug: 'g3-2026-2027',
      title: 'استمارة حجز الصف الثالث الثانوي',
    },
    {
      gradeLabel: 'الثاني الثانوي',
      slug: 'g2-2026-2027',
      title: 'استمارة حجز الصف الثاني الثانوي',
    },
  ] as const;

  function applyGradePreset(gradeLabel: string) {
    const preset = gradePresets.find((g) => g.gradeLabel === gradeLabel);
    if (!preset) {
      setCreateForm((f) => ({ ...f, gradeLabel }));
      return;
    }
    setCreateForm((f) => ({
      ...f,
      gradeLabel: preset.gradeLabel,
      slug: preset.slug,
      title: preset.title,
    }));
  }
  const [share, setShare] = useState<SharePack | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadForms() {
    const list = await api<FormRow[]>('/booking/forms');
    setForms(list);
    if (!selectedFormId && list[0]) setSelectedFormId(list[0].id);
  }

  async function loadSubmissions(formId?: string, status?: string) {
    const q = new URLSearchParams();
    if (formId) q.set('formId', formId);
    if (status) q.set('status', status);
    const path = `/booking/submissions${q.toString() ? `?${q}` : ''}`;
    setSubmissions(await api<Submission[]>(path));
  }

  async function loadDetail(id: string) {
    if (!id) {
      setFormDetail(null);
      setShare(null);
      return;
    }
    const baseUrl =
      typeof window !== 'undefined' ? window.location.origin : '';
    const [detail, sharePack] = await Promise.all([
      api<FormRow>(`/booking/forms/${id}`),
      api<SharePack>(
        `/booking/forms/${id}/share?baseUrl=${encodeURIComponent(baseUrl)}`,
      ),
    ]);
    setFormDetail(detail);
    setShare(sharePack);
    setCopied(false);
  }

  async function copyFullLink() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('تعذر نسخ الرابط');
    }
  }

  async function refresh() {
    await loadForms();
    await loadSubmissions(selectedFormId || undefined, statusFilter || undefined);
    if (selectedFormId) await loadDetail(selectedFormId);
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('accessToken')) {
      window.location.href = '/login';
      return;
    }
    loadForms().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedFormId) return;
    Promise.all([
      loadDetail(selectedFormId),
      loadSubmissions(selectedFormId, statusFilter || undefined),
    ]).catch((e) => setError(e.message));
  }, [selectedFormId, statusFilter]);

  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === 'SUBMITTED').length,
    [submissions],
  );
  const paidCount = useMemo(
    () => submissions.filter((s) => s.status === 'PAID').length,
    [submissions],
  );

  async function createBookingForm(e: FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError('');
    try {
      const created = await api<FormRow>('/booking/forms', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          seedTeachers: createForm.seedTeachers,
        }),
      });
      await loadForms();
      setSelectedFormId(created.id);
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء الاستمارة');
    } finally {
      setBusy('');
    }
  }

  async function togglePublish() {
    if (!formDetail) return;
    setBusy('publish');
    try {
      await api(`/booking/forms/${formDetail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: !formDetail.isPublished }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveDefaultFee(fee: number) {
    if (!formDetail) return;
    setBusy('fee');
    try {
      await api(`/booking/forms/${formDetail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ defaultFee: fee }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function addOffering(e: FormEvent) {
    e.preventDefault();
    if (!formDetail) return;
    setBusy('offering');
    try {
      await api(`/booking/forms/${formDetail.id}/offerings`, {
        method: 'POST',
        body: JSON.stringify(offeringForm),
      });
      setOfferingForm({
        teacherName: '',
        subjectName: '',
        isOnline: false,
      });
      await loadDetail(formDetail.id);
      await loadForms();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function removeOffering(id: string) {
    if (!confirm('حذف هذا المدرس من الاستمارة؟')) return;
    setBusy(`del-${id}`);
    try {
      await api(`/booking/offerings/${id}`, { method: 'DELETE' });
      if (formDetail) await loadDetail(formDetail.id);
      await loadForms();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function markPaid(id: string) {
    setBusy(`paid-${id}`);
    try {
      const res = await api<{
        receiptNumber?: string;
        portalAccount?: {
          phone: string;
          mustSetPassword: boolean;
          created: boolean;
        } | null;
      }>(`/booking/submissions/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.portalAccount?.created) {
        setError('');
        alert(
          `تم الدفع وإنشاء حساب الطالب.\nالدخول برقم: ${res.portalAccount.phone}\nأول مرة يعيّن كلمة المرور بنفسه.`,
        );
      } else if (res.portalAccount) {
        alert(
          `تم الدفع. حساب الموبايل ${res.portalAccount.phone} موجود بالفعل.`,
        );
      }
      await loadSubmissions(selectedFormId || undefined, statusFilter || undefined);
      await loadForms();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function cancelSubmission(id: string) {
    if (!confirm('إلغاء هذا الحجز؟')) return;
    setBusy(`cancel-${id}`);
    try {
      await api(`/booking/submissions/${id}/cancel`, { method: 'POST' });
      await loadSubmissions(selectedFormId || undefined, statusFilter || undefined);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="استمارات الحجز"
        subtitle="إدارة الاستمارة · تأكيد الكاش"
      />
      <PageHero
        eyebrow="BOOKINGS"
        title="الحجز والدفع في السنتر"
        subtitle="الطالب يسجّل أونلاين، والاستقبال يؤكّد الدفع كاش ويصدر الإيصال"
        metrics={[
          { label: 'استمارات', value: forms.length, highlight: true },
          { label: 'بانتظار الدفع', value: pendingCount },
          { label: 'مدفوع', value: paidCount },
          {
            label: 'مدرسين',
            value: formDetail?.offerings?.length ?? 0,
          },
        ]}
        actions={
          formDetail ? (
            <>
              <Link
                href={`/booking/${formDetail.slug}`}
                target="_blank"
                className="btn-accent"
              >
                فتح رابط الطالب
              </Link>
              <Link
                href={`/bookings/${formDetail.id}/print`}
                target="_blank"
                className="btn-ghost"
              >
                طباعة QR
              </Link>
            </>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <SectionCard title="الاستمارات" subtitle="اختر استمارة لإدارتها">
          <ul className="space-y-2 mb-4 max-h-72 overflow-auto">
            {forms.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelectedFormId(f.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-right transition ${
                    selectedFormId === f.id
                      ? 'bg-[#0B2545] text-white'
                      : 'bg-sand hover:bg-mist/80 text-navy'
                  }`}
                >
                  <span className="block font-semibold text-sm">{f.title}</span>
                  <span
                    className={`text-[11px] ${
                      selectedFormId === f.id ? 'text-white/60' : 'text-navy/45'
                    }`}
                  >
                    {f.slug} · {f.isPublished ? 'منشورة' : 'مسودة'} ·{' '}
                    {f._count?.submissions ?? 0} حجز
                  </span>
                </button>
              </li>
            ))}
            {!forms.length ? <EmptyState>لا توجد استمارات بعد</EmptyState> : null}
          </ul>

          <form onSubmit={createBookingForm} className="space-y-2 border-t border-mist pt-4">
            <p className="text-xs font-bold text-navy/55 mb-1">إنشاء استمارة</p>
            <FieldLabel label="الصف الدراسي">
              <select
                className="field"
                value={createForm.gradeLabel}
                onChange={(e) => applyGradePreset(e.target.value)}
              >
                {gradePresets.map((g) => (
                  <option key={g.gradeLabel} value={g.gradeLabel}>
                    {g.gradeLabel}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="العنوان">
              <input
                className="field"
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm({ ...createForm, title: e.target.value })
                }
                required
              />
            </FieldLabel>
            <FieldLabel label="Slug (رابط)">
              <input
                className="field font-mono text-xs"
                value={createForm.slug}
                onChange={(e) =>
                  setCreateForm({ ...createForm, slug: e.target.value })
                }
                required
              />
            </FieldLabel>
            <FieldLabel label="سعر الاستمارة">
              <input
                className="field"
                type="number"
                min={0}
                value={createForm.defaultFee}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    defaultFee: Number(e.target.value),
                  })
                }
              />
            </FieldLabel>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy === 'create'}
            >
              {busy === 'create' ? 'جاري الإنشاء…' : 'إنشاء استمارة'}
            </button>
          </form>
        </SectionCard>

        <div className="space-y-4">
          {formDetail ? (
            <SectionCard
              title={formDetail.title}
              subtitle={`${formDetail.gradeLabel} · ${formDetail.academicYear}`}
              badge={
                <span
                  className={
                    formDetail.isPublished ? 'badge-ok' : 'badge-warn'
                  }
                >
                  {formDetail.isPublished ? 'منشورة' : 'مسودة'}
                </span>
              }
              action={
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={togglePublish}
                  disabled={busy === 'publish'}
                >
                  {formDetail.isPublished ? 'إلغاء النشر' : 'نشر الاستمارة'}
                </button>
              }
            >
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <FieldLabel label="سعر الاستمارة">
                  <input
                    className="field w-40"
                    type="number"
                    min={0}
                    defaultValue={Number(formDetail.defaultFee)}
                    key={`fee-${formDetail.id}-${formDetail.defaultFee}`}
                    id="default-fee"
                  />
                </FieldLabel>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === 'fee'}
                  onClick={() => {
                    const el = document.getElementById(
                      'default-fee',
                    ) as HTMLInputElement | null;
                    saveDefaultFee(Number(el?.value || 0));
                  }}
                >
                  حفظ السعر
                </button>
              </div>

              {share ? (
                <div className="mb-5 rounded-2xl border border-mist bg-sand/60 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={share.qrDataUrl}
                      alt="QR الاستمارة"
                      className="h-36 w-36 rounded-xl border border-mist bg-white shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-navy/45 mb-1">
                          رابط الاستمارة الكامل
                        </p>
                        <p className="text-sm font-mono break-all text-navy bg-white rounded-xl border border-mist px-3 py-2">
                          {share.url}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={copyFullLink}
                        >
                          {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
                        </button>
                        <a
                          href={share.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost"
                        >
                          فتح
                        </a>
                        <Link
                          href={`/bookings/${formDetail.id}/print`}
                          target="_blank"
                          className="btn-accent"
                        >
                          طباعة باللوجو
                        </Link>
                      </div>
                      <p className="text-[11px] text-navy/45">
                        الملصق للطباعة يشمل لوجو Success واسم الاستمارة وQR
                        والرابط
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="overflow-auto max-h-72 mb-4">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المدرس</th>
                      <th>المادة</th>
                      <th>النوع</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formDetail.offerings || []).map((o) => (
                      <tr key={o.id}>
                        <td className="font-semibold">{o.teacherName}</td>
                        <td>{o.subjectName}</td>
                        <td>{o.isOnline ? 'Online' : 'حضور'}</td>
                        <td>
                          <button
                            type="button"
                            className="text-xs text-red-600 font-semibold"
                            disabled={busy === `del-${o.id}`}
                            onClick={() => removeOffering(o.id)}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!formDetail.offerings?.length ? (
                  <EmptyState>لا يوجد مدرسون في الاستمارة</EmptyState>
                ) : null}
              </div>

              <form
                onSubmit={addOffering}
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 border-t border-mist pt-4"
              >
                <FieldLabel label="المدرس">
                  <input
                    className="field"
                    required
                    value={offeringForm.teacherName}
                    onChange={(e) =>
                      setOfferingForm({
                        ...offeringForm,
                        teacherName: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="المادة">
                  <input
                    className="field"
                    required
                    value={offeringForm.subjectName}
                    onChange={(e) =>
                      setOfferingForm({
                        ...offeringForm,
                        subjectName: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <label className="flex items-center gap-2 text-sm text-navy/70 pt-6">
                  <input
                    type="checkbox"
                    checked={offeringForm.isOnline}
                    onChange={(e) =>
                      setOfferingForm({
                        ...offeringForm,
                        isOnline: e.target.checked,
                      })
                    }
                  />
                  Online
                </label>
                <div className="pt-6">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={busy === 'offering'}
                  >
                    إضافة مدرس
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : (
            <SectionCard title="تفاصيل الاستمارة">
              <EmptyState>أنشئ استمارة أو اختر واحدة من القائمة</EmptyState>
            </SectionCard>
          )}

          <SectionCard
            title="طلبات الحجز"
            subtitle="تأكيد الدفع الكاش يُنشئ الطالب والفاتورة والإيصال"
            action={
              <select
                className="field w-auto"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">كل الحالات</option>
                <option value="SUBMITTED">بانتظار الدفع</option>
                <option value="PAID">تم الدفع</option>
                <option value="CANCELLED">ملغي</option>
              </select>
            }
          >
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الهواتف</th>
                    <th>الاختيارات</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <p className="font-semibold">{s.studentName}</p>
                        <p className="text-[11px] text-navy/40 font-mono">
                          {new Date(s.createdAt).toLocaleString('ar-EG')}
                        </p>
                      </td>
                      <td className="text-xs">
                        <div>{s.studentPhone}</div>
                        <div className="text-navy/45">{s.parentPhone}</div>
                      </td>
                      <td className="text-xs max-w-[280px]">
                        {s.selections?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {s.selections.map((x, i) => (
                              <span
                                key={`${x.offering.teacherName}-${x.offering.subjectName}-${i}`}
                                className="badge-navy"
                                title={x.offering.subjectName}
                              >
                                {x.offering.teacherName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-navy/35">—</span>
                        )}
                      </td>
                      <td className="tabular-nums font-semibold">
                        {Number(s.totalAmount).toLocaleString('en-EG')}
                      </td>
                      <td>
                        <span
                          className={
                            s.status === 'PAID'
                              ? 'badge-ok'
                              : s.status === 'CANCELLED'
                                ? 'badge-warn'
                                : 'badge-navy'
                          }
                        >
                          {statusLabel[s.status] || s.status}
                        </span>
                        {s.receiptNumber ? (
                          <p className="text-[11px] font-mono mt-1 text-navy/50">
                            {s.receiptNumber}
                          </p>
                        ) : null}
                      </td>
                      <td className="space-y-1">
                        {s.status === 'SUBMITTED' ? (
                          <>
                            <button
                              type="button"
                              className="btn-accent text-xs px-2 py-1 w-full"
                              disabled={busy === `paid-${s.id}`}
                              onClick={() => markPaid(s.id)}
                            >
                              تم الدفع كاش
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-xs px-2 py-1 w-full"
                              disabled={busy === `cancel-${s.id}`}
                              onClick={() => cancelSubmission(s.id)}
                            >
                              إلغاء
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!submissions.length ? (
                <EmptyState>لا توجد طلبات لهذه الاستمارة</EmptyState>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
