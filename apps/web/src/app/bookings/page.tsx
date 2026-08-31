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
import { AppDialog, type DialogTone } from '@/components/AppDialog';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, getStoredUser, openFileInTab } from '@/lib/api';

type DialogState = {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
} | null;

type Offering = {
  id: string;
  teacherName: string;
  subjectName: string;
  isOnline: boolean;
  isWaitingList?: boolean;
  teacherId?: string | null;
  subjectId?: string | null;
  feeAmount: string | number;
  pageNumber: number;
  sortOrder: number;
  isActive: boolean;
  pickCount?: number;
  paidCount?: number;
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
  onlinePayEnabled?: boolean;
  vodafoneWallet?: string | null;
  instapayHandle?: string | null;
  whatsappGroupLink?: string | null;
  _count?: { offerings: number; submissions: number };
  statusCounts?: {
    PAID: number;
    SUBMITTED: number;
    CANCELLED: number;
  };
  offerings?: Offering[];
};

type Submission = {
  id: string;
  formSerial?: number | null;
  studentName: string;
  studentPhone: string;
  parentPhone: string;
  notes?: string | null;
  status: 'SUBMITTED' | 'PAID' | 'CANCELLED';
  totalAmount: string | number;
  receiptNumber?: string | null;
  paidAt?: string | null;
  paymentMethod?: 'CASH' | 'VODAFONE_CASH' | string | null;
  vodafoneTxn?: string | null;
  payChannel?: 'center' | 'online' | string | null;
  hasTransferProof?: boolean;
  createdAt: string;
  form: { id: string; title: string; slug: string };
  formId?: string;
  selections: {
    feeAmount: string | number;
    offeringId?: string;
    offering: {
      id?: string;
      teacherName: string;
      subjectName: string;
      isOnline: boolean;
    };
  }[];
};

type PayMethod = 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY';

const payMethodLabel: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'InstaPay',
};

type SharePack = {
  url: string;
  qrDataUrl: string;
  title: string;
  slug: string;
  onlinePayEnabled?: boolean;
  onlineUrl?: string | null;
  onlineQrDataUrl?: string | null;
};

const statusLabel: Record<string, string> = {
  SUBMITTED: 'بانتظار الدفع',
  PAID: 'تم الدفع',
  CANCELLED: 'ملغي',
};

function isOnlineSubmission(s: {
  payChannel?: string | null;
  paymentMethod?: string | null;
  vodafoneTxn?: string | null;
}) {
  if (s.payChannel === 'online') return true;
  if (s.payChannel === 'center') return false;
  return (
    (s.paymentMethod === 'VODAFONE_CASH' || s.paymentMethod === 'INSTAPAY') &&
    !!s.vodafoneTxn
  );
}

export default function BookingsAdminPage() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [formDetail, setFormDetail] = useState<FormRow | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [payDialog, setPayDialog] = useState<{
    id: string;
    studentName: string;
    method: PayMethod;
    vodafoneTxn: string;
  } | null>(null);
  const [teachers, setTeachers] = useState<
    {
      id: string;
      firstName: string;
      lastName: string;
      subjects?: { subject?: { id: string; nameAr: string; nameEn: string } }[];
    }[]
  >([]);
  const [subjects, setSubjects] = useState<
    { id: string; nameAr: string; nameEn: string }[]
  >([]);
  const [offeringForm, setOfferingForm] = useState({
    teacherId: '',
    subjectId: '',
    subjectName: '',
    isOnline: false,
    isWaitingList: false,
  });
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(
    null,
  );
  const [editForm, setEditForm] = useState({
    studentName: '',
    studentPhone: '',
    parentPhone: '',
    totalAmount: 0,
    notes: '',
    offeringIds: [] as string[],
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
      gradeLabel: 'الثاني الثانوي - بكالوريا',
      slug: 'g2-2026-2027',
      title: 'استمارة حجز الصف الثاني الثانوي - بكالوريا',
    },
    {
      gradeLabel: 'الأول الثانوي - بكالوريا',
      slug: 'g1-2026-2027',
      title: 'استمارة حجز الصف الأول الثانوي - بكالوريا',
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
  const [copiedOnline, setCopiedOnline] = useState(false);
  const [onlineDraft, setOnlineDraft] = useState({
    enabled: false,
    vodafoneWallet: '',
    instapayHandle: '',
  });
  const [whatsappGroupDraft, setWhatsappGroupDraft] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageOnlinePay, setCanManageOnlinePay] = useState(false);

  function notify(
    message: string,
    tone: DialogTone = 'error',
    title?: string,
  ) {
    setDialog({
      message,
      tone,
      title,
      confirmLabel: 'حسناً',
    });
  }

  function askConfirm(
    message: string,
    onConfirm: () => void,
    title = 'تأكيد',
  ) {
    setDialog({
      message,
      title,
      tone: 'danger',
      confirmLabel: 'تأكيد',
      cancelLabel: 'رجوع',
      onConfirm,
    });
  }

  function teacherLabel(t: { firstName: string; lastName: string }) {
    return `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim();
  }

  async function loadForms() {
    const list = await api<FormRow[]>('/booking/forms');
    setForms(list);
    if (!selectedFormId && list[0]) setSelectedFormId(list[0].id);
  }

  async function loadTeacherCatalog() {
    const [t, s] = await Promise.all([
      api<typeof teachers>('/teachers'),
      api<typeof subjects>('/catalog/subjects'),
    ]);
    setTeachers(t);
    setSubjects(s);
  }

  async function loadSubmissions(
    formId?: string,
    status?: string,
    phone?: string,
  ) {
    const q = new URLSearchParams();
    if (formId) q.set('formId', formId);
    if (status) q.set('status', status);
    if (phone?.trim()) q.set('phone', phone.trim());
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
    setCopiedOnline(false);
    setOnlineDraft({
      enabled: !!detail.onlinePayEnabled,
      vodafoneWallet: detail.vodafoneWallet || '',
      instapayHandle: detail.instapayHandle || '',
    });
    setWhatsappGroupDraft(detail.whatsappGroupLink || '');
  }

  async function copyFullLink() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('تعذر نسخ الرابط');
    }
  }

  async function copyOnlineLink() {
    if (!share?.onlineUrl) return;
    try {
      await navigator.clipboard.writeText(share.onlineUrl);
      setCopiedOnline(true);
      setTimeout(() => setCopiedOnline(false), 2000);
    } catch {
      notify('تعذر نسخ الرابط');
    }
  }

  async function saveWhatsappGroup() {
    if (!formDetail) return;
    setBusy('whatsapp-group');
    try {
      await api(`/booking/forms/${formDetail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          whatsappGroupLink: whatsappGroupDraft.trim() || null,
        }),
      });
      await refresh();
      notify('تم حفظ لينك جروب الصف', 'success', 'تم الحفظ');
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveOnlinePay() {
    if (!formDetail || !canManageOnlinePay) return;
    if (
      onlineDraft.enabled &&
      !onlineDraft.vodafoneWallet.trim() &&
      !onlineDraft.instapayHandle.trim()
    ) {
      notify('اكتب رقم فودافون كاش أو حساب InstaPay قبل تفعيل الأونلاين');
      return;
    }
    setBusy('online');
    try {
      await api(`/booking/forms/${formDetail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          onlinePayEnabled: onlineDraft.enabled,
          vodafoneWallet: onlineDraft.vodafoneWallet.trim() || null,
          instapayHandle: onlineDraft.instapayHandle.trim() || null,
        }),
      });
      await refresh();
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function refresh() {
    await loadForms();
    await loadSubmissions(
      selectedFormId || undefined,
      statusFilter || undefined,
      phoneQuery || undefined,
    );
    if (selectedFormId) await loadDetail(selectedFormId);
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('accessToken')) {
      window.location.href = '/login';
      return;
    }
    const role = getStoredUser()?.role;
    setIsAdmin(role === 'SUPER_ADMIN');
    setCanManageOnlinePay(
      role === 'SUPER_ADMIN' || role === 'CENTER_MANAGER',
    );
    const fid = new URLSearchParams(window.location.search).get('formId');
    if (fid) setSelectedFormId(fid);
    Promise.all([loadForms(), loadTeacherCatalog()]).catch((e) =>
      notify(e.message),
    );
  }, []);

  useEffect(() => {
    if (!selectedFormId) return;
    Promise.all([
      loadDetail(selectedFormId),
      loadSubmissions(
        selectedFormId,
        statusFilter || undefined,
        phoneQuery || undefined,
      ),
    ]).catch((e) => notify(e.message));
  }, [selectedFormId, statusFilter, phoneQuery]);

  useEffect(() => {
    setTeacherSearch('');
  }, [selectedFormId]);

  const selectedFormMeta = useMemo(
    () => forms.find((f) => f.id === selectedFormId) || null,
    [forms, selectedFormId],
  );
  const pendingCount = useMemo(() => {
    if (selectedFormMeta?.statusCounts) {
      return selectedFormMeta.statusCounts.SUBMITTED || 0;
    }
    return forms.reduce(
      (n, f) => n + (f.statusCounts?.SUBMITTED || 0),
      0,
    );
  }, [forms, selectedFormMeta]);
  const paidCount = useMemo(() => {
    if (selectedFormMeta?.statusCounts) {
      return selectedFormMeta.statusCounts.PAID || 0;
    }
    return forms.reduce((n, f) => n + (f.statusCounts?.PAID || 0), 0);
  }, [forms, selectedFormMeta]);
  const totalBookingsCount = useMemo(() => {
    if (selectedFormMeta?._count?.submissions != null) {
      return selectedFormMeta._count.submissions;
    }
    return forms.reduce((n, f) => n + (f._count?.submissions || 0), 0);
  }, [forms, selectedFormMeta]);

  const rankedOfferings = useMemo(() => {
    const list = [...(formDetail?.offerings || [])];
    const fromSubs = new Map<string, { pick: number; paid: number }>();
    for (const s of submissions) {
      if (s.status === 'CANCELLED') continue;
      if (formDetail && s.formId && s.formId !== formDetail.id) continue;
      for (const x of s.selections || []) {
        const id = x.offeringId || x.offering?.id;
        if (!id) continue;
        const cur = fromSubs.get(id) || { pick: 0, paid: 0 };
        cur.pick += 1;
        if (s.status === 'PAID') cur.paid += 1;
        fromSubs.set(id, cur);
      }
    }
    return list
      .map((o) => ({
        ...o,
        pickCount: o.pickCount ?? fromSubs.get(o.id)?.pick ?? 0,
        paidCount: o.paidCount ?? fromSubs.get(o.id)?.paid ?? 0,
      }))
      .sort(
        (a, b) =>
          (b.pickCount || 0) - (a.pickCount || 0) ||
          a.teacherName.localeCompare(b.teacherName, 'ar'),
      );
  }, [formDetail, submissions]);

  const filteredOfferings = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return rankedOfferings;
    return rankedOfferings.filter(
      (o) =>
        o.teacherName.toLowerCase().includes(q) ||
        o.subjectName.toLowerCase().includes(q),
    );
  }, [rankedOfferings, teacherSearch]);

  const pagedOfferings = usePaged(filteredOfferings, teacherSearch);
  const pagedSubs = usePaged(
    submissions,
    `${selectedFormId}:${statusFilter}:${phoneQuery}`,
  );
  const pagedForms = usePaged(forms, forms.length);

  async function createBookingForm(e: FormEvent) {
    e.preventDefault();
    setBusy('create');
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
      notify(err.message || 'فشل إنشاء الاستمارة');
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
      notify(err.message);
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
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function toggleOfferingWaitingList(o: Offering) {
    if (!formDetail) return;
    setBusy(`wait-${o.id}`);
    try {
      await api(`/booking/forms/${formDetail.id}/offerings`, {
        method: 'POST',
        body: JSON.stringify({
          id: o.id,
          ...(o.teacherId ? { teacherId: o.teacherId } : {}),
          subjectId: o.subjectId || undefined,
          subjectName: o.subjectName,
          isOnline: o.isOnline,
          isWaitingList: !o.isWaitingList,
        }),
      });
      await loadDetail(formDetail.id);
    } catch (err: any) {
      notify(err.message || 'فشل التحديث');
    } finally {
      setBusy('');
    }
  }

  async function addOffering(e: FormEvent) {
    e.preventDefault();
    if (!formDetail) return;
    setBusy('offering');
    try {
      if (!offeringForm.teacherId) {
        notify('اختَر مدرسًا من قائمة المدرسين');
        return;
      }
      const subjectName =
        offeringForm.subjectName.trim() ||
        subjects.find((s) => s.id === offeringForm.subjectId)?.nameAr ||
        '';
      if (!subjectName) {
        notify('اختَر أو اكتب اسم المادة');
        return;
      }

      await api(`/booking/forms/${formDetail.id}/offerings`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: offeringForm.teacherId,
          subjectId: offeringForm.subjectId || undefined,
          subjectName,
          isOnline: offeringForm.isOnline,
          isWaitingList: offeringForm.isWaitingList,
        }),
      });
      setOfferingForm({
        teacherId: '',
        subjectId: '',
        subjectName: '',
        isOnline: false,
        isWaitingList: false,
      });
      await Promise.all([
        loadDetail(formDetail.id),
        loadForms(),
        loadTeacherCatalog(),
      ]);
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function removeOffering(id: string) {
    askConfirm('حذف هذا المدرس من الاستمارة؟', () => {
      void (async () => {
        setBusy(`del-${id}`);
        try {
          await api(`/booking/offerings/${id}`, { method: 'DELETE' });
          if (formDetail) await loadDetail(formDetail.id);
          await loadForms();
          notify('تم حذف المدرس من الاستمارة', 'success');
        } catch (err: any) {
          notify(err.message);
        } finally {
          setBusy('');
        }
      })();
    });
  }

  function openPayDialog(id: string, studentName: string, method: PayMethod) {
    if (method === 'CASH') {
      askConfirm(
        `تأكيد استلام دفع كاش من «${studentName}»؟`,
        () => {
          void markPaid(id, 'CASH');
        },
        'دفع كاش',
      );
      return;
    }
    setPayDialog({ id, studentName, method, vodafoneTxn: '' });
  }

  async function markPaid(
    id: string,
    method: PayMethod,
    vodafoneTxn?: string,
  ) {
    setBusy(`paid-${id}`);
    try {
      const res = await api<{
        receiptNumber?: string;
        paymentMethod?: string;
        portalAccount?: {
          phone: string;
          mustSetPassword: boolean;
          created: boolean;
        } | null;
      }>(`/booking/submissions/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({
          method,
          vodafoneTxn: vodafoneTxn || undefined,
        }),
      });
      const methodAr = payMethodLabel[method] || method;
      if (res.portalAccount?.created) {
        notify(
          `تم الدفع (${methodAr}) وإنشاء حساب الطالب.\nالدخول برقم: ${res.portalAccount.phone}\nأول مرة يطلب الرقم السري ويعيّنه بنفسه.`,
          'success',
          'تم الدفع',
        );
      } else if (res.portalAccount) {
        notify(
          `تم الدفع (${methodAr}). حساب الموبايل ${res.portalAccount.phone} موجود بالفعل.`,
          'success',
          'تم الدفع',
        );
      } else {
        notify(`تم تأكيد الدفع · ${methodAr}`, 'success', 'تم الدفع');
      }
      await loadSubmissions(
        selectedFormId || undefined,
        statusFilter || undefined,
        phoneQuery || undefined,
      );
      await loadForms();
    } catch (err: any) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  function deleteSubmission(id: string, studentName?: string) {
    if (!isAdmin) {
      notify('مسح طلب الحجز متاح لمدير النظام فقط');
      return;
    }
    askConfirm(
      `مسح استمارة «${studentName || 'الطالب'}» من طلبات الحجز نهائيًا؟\n\nلو الحجز مدفوع، هيتشال كمان الإيصال والفاتورة والطالب المرتبط لو مفيش حجوزات تانية.`,
      () => {
        void (async () => {
          setBusy(`del-sub-${id}`);
          try {
            const res = await api<{ ok: boolean; deletedStudent?: boolean }>(
              `/booking/submissions/${id}`,
              { method: 'DELETE' },
            );
            if (editingSubmission?.id === id) setEditingSubmission(null);
            await Promise.all([
              loadSubmissions(
                selectedFormId || undefined,
                statusFilter || undefined,
                phoneQuery || undefined,
              ),
              loadForms(),
            ]);
            notify(
              res.deletedStudent
                ? 'تم مسح الحجز والطالب وكل ما يرتبط بهما'
                : 'تم مسح طلب الحجز',
              'success',
              'تم المسح',
            );
          } catch (err: any) {
            notify(err.message);
          } finally {
            setBusy('');
          }
        })();
      },
      'مسح نهائي',
    );
  }

  function cancelBooking(s: Submission) {
    if (s.status === 'PAID') {
      notify('لا يمكن إلغاء حجز مدفوع');
      return;
    }
    if (s.status === 'CANCELLED') return;
    askConfirm(
      `إلغاء استمارة «${s.studentName}»؟\nمش هتتمسح، هتتحول لملغي.`,
      () => {
        void (async () => {
          setBusy(`cancel-${s.id}`);
          try {
            await api(`/booking/submissions/${s.id}/cancel`, {
              method: 'POST',
            });
            if (editingSubmission?.id === s.id) setEditingSubmission(null);
            await Promise.all([
              loadSubmissions(
                selectedFormId || undefined,
                statusFilter || undefined,
                phoneQuery || undefined,
              ),
              loadForms(),
            ]);
            notify('تم إلغاء الحجز', 'success', 'تم الإلغاء');
          } catch (err: any) {
            notify(err.message);
          } finally {
            setBusy('');
          }
        })();
      },
      'إلغاء الحجز',
    );
  }

  function startEditSubmission(s: Submission) {
    setEditingSubmission(s);
    setEditForm({
      studentName: s.studentName || '',
      studentPhone: s.studentPhone || '',
      parentPhone: s.parentPhone || '',
      totalAmount: Number(s.totalAmount || 0),
      notes: s.notes || '',
      offeringIds: (s.selections || [])
        .map((x) => x.offeringId || x.offering?.id)
        .filter((id): id is string => !!id),
    });
  }

  function cancelEditSubmission() {
    setEditingSubmission(null);
  }

  async function saveSubmissionEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingSubmission) return;
    setBusy('edit-sub');
    try {
      await api(`/booking/submissions/${editingSubmission.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          studentName: editForm.studentName,
          studentPhone: editForm.studentPhone,
          parentPhone: editForm.parentPhone,
          totalAmount: editForm.totalAmount,
          notes: editForm.notes || null,
          offeringIds: editForm.offeringIds,
        }),
      });
      setEditingSubmission(null);
      await loadSubmissions(
        selectedFormId || undefined,
        statusFilter || undefined,
        phoneQuery || undefined,
      );
    } catch (err: any) {
      notify(err.message || 'فشل تعديل الحجز');
    } finally {
      setBusy('');
    }
  }

  function runPhoneSearch(e?: FormEvent) {
    e?.preventDefault();
    setPhoneQuery(phoneSearch.trim());
  }

  function toggleEditOffering(id: string) {
    setEditForm((prev) => {
      const has = prev.offeringIds.includes(id);
      return {
        ...prev,
        offeringIds: has
          ? prev.offeringIds.filter((x) => x !== id)
          : [...prev.offeringIds, id],
      };
    });
  }

  return (
    <AppShell>
      <PageHeader
        title="استمارات الحجز"
        subtitle="إدارة الاستمارة · تأكيد الكاش"
        action={
          <Link href="/bookings/ewallet" className="btn-accent">
            محفظة تحويل إلكتروني
          </Link>
        }
      />
      <PageHero
        eyebrow="BOOKINGS"
        title="الحجز والدفع في السنتر"
        subtitle="الطالب يسجّل من لينك السنتر أو لينك الأونلاين، والاستقبال يؤكد الدفع"
        metrics={[
          {
            label: selectedFormMeta ? 'إجمالي الحجوزات' : 'استمارات',
            value: selectedFormMeta ? totalBookingsCount : forms.length,
            highlight: true,
          },
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

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <SectionCard title="الاستمارات" subtitle="اختر استمارة لإدارتها">
          <ul className="space-y-2 mb-4">
            {pagedForms.slice.map((f) => (
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
          <TablePager
            page={pagedForms.page}
            pages={pagedForms.pages}
            total={pagedForms.total}
            size={pagedForms.size}
            from={pagedForms.from}
            to={pagedForms.to}
            onPage={pagedForms.setPage}
          />

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

              <div className="mb-5 rounded-2xl border border-mist bg-white p-4 space-y-3">
                {canManageOnlinePay ? (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[#0B2545]"
                      checked={onlineDraft.enabled}
                      onChange={(e) =>
                        setOnlineDraft({
                          ...onlineDraft,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="block font-bold text-navy">
                        استمارة أونلاين (فودافون كاش / InstaPay)
                      </span>
                      <span className="text-[12px] text-navy/55">
                        لينك وQR تاني لنفس المدرسين والسعر، والدفع تحويل فقط.
                        الاستقبال يؤكد الرقم المرجعي.
                      </span>
                    </span>
                  </label>
                ) : (
                  <div>
                    <p className="font-bold text-navy">
                      استمارة أونلاين (فودافون كاش / InstaPay)
                    </p>
                    <p className="text-[12px] text-navy/55">
                      {onlineDraft.enabled
                        ? 'مفعّلة — الاستقبال يشوف الأرقام ويأكد التحويل. التعديل للأدمن فقط.'
                        : 'غير مفعّلة. الأدمن هو اللي يفعّلها ويكتب أرقام التحويل.'}
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldLabel label="رقم فودافون كاش">
                    <input
                      className="field"
                      value={onlineDraft.vodafoneWallet}
                      readOnly={!canManageOnlinePay}
                      disabled={!canManageOnlinePay}
                      onChange={(e) =>
                        setOnlineDraft({
                          ...onlineDraft,
                          vodafoneWallet: e.target.value,
                        })
                      }
                      placeholder={
                        canManageOnlinePay ? '01xxxxxxxxx' : 'غير مسجّل'
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="InstaPay (رقم / IPA)">
                    <input
                      className="field"
                      value={onlineDraft.instapayHandle}
                      readOnly={!canManageOnlinePay}
                      disabled={!canManageOnlinePay}
                      onChange={(e) =>
                        setOnlineDraft({
                          ...onlineDraft,
                          instapayHandle: e.target.value,
                        })
                      }
                      placeholder={
                        canManageOnlinePay ? 'example@instapay' : 'غير مسجّل'
                      }
                    />
                  </FieldLabel>
                </div>
                {canManageOnlinePay ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy === 'online'}
                    onClick={() => void saveOnlinePay()}
                  >
                    حفظ إعداد الأونلاين
                  </button>
                ) : null}
                {share?.onlinePayEnabled && share.onlineUrl ? (
                  <div className="flex flex-wrap items-start gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    {share.onlineQrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={share.onlineQrDataUrl}
                        alt="QR الأونلاين"
                        className="h-32 w-32 rounded-xl border border-mist bg-white shrink-0"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs font-bold text-amber-900">
                        رابط الدفع أونلاين
                      </p>
                      <p className="text-sm font-mono break-all text-navy bg-white rounded-xl border border-mist px-3 py-2">
                        {share.onlineUrl}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void copyOnlineLink()}
                        >
                          {copiedOnline ? 'تم النسخ ✓' : 'نسخ لينك الأونلاين'}
                        </button>
                        <a
                          href={share.onlineUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost"
                        >
                          فتح
                        </a>
                        <Link
                          href={`/bookings/${formDetail.id}/print?pay=online`}
                          target="_blank"
                          className="btn-accent"
                        >
                          طباعة QR أونلاين
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div>
                  <p className="font-bold text-navy">جروب واتساب للصف</p>
                  <p className="text-[12px] text-navy/55">
                    لينك واحد لكل استمارة — الطالب اللي يدفع في «
                    {formDetail.gradeLabel}» يستلم لينك جروب {formDetail.gradeLabel}{' '}
                    مع رسالة تأكيد الدفع.
                  </p>
                </div>
                <FieldLabel label={`لينك جروب ${formDetail.gradeLabel}`}>
                  <input
                    className="field"
                    value={whatsappGroupDraft}
                    onChange={(e) => setWhatsappGroupDraft(e.target.value)}
                    placeholder="https://chat.whatsapp.com/…"
                  />
                </FieldLabel>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === 'whatsapp-group'}
                  onClick={() => void saveWhatsappGroup()}
                >
                  حفظ لينك الجروب
                </button>
              </div>

              <div className="mb-3">
                <FieldLabel label="بحث باسم المدرس">
                  <input
                    className="field"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    placeholder="اكتب اسم المدرس أو المادة…"
                  />
                </FieldLabel>
              </div>
              <div className="table-scroll mb-4">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>المدرس</th>
                      <th>المادة</th>
                      <th>النوع</th>
                      <th>قائمة انتظار</th>
                      <th>اختاروه</th>
                      <th>مدفوع</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOfferings.slice.map((o) => (
                      <tr key={o.id}>
                        <td className="font-semibold">{o.teacherName}</td>
                        <td>{o.subjectName}</td>
                        <td>{o.isOnline ? 'Online' : 'حضور'}</td>
                        <td>
                          <button
                            type="button"
                            className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              o.isWaitingList
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-sand text-navy/45'
                            }`}
                            disabled={busy === `wait-${o.id}`}
                            onClick={() => void toggleOfferingWaitingList(o)}
                          >
                            {o.isWaitingList ? 'نعم' : 'لا'}
                          </button>
                        </td>
                        <td className="font-extrabold text-navy tabular-nums">
                          {o.pickCount ?? 0}
                        </td>
                        <td className="tabular-nums text-emerald-700 font-semibold">
                          {o.paidCount ?? 0}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Link
                              href={`/bookings/roster/${o.id}?print=1`}
                              target="_blank"
                              className="btn-accent text-xs px-2 py-1"
                            >
                              PDF
                            </Link>
                            <Link
                              href={`/bookings/roster/${o.id}?paidOnly=1&print=1`}
                              target="_blank"
                              className="btn-ghost text-xs px-2 py-1"
                            >
                              مدفوع
                            </Link>
                            <button
                              type="button"
                              className="text-xs text-red-600 font-semibold px-1"
                              disabled={busy === `del-${o.id}`}
                              onClick={() => removeOffering(o.id)}
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!formDetail.offerings?.length ? (
                  <EmptyState>لا يوجد مدرسون في الاستمارة</EmptyState>
                ) : !filteredOfferings.length ? (
                  <EmptyState>لا يوجد مدرس بهذا الاسم</EmptyState>
                ) : (
                  <p className="mt-2 text-[11px] text-navy/45">
                    «اختاروه» = كل الحجوزات غير الملغاة · «مدفوع» = اللي اتأكد
                    دفعهم. لينك جروب الصف يُضبط فوق (مرة واحدة لكل استمارة).
                    {teacherSearch.trim()
                      ? ` · ظاهر ${filteredOfferings.length} من ${rankedOfferings.length}`
                      : ''}
                  </p>
                )}
                <TablePager
                  page={pagedOfferings.page}
                  pages={pagedOfferings.pages}
                  total={pagedOfferings.total}
                  size={pagedOfferings.size}
                  from={pagedOfferings.from}
                  to={pagedOfferings.to}
                  onPage={pagedOfferings.setPage}
                />
              </div>

              <form
                onSubmit={addOffering}
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 border-t border-mist pt-4"
              >
                <div className="lg:col-span-2">
                  <FieldLabel label="المدرس">
                    <select
                      className="field"
                      required
                      value={offeringForm.teacherId}
                      onChange={(e) => {
                        const teacherId = e.target.value;
                        const t = teachers.find((x) => x.id === teacherId);
                        const firstSub = t?.subjects?.[0]?.subject;
                        setOfferingForm((f) => ({
                          ...f,
                          teacherId,
                          subjectId: firstSub?.id || f.subjectId,
                          subjectName: firstSub?.nameAr || f.subjectName,
                        }));
                      }}
                    >
                      <option value="">اختر من قائمة المدرسين…</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {teacherLabel(t)}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                </div>

                <div className="lg:col-span-2">
                  <FieldLabel label="المادة">
                    <select
                      className="field"
                      value={offeringForm.subjectId}
                      onChange={(e) => {
                        const subjectId = e.target.value;
                        const s = subjects.find((x) => x.id === subjectId);
                        setOfferingForm((f) => ({
                          ...f,
                          subjectId,
                          subjectName: s?.nameAr || '',
                        }));
                      }}
                    >
                      <option value="">من الكتالوج…</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nameAr}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                </div>
                <div className="lg:col-span-1">
                  <FieldLabel label="أو اكتب المادة">
                    <input
                      className="field"
                      placeholder="اختياري إن اخترت من فوق"
                      value={
                        offeringForm.subjectId ? '' : offeringForm.subjectName
                      }
                      disabled={!!offeringForm.subjectId}
                      onChange={(e) =>
                        setOfferingForm({
                          ...offeringForm,
                          subjectId: '',
                          subjectName: e.target.value,
                        })
                      }
                    />
                  </FieldLabel>
                </div>
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
                <label className="flex items-center gap-2 text-sm text-navy/70 pt-6">
                  <input
                    type="checkbox"
                    checked={offeringForm.isWaitingList}
                    onChange={(e) =>
                      setOfferingForm({
                        ...offeringForm,
                        isWaitingList: e.target.checked,
                      })
                    }
                  />
                  قائمة انتظار
                </label>
                <div className="pt-6 lg:col-span-6">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={busy === 'offering'}
                  >
                    إضافة مدرس للاستمارة
                  </button>
                  <p className="mt-2 text-xs text-navy/45">
                    لازم يكون المدرس متسجّل أولاً من صفحة المدرسين.
                  </p>
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
            subtitle="تأكيد الدفع يُنشئ الطالب والإيصال · كاش أو فودافون كاش"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <form
                onSubmit={runPhoneSearch}
                className="flex flex-1 items-stretch gap-1 min-w-0"
              >
                <input
                  className="field !mt-0 flex-1 min-w-0"
                  placeholder="بحث بالموبايل"
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value)}
                  inputMode="tel"
                />
                <button
                  type="submit"
                  className="btn-ghost text-xs px-3 shrink-0"
                >
                  بحث
                </button>
                {phoneQuery ? (
                  <button
                    type="button"
                    className="btn-ghost text-xs px-3 shrink-0"
                    onClick={() => {
                      setPhoneSearch('');
                      setPhoneQuery('');
                    }}
                  >
                    مسح
                  </button>
                ) : null}
              </form>
              <select
                className="field !mt-0 w-full sm:w-auto"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">كل الحالات</option>
                <option value="SUBMITTED">بانتظار الدفع</option>
                <option value="PAID">تم الدفع</option>
                <option value="CANCELLED">ملغي</option>
              </select>
            </div>
            {editingSubmission && editingSubmission.status !== 'CANCELLED' ? (
              <form
                onSubmit={saveSubmissionEdit}
                className="mb-4 rounded-xl border border-sky/30 bg-sky/5 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-navy text-sm">
                    تعديل حجز: {editingSubmission.studentName}
                  </p>
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={cancelEditSubmission}
                  >
                    إغلاق
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldLabel label="اسم الطالب">
                    <input
                      className="field"
                      value={editForm.studentName}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          studentName: e.target.value,
                        })
                      }
                      required
                    />
                  </FieldLabel>
                  <FieldLabel label="المبلغ">
                    <input
                      type="number"
                      min={0}
                      className="field"
                      value={editForm.totalAmount}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          totalAmount: Number(e.target.value),
                        })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="موبايل الطالب">
                    <input
                      className="field"
                      value={editForm.studentPhone}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          studentPhone: e.target.value,
                        })
                      }
                      required
                    />
                  </FieldLabel>
                  <FieldLabel label="موبايل ولي الأمر">
                    <input
                      className="field"
                      value={editForm.parentPhone}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          parentPhone: e.target.value,
                        })
                      }
                      required
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label="ملاحظات">
                  <input
                    className="field"
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, notes: e.target.value })
                    }
                  />
                </FieldLabel>
                <div>
                  <p className="text-sm font-medium text-navy/80 mb-2">
                    المدرسين المختارين
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-auto">
                    {(formDetail?.offerings || [])
                      .filter((o) => o.isActive !== false)
                      .map((o) => (
                        <label
                          key={o.id}
                          className="flex items-center gap-2 rounded-lg bg-white border border-mist px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={editForm.offeringIds.includes(o.id)}
                            onChange={() => toggleEditOffering(o.id)}
                          />
                          <span>
                            <span className="font-semibold text-navy">
                              {o.teacherName}
                            </span>
                            <span className="text-navy/45 text-xs ms-1">
                              ({o.subjectName})
                            </span>
                          </span>
                        </label>
                      ))}
                    {!formDetail?.offerings?.length ? (
                      <p className="text-xs text-navy/45">
                        لا يوجد مدرسون في الاستمارة
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy === 'edit-sub'}
                >
                  {busy === 'edit-sub' ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                </button>
              </form>
            ) : null}

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {pagedSubs.slice.map((s) => (
                <article
                  key={s.id}
                  className={`rounded-xl border bg-white p-3 space-y-2 ${
                    isOnlineSubmission(s)
                      ? 'border-amber-300'
                      : 'border-mist'
                  } ${
                    editingSubmission?.id === s.id ? 'ring-2 ring-sky/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-navy">
                        {s.formSerial != null ? (
                          <span className="me-1.5 inline-block rounded-md bg-navy/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-navy">
                            م {s.formSerial}
                          </span>
                        ) : null}
                        {s.studentName}
                      </p>
                      <p className="text-[11px] text-navy/40">
                        {new Date(s.createdAt).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-end">
                      {isOnlineSubmission(s) ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          استمارة أونلاين
                        </span>
                      ) : null}
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
                    </div>
                  </div>
                  <div className="text-xs text-navy/70 space-y-0.5">
                    <p>طالب: {s.studentPhone}</p>
                    <p>ولي أمر: {s.parentPhone}</p>
                    <p className="font-bold tabular-nums text-navy text-sm">
                      {Number(s.totalAmount).toLocaleString('en-EG')} ج.م
                    </p>
                    {s.status === 'SUBMITTED' &&
                    s.paymentMethod &&
                    s.paymentMethod !== 'CASH' &&
                    s.vodafoneTxn ? (
                      <p className="text-amber-800 font-semibold">
                        تحويل{' '}
                        {payMethodLabel[s.paymentMethod] || s.paymentMethod} ·{' '}
                        {s.vodafoneTxn}
                        {s.hasTransferProof ? (
                          <>
                            {' '}
                            ·{' '}
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                void openFileInTab(
                                  `/booking/submissions/${s.id}/proof`,
                                ).catch((err) => notify(err.message))
                              }
                            >
                              صورة التحويل
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {s.status === 'PAID' && s.paymentMethod ? (
                      <p>
                        {payMethodLabel[s.paymentMethod] || s.paymentMethod}
                        {s.vodafoneTxn ? ` · ${s.vodafoneTxn}` : ''}
                        {s.hasTransferProof ? (
                          <>
                            {' '}
                            ·{' '}
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                void openFileInTab(
                                  `/booking/submissions/${s.id}/proof`,
                                ).catch((err) => notify(err.message))
                              }
                            >
                              صورة التحويل
                            </button>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {s.receiptNumber ? (
                      <p className="font-mono text-navy/45">{s.receiptNumber}</p>
                    ) : null}
                  </div>
                  {s.selections?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {s.selections.map((x, i) => (
                        <span
                          key={`${x.offering.teacherName}-${i}`}
                          className="badge-navy"
                        >
                          {x.offering.teacherName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {isOnlineSubmission(s) ? (
                      <>
                        {s.status === 'SUBMITTED' ? (
                          <button
                            type="button"
                            className="btn-accent text-xs px-2 py-2 col-span-2"
                            disabled={busy === `paid-${s.id}` || !s.vodafoneTxn}
                            onClick={() =>
                              askConfirm(
                                `تأكيد وصول تحويل ${
                                  payMethodLabel[s.paymentMethod || ''] ||
                                  s.paymentMethod
                                } برقم ${s.vodafoneTxn} من «${s.studentName}»؟`,
                                () => {
                                  void markPaid(
                                    s.id,
                                    s.paymentMethod as PayMethod,
                                    s.vodafoneTxn || undefined,
                                  );
                                },
                                'تأكيد التحويل',
                              )
                            }
                          >
                            تأكيد التحويل
                          </button>
                        ) : null}
                        {s.status !== 'CANCELLED' ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-2"
                            onClick={() => startEditSubmission(s)}
                          >
                            تعديل
                          </button>
                        ) : null}
                        {s.status === 'SUBMITTED' ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-2 text-red-700"
                            disabled={busy === `cancel-${s.id}`}
                            onClick={() => cancelBooking(s)}
                          >
                            إلغاء
                          </button>
                        ) : null}
                        {isAdmin ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-2 text-red-700 col-span-2"
                            disabled={busy === `del-sub-${s.id}`}
                            onClick={() =>
                              deleteSubmission(s.id, s.studentName)
                            }
                          >
                            مسح
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                    {s.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-2"
                        onClick={() => startEditSubmission(s)}
                      >
                        تعديل
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-2 text-red-700"
                        disabled={busy === `del-sub-${s.id}`}
                        onClick={() => deleteSubmission(s.id, s.studentName)}
                      >
                        مسح
                      </button>
                    ) : null}
                    {s.status === 'SUBMITTED' ? (
                      <>
                        <button
                          type="button"
                          className="btn-accent text-xs px-2 py-2"
                          disabled={busy === `paid-${s.id}`}
                          onClick={() =>
                            openPayDialog(s.id, s.studentName, 'CASH')
                          }
                        >
                          كاش
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-xs px-2 py-2"
                          disabled={busy === `paid-${s.id}`}
                          onClick={() =>
                            openPayDialog(
                              s.id,
                              s.studentName,
                              'VODAFONE_CASH',
                            )
                          }
                        >
                          فودافون كاش
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-2 col-span-2"
                          disabled={busy === `paid-${s.id}`}
                          onClick={() =>
                            openPayDialog(s.id, s.studentName, 'INSTAPAY')
                          }
                        >
                          InstaPay
                        </button>
                      </>
                    ) : null}
                      </>
                    )}
                  </div>
                </article>
              ))}
              {!submissions.length ? (
                <EmptyState>لا توجد طلبات لهذه الاستمارة</EmptyState>
              ) : null}
            </div>

            {/* Desktop table */}
            <div className="table-scroll hidden md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-14">م</th>
                    <th>الطالب</th>
                    <th>الهواتف</th>
                    <th>الاختيارات</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSubs.slice.map((s) => (
                    <tr
                      key={s.id}
                      className={
                        editingSubmission?.id === s.id ? 'bg-sky/5' : undefined
                      }
                    >
                      <td className="tabular-nums font-bold text-navy/70">
                        {s.formSerial ?? '—'}
                      </td>
                      <td>
                        <p className="font-semibold">{s.studentName}</p>
                        {isOnlineSubmission(s) ? (
                          <p className="mt-0.5">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              استمارة أونلاين
                            </span>
                          </p>
                        ) : null}
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
                        {s.status === 'SUBMITTED' &&
                        s.paymentMethod &&
                        s.paymentMethod !== 'CASH' &&
                        s.vodafoneTxn ? (
                          <p className="text-[11px] mt-1 font-semibold text-amber-800">
                            تحويل{' '}
                            {payMethodLabel[s.paymentMethod] || s.paymentMethod}{' '}
                            · {s.vodafoneTxn}
                            {s.hasTransferProof ? (
                              <>
                                {' '}
                                ·{' '}
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    void openFileInTab(
                                      `/booking/submissions/${s.id}/proof`,
                                    ).catch((err) => notify(err.message))
                                  }
                                >
                                  صورة
                                </button>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {s.status === 'PAID' && s.paymentMethod ? (
                          <p className="text-[11px] mt-1 text-navy/60">
                            {payMethodLabel[s.paymentMethod] || s.paymentMethod}
                            {s.vodafoneTxn ? ` · ${s.vodafoneTxn}` : ''}
                            {s.hasTransferProof ? (
                              <>
                                {' '}
                                ·{' '}
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() =>
                                    void openFileInTab(
                                      `/booking/submissions/${s.id}/proof`,
                                    ).catch((err) => notify(err.message))
                                  }
                                >
                                  صورة
                                </button>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </td>
                      <td className="space-y-1 min-w-[120px]">
                        {isOnlineSubmission(s) ? (
                          <>
                            {s.status === 'SUBMITTED' ? (
                              <button
                                type="button"
                                className="btn-accent text-xs px-2 py-1 w-full !min-h-0"
                                disabled={
                                  busy === `paid-${s.id}` || !s.vodafoneTxn
                                }
                                onClick={() =>
                                  askConfirm(
                                    `تأكيد وصول تحويل ${
                                      payMethodLabel[s.paymentMethod || ''] ||
                                      s.paymentMethod
                                    } برقم ${s.vodafoneTxn} من «${s.studentName}»؟`,
                                    () => {
                                      void markPaid(
                                        s.id,
                                        s.paymentMethod as PayMethod,
                                        s.vodafoneTxn || undefined,
                                      );
                                    },
                                    'تأكيد التحويل',
                                  )
                                }
                              >
                                تأكيد التحويل
                              </button>
                            ) : null}
                            {s.status !== 'CANCELLED' ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs px-2 py-1 w-full !min-h-0"
                                onClick={() => startEditSubmission(s)}
                              >
                                تعديل
                              </button>
                            ) : (
                              <span className="text-[11px] text-navy/40">
                                ملغي
                              </span>
                            )}
                            {s.status === 'SUBMITTED' ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                                disabled={busy === `cancel-${s.id}`}
                                onClick={() => cancelBooking(s)}
                              >
                                إلغاء
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                                disabled={busy === `del-sub-${s.id}`}
                                onClick={() =>
                                  deleteSubmission(s.id, s.studentName)
                                }
                              >
                                مسح
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                        {s.status !== 'CANCELLED' ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-1 w-full !min-h-0"
                            onClick={() => startEditSubmission(s)}
                          >
                            تعديل
                          </button>
                        ) : null}
                        {s.status === 'SUBMITTED' ? (
                          <>
                            <button
                              type="button"
                              className="btn-accent text-xs px-2 py-1 w-full !min-h-0"
                              disabled={busy === `paid-${s.id}`}
                              onClick={() =>
                                openPayDialog(s.id, s.studentName, 'CASH')
                              }
                            >
                              كاش
                            </button>
                            <button
                              type="button"
                              className="btn-primary text-xs px-2 py-1 w-full !min-h-0"
                              disabled={busy === `paid-${s.id}`}
                              onClick={() =>
                                openPayDialog(
                                  s.id,
                                  s.studentName,
                                  'VODAFONE_CASH',
                                )
                              }
                            >
                              فودافون كاش
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-xs px-2 py-1 w-full !min-h-0"
                              disabled={busy === `paid-${s.id}`}
                              onClick={() =>
                                openPayDialog(s.id, s.studentName, 'INSTAPAY')
                              }
                            >
                              InstaPay
                            </button>
                          </>
                        ) : null}
                        {isAdmin ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                            disabled={busy === `del-sub-${s.id}`}
                            onClick={() =>
                              deleteSubmission(s.id, s.studentName)
                            }
                          >
                            مسح
                          </button>
                        ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!submissions.length ? (
                <EmptyState>لا توجد طلبات لهذه الاستمارة</EmptyState>
              ) : null}
            </div>
            <TablePager
              page={pagedSubs.page}
              pages={pagedSubs.pages}
              total={pagedSubs.total}
              size={pagedSubs.size}
              from={pagedSubs.from}
              to={pagedSubs.to}
              onPage={pagedSubs.setPage}
            />
          </SectionCard>
        </div>
      </div>

      <AppDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message || ''}
        tone={dialog?.tone || 'info'}
        confirmLabel={dialog?.confirmLabel || 'حسناً'}
        cancelLabel={dialog?.cancelLabel}
        onConfirm={dialog?.onConfirm}
        onClose={() => setDialog(null)}
      />

      <AppDialog
        open={!!payDialog}
        title={
          payDialog?.method === 'INSTAPAY' ? 'InstaPay' : 'فودافون كاش'
        }
        message={
          payDialog
            ? `تأكيد دفع استمارة «${payDialog.studentName}» بـ ${
                payMethodLabel[payDialog.method]
              }`
            : ''
        }
        tone="info"
        confirmLabel="تأكيد الدفع"
        cancelLabel="رجوع"
        onConfirm={() => {
          const snapshot = payDialog;
          if (!snapshot) return;
          const txn = snapshot.vodafoneTxn.trim();
          if (!txn) {
            queueMicrotask(() => {
              setPayDialog(snapshot);
              notify('اكتب الرقم المرجعي للتحويل');
            });
            return;
          }
          void markPaid(snapshot.id, snapshot.method, txn);
        }}
        onClose={() => setPayDialog(null)}
      >
        {payDialog ? (
          <label className="mt-3 block text-sm font-medium text-navy/80">
            رقم العملية
            <input
              className="field"
              autoFocus
              inputMode="numeric"
              placeholder="مثال: 1234567890"
              value={payDialog.vodafoneTxn}
              onChange={(e) =>
                setPayDialog({ ...payDialog, vodafoneTxn: e.target.value })
              }
            />
          </label>
        ) : null}
      </AppDialog>
    </AppShell>
  );
}
