'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, getStoredUser } from '@/lib/api';
import { AppDialog } from '@/components/AppDialog';

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  hourlyRate?: string | number;
  subjects?: {
    subjectId?: string;
    subject?: { id: string; nameAr: string };
  }[];
};
type Subject = { id: string; nameAr: string };
type GradeLevel = { id: string; nameAr: string; nameEn?: string };
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
  teacherId: string;
  subjectId?: string | null;
  feeAmount: string | number;
  centerAmount?: string | number | null;
  teacherPercent: string | number;
  settledTeacherAmount?: string | number | null;
  settledCenterAmount?: string | number | null;
  teacherPaidAt?: string | null;
  sessionDate: string;
  teacher: Teacher;
  subject?: Subject | null;
  _count?: { entries: number };
  entries?: Entry[];
};

function centerCutOf(s: {
  feeAmount: string | number;
  centerAmount?: string | number | null;
  teacherPercent?: string | number;
}) {
  if (s.centerAmount != null && s.centerAmount !== '') {
    return Number(s.centerAmount);
  }
  const fee = Number(s.feeAmount) || 0;
  const pct = Number(s.teacherPercent) || 0;
  return Math.round(fee * (1 - pct / 100) * 100) / 100;
}

function teacherCutOf(s: {
  feeAmount: string | number;
  centerAmount?: string | number | null;
  teacherPercent?: string | number;
}) {
  return Math.max(0, Number(s.feeAmount || 0) - centerCutOf(s));
}

type Entry = {
  id: string;
  amount: string | number;
  listedFee?: string | number | null;
  discountReason?: string | null;
  method: 'CASH' | 'VODAFONE_CASH';
  payStatus: string;
  vodafoneTxn?: string | null;
  receiptNumber: string;
  checkedInAt?: string | null;
  refundedAmount?: string | number;
  student: Student;
};

type PayMode = 'full' | 'half' | 'free' | 'custom';

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

function subjectsOf(t?: Teacher | null): { id: string; nameAr: string }[] {
  const list = (t?.subjects || [])
    .map((s) => s.subject || (s.subjectId ? { id: s.subjectId, nameAr: '' } : null))
    .filter((s): s is { id: string; nameAr: string } => !!s?.id);
  const seen = new Set<string>();
  return list.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

const OPS_SCANNER_ID = 'ops-desk-qr';
const OTHER_TEACHER = '__other__';

function sessionListedFee(detail?: { feeAmount?: string | number } | null) {
  return Number(detail?.feeAmount || 0);
}

function resolvePayAmount(
  listedFee: number,
  payMode: PayMode,
  customAmount: string,
) {
  if (payMode === 'free') return 0;
  if (payMode === 'half') return Math.round((listedFee / 2) * 100) / 100;
  if (payMode === 'custom') {
    const n = Number(customAmount);
    return Number.isFinite(n) ? n : listedFee;
  }
  return listedFee;
}

function cairoYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function sessionDayKey(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatSessionDay(value?: string | null, compact = false) {
  const ymd = sessionDayKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    'ar-EG',
    compact
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        },
  );
}

export default function OpsPage() {
  const me = getStoredUser();
  const isManager =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionDate, setSessionDate] = useState(cairoYmd);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Session | null>(null);
  const editLocked = detail?.status === 'CLOSED' && !!detail?.teacherPaidAt;
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [settle, setSettle] = useState<Session | null>(null);
  const [ask, setAsk] = useState<null | 'close' | 'delete'>(null);
  const [entryToDelete, setEntryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [scanNotice, setScanNotice] = useState<{
    tone: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const [openForm, setOpenForm] = useState({
    teacherId: '',
    subjectId: '',
    title: '',
    feeAmount: 0,
    centerAmount: 0,
    notes: '',
    teacherName: '',
  });
  const [editForm, setEditForm] = useState({
    teacherId: '',
    subjectId: '',
    title: '',
    feeAmount: 0,
    centerAmount: 0,
    teacherName: '',
  });

  const [payForm, setPayForm] = useState({
    phone: '',
    studentName: '',
    parentPhone: '',
    gradeLevelId: '',
    method: 'CASH' as 'CASH' | 'VODAFONE_CASH',
    vodafoneTxn: '',
    payMode: 'full' as PayMode,
    customAmount: '',
    discountReason: '',
  });
  const [payMatch, setPayMatch] = useState<{
    status: 'idle' | 'loading' | 'found' | 'missing' | 'error';
    student: Student | null;
    message: string;
  }>({ status: 'idle', student: null, message: '' });
  const [scanned, setScanned] = useState<Student | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const scannerRef = useRef<any>(null);
  const lastScanAt = useRef(0);

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
    const qs = sessionDate ? `?date=${sessionDate}` : '';
    const [s, t, b, g] = await Promise.all([
      api<Session[]>(`/ops/sessions${qs}`),
      api<Teacher[]>('/teachers'),
      api<Block[]>('/ops/blocks'),
      api<GradeLevel[]>('/catalog/grade-levels'),
    ]);
    setSessions(s);
    setTeachers(t);
    setBlocks(b);
    setGrades(g);
    if (s.length && (!selectedId || !s.some((x) => x.id === selectedId))) {
      setSelectedId(s[0].id);
    }
    if (!s.length) setSelectedId('');
    setOpenForm((f) => {
      if (f.teacherId === OTHER_TEACHER) return f;
      const teacherId = f.teacherId || t[0]?.id || '';
      const teacher = t.find((x) => x.id === teacherId);
      const subs = subjectsOf(teacher);
      const subjectId =
        (f.subjectId && subs.some((x) => x.id === f.subjectId)
          ? f.subjectId
          : subs[0]?.id) || '';
      return { ...f, teacherId, subjectId };
    });
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
  }, [sessionDate]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId).catch((e) => setError(e.message));
    setScanned(null);
  }, [selectedId]);

  useEffect(() => {
    if (!detail) return;
    const teacherId = detail.teacherId || detail.teacher?.id || '';
    const teacher = teachers.find((t) => t.id === teacherId);
    const subs = subjectsOf(teacher);
    const subjectId =
      detail.subjectId ||
      detail.subject?.id ||
      subs[0]?.id ||
      '';
    setEditForm({
      teacherId,
      subjectId,
      title: detail.title || '',
      feeAmount: Number(detail.feeAmount || 0),
      centerAmount: centerCutOf(detail),
      teacherName: '',
    });
  }, [detail, teachers]);

  useEffect(() => {
    if (scanned) {
      setPayMatch({
        status: 'found',
        student: scanned,
        message: '',
      });
      return;
    }
    const phone = payForm.phone.trim();
    const name = payForm.studentName.trim();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 && name.length < 3) {
      setPayMatch({ status: 'idle', student: null, message: '' });
      return;
    }
    const t = window.setTimeout(() => {
      setPayMatch((prev) => ({ ...prev, status: 'loading' }));
      const qs = new URLSearchParams();
      if (digits.length >= 8) qs.set('phone', phone);
      if (name.length >= 3) qs.set('name', name);
      void api<Student>(`/ops/students/lookup?${qs.toString()}`)
        .then((student) => {
          setPayMatch({
            status: 'found',
            student,
            message: '',
          });
        })
        .catch((err: Error) => {
          const msg = err.message || '';
          if (msg.includes('أكتر من طالب')) {
            setPayMatch({
              status: 'error',
              student: null,
              message: msg,
            });
            return;
          }
          setPayMatch({
            status: 'missing',
            student: null,
            message:
              'مش موجود في سجل الطلاب — سجّله من صفحة الطلاب أو امسح الـ QR',
          });
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [payForm.phone, payForm.studentName, scanned]);

  const applyQr = useCallback(
    async (raw: string) => {
      const now = Date.now();
      if (now - lastScanAt.current < 1800) return;
      lastScanAt.current = now;
      setError('');
      if (!selectedId) {
        setScanNotice({
          tone: 'error',
          title: 'مفيش جلسة',
          message: 'اختَر الجلسة أولاً ثم امسح كارت الطالب',
        });
        return;
      }
      try {
        const student = await api<Student>(
          `/ops/students/lookup?qr=${encodeURIComponent(raw.trim())}`,
        );
        const name =
          `${student.firstName} ${student.lastName === '-' ? '' : student.lastName}`.trim();
        const teacherName = detail?.teacher
          ? `${detail.teacher.firstName} ${detail.teacher.lastName}`
          : 'الجلسة';
        const subjectName = detail?.subject?.nameAr || detail?.title || 'حصة';
        const already = (detail?.entries || []).find(
          (e) => e.student.id === student.id && e.payStatus !== 'REFUNDED',
        );
        if (already) {
          setScanOpen(false);
          setScanned(student);
          setScanNotice({
            tone: 'success',
            title: 'مسموح بالدخول',
            message: `${name}\nحضر ودفع · ${teacherName} · ${subjectName}`,
          });
          await loadDetail(selectedId);
          return;
        }

        if (payForm.method === 'VODAFONE_CASH') {
          setScanned(student);
          setPayForm((f) => ({ ...f, phone: student.phone || '' }));
          setScanOpen(false);
          setScanNotice({
            tone: 'info',
            title: 'تم المسح',
            message: `${name}\nأكّد رقم عملية فودافون ثم سجّل الدفع`,
          });
          return;
        }

        await api(`/ops/sessions/${selectedId}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            studentId: student.id,
            studentUid: student.studentUid,
            method: 'CASH',
          }),
        });
        setScanOpen(false);
        setScanned(null);
        await loadDetail(selectedId);
        await loadLists();
        setScanNotice({
          tone: 'success',
          title: 'تم الدفع والحضور',
          message: `${name}\nحضر · ${teacherName} · ${subjectName}`,
        });
      } catch (err: any) {
        setScanned(null);
        setScanOpen(false);
        setScanNotice({
          tone: 'error',
          title: 'مرفوض',
          message: err.message || 'QR غير معروف',
        });
      }
    },
    [detail?.entries, detail?.teacher, detail?.subject, detail?.title, selectedId, payForm.method],
  );

  useEffect(() => {
    if (!scanOpen) return;
    let stopped = false;
    const timer = window.setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const el = document.getElementById(OPS_SCANNER_ID);
        if (!el || stopped) return;
        const scanner = new Html5Qrcode(OPS_SCANNER_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 8,
            qrbox: (w: number, h: number) => {
              const side = Math.min(w, h, 240);
              return { width: side, height: side };
            },
          },
          (decoded: string) => {
            void applyQr(decoded);
          },
          () => undefined,
        );
      } catch {
        if (!stopped) {
          setError('تعذّر فتح الكاميرا — اسمح للموقع بالكاميرا أو استخدم Chrome');
        }
      }
    }, 80);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      scanner
        .stop()
        .catch(() => undefined)
        .finally(() => {
          scanner.clear().catch(() => undefined);
        });
    };
  }, [scanOpen, applyQr]);

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === openForm.teacherId) || null,
    [teachers, openForm.teacherId],
  );
  const teacherSubjects = useMemo(
    () => subjectsOf(selectedTeacher),
    [selectedTeacher],
  );
  const editTeacher = useMemo(
    () => teachers.find((t) => t.id === editForm.teacherId) || null,
    [teachers, editForm.teacherId],
  );
  const editSubjects = useMemo(
    () => subjectsOf(editTeacher),
    [editTeacher],
  );
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
          teacherId:
            openForm.teacherId === OTHER_TEACHER
              ? undefined
              : openForm.teacherId,
          teacherName:
            openForm.teacherId === OTHER_TEACHER
              ? openForm.teacherName
              : undefined,
          subjectId:
            openForm.teacherId === OTHER_TEACHER
              ? undefined
              : openForm.subjectId || undefined,
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

  async function saveSession(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !isManager) return;
    setBusy('edit');
    setError('');
    try {
      const updated = await api<Session>(`/ops/sessions/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherId:
            editForm.teacherId === OTHER_TEACHER
              ? undefined
              : editForm.teacherId,
          teacherName:
            editForm.teacherId === OTHER_TEACHER
              ? editForm.teacherName
              : undefined,
          subjectId:
            editForm.teacherId === OTHER_TEACHER
              ? null
              : editForm.subjectId || null,
          title: editForm.title || null,
          feeAmount: Number(editForm.feeAmount),
          centerAmount: Number(editForm.centerAmount),
        }),
      });
      setDetail(updated);
      if (settle?.id === selectedId) setSettle(updated);
      await loadLists();
      setMsg('تم تعديل الجلسة');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function collectPay(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !detail) return;
    const listedFee = sessionListedFee(detail);
    const amount = resolvePayAmount(
      listedFee,
      payForm.payMode,
      payForm.customAmount,
    );
    const needsReason = amount < listedFee - 0.001;
    const discountReason = payForm.discountReason.trim();
    if (amount < 0 || amount > listedFee + 0.001) {
      setError('المبلغ غير صالح');
      return;
    }
    if (needsReason && !discountReason) {
      setError('اكتب سبب الخصم');
      return;
    }
    setBusy('pay');
    setError('');
    try {
      await api(`/ops/sessions/${selectedId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          studentId:
            scanned?.id ||
            (payMatch.status === 'found' ? payMatch.student?.id : undefined),
          phone: scanned ? undefined : payForm.phone.trim() || undefined,
          studentUid: scanned?.studentUid,
          studentName: scanned ? undefined : payForm.studentName.trim() || undefined,
          parentPhone:
            !scanned && payMatch.status === 'missing'
              ? payForm.parentPhone.trim() || undefined
              : undefined,
          gradeLevelId:
            !scanned && payMatch.status === 'missing'
              ? payForm.gradeLevelId || undefined
              : undefined,
          method: payForm.method,
          vodafoneTxn:
            payForm.method === 'VODAFONE_CASH'
              ? payForm.vodafoneTxn
              : undefined,
          amount,
          discountReason: needsReason ? discountReason : undefined,
        }),
      });
      setPayForm({
        phone: '',
        studentName: '',
        parentPhone: '',
        gradeLevelId: '',
        method: 'CASH',
        vodafoneTxn: '',
        payMode: 'full',
        customAmount: '',
        discountReason: '',
      });
      setScanned(null);
      await loadDetail(selectedId);
      await loadLists();
      setMsg('تم تسجيل الدفع والحضور');
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

  async function runDeleteEntry() {
    if (!entryToDelete || !isManager) return;
    setBusy(`del-${entryToDelete.id}`);
    try {
      await api(`/ops/entries/${entryToDelete.id}`, { method: 'DELETE' });
      setEntryToDelete(null);
      if (selectedId) await loadDetail(selectedId);
      await loadLists();
      setMsg('اتمسح تسجيل الطالب من الجلسة');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function deleteSession() {
    if (!selectedId || !isManager) return;
    setAsk('delete');
  }

  async function runDeleteSession() {
    if (!selectedId || !isManager) return;
    setBusy('delete');
    try {
      await api(`/ops/sessions/${selectedId}`, { method: 'DELETE' });
      setSelectedId('');
      setDetail(null);
      await loadLists();
      setMsg('اتمسحت الجلسة');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function closeSession() {
    if (!selectedId) return;
    setAsk('close');
  }

  async function runCloseSession() {
    if (!selectedId) return;
    setBusy('close');
    try {
      const closed = await api<Session>(`/ops/sessions/${selectedId}/close`, {
        method: 'POST',
      });
      await loadLists();
      await loadDetail(selectedId);
      setSettle(closed);
      setMsg('اتقفلت الجلسة — راجع التسوية');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function payTeacherShare(sessionId: string) {
    setBusy('pay-teacher');
    setError('');
    try {
      const paid = await api<Session>(`/ops/sessions/${sessionId}/pay-teacher`, {
        method: 'POST',
      });
      setSettle(paid);
      await loadLists();
      await loadDetail(sessionId);
      setMsg('اتدفع للمدرس · نصيب السنتر فضل في الدرج');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function doRefund(e: FormEvent) {
    e.preventDefault();
    if (!refundForm.entryId) return;
    if (detail?.status === 'CLOSED') {
      setError('الجلسة اتقفلت — مفيش استرجاع لأي طالب');
      setRefundForm({ entryId: '', amount: '', reason: 'CANCELLED', note: '' });
      return;
    }
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

  const pagedSessions = usePaged(sessions, sessionDate);
  const pagedEntries = usePaged(detail?.entries || [], detail?.id || '');
  const pagedBlocks = usePaged(blocks, blocks.length);

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
          {
            label: sessionDate ? 'جلسات اليوم' : 'كل الجلسات',
            value: sessions.length,
          },
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 min-w-0">
          <SectionCard title="فتح جلسة مرنة" subtitle="استقبال فقط · سعر الحصة ومبلغ السنتر">
            <form onSubmit={openSession} className="space-y-2">
              <FieldLabel label="المدرس">
                <select
                  className="field"
                  required
                  value={openForm.teacherId}
                  onChange={(e) => {
                    const teacherId = e.target.value;
                    const teacher = teachers.find((x) => x.id === teacherId);
                    const subs = subjectsOf(teacher);
                    setOpenForm((f) => ({
                      ...f,
                      teacherId,
                      subjectId: subs[0]?.id || '',
                      teacherName:
                        teacherId === OTHER_TEACHER ? f.teacherName : '',
                    }));
                  }}
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName === '-' ? '' : t.lastName}
                    </option>
                  ))}
                  <option value={OTHER_TEACHER}>مدرس مش في القائمة…</option>
                </select>
              </FieldLabel>
              {openForm.teacherId === OTHER_TEACHER ? (
                <FieldLabel label="اسم المدرس">
                  <input
                    className="field"
                    required
                    value={openForm.teacherName}
                    onChange={(e) =>
                      setOpenForm({ ...openForm, teacherName: e.target.value })
                    }
                    placeholder="اكتب اسم المدرس"
                  />
                </FieldLabel>
              ) : (
                <FieldLabel label="المادة">
                  {teacherSubjects.length <= 1 ? (
                    <input
                      className="field bg-sand"
                      readOnly
                      value={
                        teacherSubjects[0]?.nameAr ||
                        'لا توجد مادة مربوطة بالمدرس'
                      }
                    />
                  ) : (
                    <select
                      className="field"
                      required
                      value={openForm.subjectId}
                      onChange={(e) =>
                        setOpenForm({ ...openForm, subjectId: e.target.value })
                      }
                    >
                      {teacherSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nameAr}
                        </option>
                      ))}
                    </select>
                  )}
                </FieldLabel>
              )}
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
                <FieldLabel label="مبلغ السنتر">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    required
                    value={openForm.centerAmount}
                    onChange={(e) =>
                      setOpenForm({
                        ...openForm,
                        centerAmount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              </div>
              <p className="text-[11px] text-navy/45">
                {Number(openForm.centerAmount || 0) >
                Number(openForm.feeAmount || 0)
                  ? 'مبلغ السنتر أكبر من سعر الحصة — المدرس مش هياخد من الحصة دي'
                  : `المدرس ياخد الباقي: ${(
                      Number(openForm.feeAmount || 0) -
                      Number(openForm.centerAmount || 0)
                    ).toLocaleString('en-EG')} ج.م للطالب`}
              </p>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === 'open'}
              >
                فتح الجلسة
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title="الجلسات"
            subtitle={
              sessionDate
                ? formatSessionDay(`${sessionDate}T00:00:00.000Z`)
                : 'كل التواريخ'
            }
          >
            <div className="mb-3 grid grid-cols-1 min-[420px]:grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                className="field mt-0 min-h-11 min-w-0"
                type="date"
                aria-label="تصفية حسب التاريخ"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
              {sessionDate ? (
                <button
                  type="button"
                  className="btn-ghost min-h-11 w-full min-[420px]:w-auto px-4"
                  onClick={() => setSessionDate('')}
                >
                  الكل
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost min-h-11 w-full min-[420px]:w-auto px-4"
                  onClick={() => setSessionDate(cairoYmd())}
                >
                  اليوم
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {pagedSessions.slice.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full min-h-11 rounded-xl px-3 py-2.5 text-right text-sm transition ${
                      selectedId === s.id
                        ? 'bg-[#0B2545] text-white'
                        : 'bg-sand text-navy'
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-semibold leading-snug break-words">
                        {s.teacher.firstName}{' '}
                        {s.teacher.lastName === '-' ? '' : s.teacher.lastName}
                        {s.title ? (
                          <span
                            className={`font-medium ${
                              selectedId === s.id
                                ? 'text-white/70'
                                : 'text-navy/55'
                            }`}
                          >
                            {' '}
                            · {s.title}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          s.status === 'OPEN'
                            ? selectedId === s.id
                              ? 'bg-emerald-400/20 text-emerald-100'
                              : 'bg-emerald-50 text-emerald-800'
                            : selectedId === s.id
                              ? 'bg-white/15 text-white/80'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {s.status === 'OPEN' ? 'مفتوحة' : 'مقفولة'}
                      </span>
                    </span>
                    <span
                      className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-5 ${
                        selectedId === s.id ? 'text-white/70' : 'text-navy/50'
                      }`}
                    >
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-bold tabular-nums ${
                          selectedId === s.id
                            ? 'bg-white/10 text-white'
                            : 'bg-white text-navy/70'
                        }`}
                      >
                        {formatSessionDay(s.sessionDate, true)}
                      </span>
                      <span className="tabular-nums">
                        {Number(s.feeAmount).toLocaleString('en-EG')} ج.م
                      </span>
                      <span className="opacity-50">·</span>
                      <span className="tabular-nums">
                        سنتر {centerCutOf(s).toLocaleString('en-EG')}
                      </span>
                      <span className="opacity-50">·</span>
                      <span className="tabular-nums">
                        مدرس {teacherCutOf(s).toLocaleString('en-EG')}
                      </span>
                      <span className="opacity-50">·</span>
                      <span>{s._count?.entries ?? 0} قيد</span>
                    </span>
                  </button>
                </li>
              ))}
              {!sessions.length ? (
                <EmptyState>
                  {sessionDate
                    ? 'لا توجد جلسات في اليوم ده'
                    : 'لا توجد جلسات'}
                </EmptyState>
              ) : null}
            </ul>
            <TablePager
              page={pagedSessions.page}
              pages={pagedSessions.pages}
              total={pagedSessions.total}
              size={pagedSessions.size}
              from={pagedSessions.from}
              to={pagedSessions.to}
              onPage={pagedSessions.setPage}
            />
          </SectionCard>
        </div>

        <div className="space-y-4 min-w-0">
          {detail ? (
            <>
              <SectionCard
                title={`${detail.teacher.firstName} ${detail.teacher.lastName}`}
                subtitle={`${formatSessionDay(detail.sessionDate)}${formatSessionDay(detail.sessionDate) ? ' · ' : ''}${detail.subject?.nameAr || 'بدون مادة'} · سعر ${Number(detail.feeAmount).toLocaleString('en-EG')} · سنتر ${centerCutOf(detail).toLocaleString('en-EG')} · مدرس ${teacherCutOf(detail).toLocaleString('en-EG')}`}
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
                  <div className="flex flex-col min-[480px]:flex-row min-[480px]:flex-wrap items-stretch min-[480px]:items-center gap-2 w-full">
                    {detail.status === 'OPEN' ? (
                      <button
                        type="button"
                        className="btn-ghost w-full min-[480px]:w-auto"
                        disabled={busy === 'close'}
                        onClick={closeSession}
                      >
                        قفل وتسوية
                      </button>
                    ) : (
                      <div className="flex flex-col min-[480px]:flex-row min-[480px]:flex-wrap items-stretch min-[480px]:items-center gap-2">
                        <span className="text-xs text-navy/50 leading-5">
                          مدرس:{' '}
                          {Number(detail.settledTeacherAmount || 0).toLocaleString(
                            'en-EG',
                          )}{' '}
                          · سنتر:{' '}
                          {Number(detail.settledCenterAmount || 0).toLocaleString(
                            'en-EG',
                          )}
                        </span>
                        {detail.teacherPaidAt ? (
                          <span className="badge-ok self-start">اتدفع للمدرس</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary w-full min-[480px]:w-auto !py-1.5 !px-3 text-xs"
                            disabled={busy === 'pay-teacher'}
                            onClick={() => setSettle(detail)}
                          >
                            تسوية الدفع
                          </button>
                        )}
                      </div>
                    )}
                    {isManager ? (
                      <button
                        type="button"
                        className="btn-ghost text-rose-700 w-full min-[480px]:w-auto"
                        disabled={busy === 'delete'}
                        onClick={deleteSession}
                      >
                        مسح الجلسة
                      </button>
                    ) : null}
                  </div>
                }
              >
                {isManager ? (
                  <form
                    onSubmit={saveSession}
                    className="mb-4 max-w-xl rounded-xl border border-mist p-3 space-y-2"
                  >
                    <p className="font-bold text-navy text-sm">تعديل الجلسة</p>
                    {detail.status === 'CLOSED' ? (
                      <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5">
                        {detail.teacherPaidAt
                          ? 'الجلسة مقفولة والمدرس اتدفع — تعديل السعر يحدّث تحصيل الطلاب والتسوية ومصروف الدرج. تغيير المدرس مقفول.'
                          : 'الجلسة مقفولة — تعديل السعر يحدّث تحصيل الطلاب وتسوية المدرس/السنتر.'}
                      </p>
                    ) : null}
                    <FieldLabel label="المدرس">
                      <select
                        className="field"
                        required
                        disabled={editLocked}
                        value={editForm.teacherId}
                        onChange={(e) => {
                          const teacherId = e.target.value;
                          const teacher = teachers.find((x) => x.id === teacherId);
                          const subs = subjectsOf(teacher);
                          setEditForm((f) => ({
                            ...f,
                            teacherId,
                            subjectId: subs[0]?.id || '',
                            teacherName:
                              teacherId === OTHER_TEACHER ? f.teacherName : '',
                          }));
                        }}
                      >
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.firstName} {t.lastName === '-' ? '' : t.lastName}
                          </option>
                        ))}
                        <option value={OTHER_TEACHER}>مدرس مش في القائمة…</option>
                      </select>
                    </FieldLabel>
                    {editForm.teacherId === OTHER_TEACHER ? (
                      <FieldLabel label="اسم المدرس">
                        <input
                          className="field"
                          required
                          value={editForm.teacherName}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              teacherName: e.target.value,
                            })
                          }
                          placeholder="اكتب اسم المدرس"
                        />
                      </FieldLabel>
                    ) : (
                    <FieldLabel label="المادة">
                      {editSubjects.length <= 1 ? (
                        <input
                          className="field bg-sand"
                          readOnly
                          value={
                            editSubjects[0]?.nameAr ||
                            'لا توجد مادة مربوطة بالمدرس'
                          }
                        />
                      ) : (
                        <select
                          className="field"
                          required
                          value={editForm.subjectId}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              subjectId: e.target.value,
                            })
                          }
                        >
                          {editSubjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nameAr}
                            </option>
                          ))}
                        </select>
                      )}
                    </FieldLabel>
                    )}
                    <FieldLabel label="عنوان مختصر">
                      <input
                        className="field"
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm({ ...editForm, title: e.target.value })
                        }
                      />
                    </FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldLabel label="سعر الحصة">
                        <input
                          className="field"
                          type="number"
                          min={0}
                          required
                          value={editForm.feeAmount}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              feeAmount: Number(e.target.value),
                            })
                          }
                        />
                      </FieldLabel>
                      <FieldLabel label="مبلغ السنتر">
                        <input
                          className="field"
                          type="number"
                          min={0}
                          required
                          value={editForm.centerAmount}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              centerAmount: Number(e.target.value),
                            })
                          }
                        />
                      </FieldLabel>
                    </div>
                    <p className="text-[11px] text-navy/45">
                      {Number(editForm.centerAmount || 0) >
                      Number(editForm.feeAmount || 0)
                        ? 'مبلغ السنتر أكبر من سعر الحصة — المدرس مش هياخد من الحصة دي'
                        : `المدرس ياخد الباقي: ${(
                            Number(editForm.feeAmount || 0) -
                            Number(editForm.centerAmount || 0)
                          ).toLocaleString('en-EG')} ج.م للطالب${
                            detail?.status === 'CLOSED'
                              ? ' · تحديث السعر يعدّل تحصيل الطلاب (السعر الكامل) ويعيد حساب التسوية والحسابات'
                              : detail?.status === 'OPEN'
                                ? ' · تحديث السعر يعدّل تحصيل الطلاب اللي اتسجّلوا بالسعر الكامل'
                                : ''
                          }`}
                    </p>
                    <button
                      type="submit"
                      className="btn-primary w-full"
                      disabled={busy === 'edit'}
                    >
                      حفظ التعديل
                    </button>
                  </form>
                ) : null}

                {detail.status === 'OPEN' ? (
                  <form
                    onSubmit={collectPay}
                    className="mb-4 max-w-xl rounded-xl border border-mist p-3 space-y-2"
                  >
                    <p className="font-bold text-navy text-sm">
                      تحصيل ودخول
                    </p>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      onClick={() => {
                        setError('');
                        setScanned(null);
                        setPayForm((f) => ({ ...f, phone: '' }));
                        setScanOpen(true);
                      }}
                    >
                      مسح QR بالكاميرا
                    </button>
                    {scanned ? (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                        <p className="text-xs text-emerald-800">تم المسح</p>
                        <p className="font-extrabold text-navy">
                          {scanned.firstName}{' '}
                          {scanned.lastName === '-' ? '' : scanned.lastName}
                        </p>
                        <button
                          type="button"
                          className="text-xs text-navy/50 mt-1"
                          onClick={() => {
                            setScanned(null);
                            setPayForm((f) => ({ ...f, phone: '' }));
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-navy/45">
                        امسح الـ QR · أو اكتب الاسم والموبايل. لو مش في السجل هنطلب الصف وولي الأمر.
                      </p>
                    )}
                    <FieldLabel label="اسم الطالب">
                      <input
                        className="field"
                        disabled={Boolean(scanned)}
                        value={payForm.studentName}
                        onChange={(e) =>
                          setPayForm({
                            ...payForm,
                            studentName: e.target.value,
                          })
                        }
                        placeholder="اسم الطالب"
                      />
                    </FieldLabel>
                    <FieldLabel label="رقم الموبايل">
                      <input
                        className="field"
                        inputMode="tel"
                        disabled={Boolean(scanned)}
                        value={payForm.phone}
                        onChange={(e) =>
                          setPayForm({
                            ...payForm,
                            phone: e.target.value,
                          })
                        }
                        placeholder="موبايل الطالب"
                      />
                    </FieldLabel>
                    {!scanned && payMatch.status === 'loading' ? (
                      <p className="text-[11px] text-navy/45">جاري البحث في سجل الطلاب…</p>
                    ) : null}
                    {!scanned && payMatch.status === 'found' && payMatch.student ? (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                        <p className="text-xs text-emerald-800">موجود في الطلاب</p>
                        <p className="font-extrabold text-navy">
                          {payMatch.student.firstName}{' '}
                          {payMatch.student.lastName === '-'
                            ? ''
                            : payMatch.student.lastName}
                        </p>
                        <p className="text-[11px] font-mono text-navy/45">
                          {payMatch.student.phone || payMatch.student.studentUid}
                        </p>
                      </div>
                    ) : null}
                    {!scanned && payMatch.status === 'missing' ? (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-900">
                          مش موجود في الطلاب — كمّل البيانات دي عشان نفتح له ملف
                        </p>
                        <FieldLabel label="الصف">
                          <select
                            className="field"
                            required
                            value={payForm.gradeLevelId}
                            onChange={(e) =>
                              setPayForm({
                                ...payForm,
                                gradeLevelId: e.target.value,
                              })
                            }
                          >
                            <option value="">اختَر الصف</option>
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.nameAr}
                              </option>
                            ))}
                          </select>
                        </FieldLabel>
                        <FieldLabel label="موبايل ولي الأمر">
                          <input
                            className="field"
                            inputMode="tel"
                            required
                            value={payForm.parentPhone}
                            onChange={(e) =>
                              setPayForm({
                                ...payForm,
                                parentPhone: e.target.value,
                              })
                            }
                            placeholder="01xxxxxxxxx"
                          />
                        </FieldLabel>
                      </div>
                    ) : null}
                    {!scanned && payMatch.status === 'error' ? (
                      <p className="text-xs font-semibold text-rose-700">
                        {payMatch.message}
                      </p>
                    ) : null}
                    {detail ? (
                      <div className="rounded-xl border border-mist bg-sand/40 p-3 space-y-2">
                        <p className="text-xs font-bold text-navy/55">
                          سعر الجلسة:{' '}
                          <span className="text-navy tabular-nums">
                            {sessionListedFee(detail).toLocaleString('en-EG')} ج.م
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              ['full', 'كامل'],
                              ['half', 'نصف'],
                              ['free', 'مجاني'],
                              ['custom', 'مبلغ آخر'],
                            ] as const
                          ).map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                                payForm.payMode === mode
                                  ? 'bg-[#0B2545] text-white'
                                  : 'bg-white border border-mist text-navy/70'
                              }`}
                              onClick={() =>
                                setPayForm((f) => ({
                                  ...f,
                                  payMode: mode,
                                  customAmount:
                                    mode === 'custom'
                                      ? String(
                                          resolvePayAmount(
                                            sessionListedFee(detail),
                                            f.payMode,
                                            f.customAmount,
                                          ),
                                        )
                                      : f.customAmount,
                                }))
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {payForm.payMode === 'custom' ? (
                          <FieldLabel label="المبلغ المدفوع">
                            <input
                              className="field"
                              type="number"
                              min={0}
                              max={sessionListedFee(detail)}
                              step="0.01"
                              value={payForm.customAmount}
                              onChange={(e) =>
                                setPayForm({
                                  ...payForm,
                                  customAmount: e.target.value,
                                })
                              }
                            />
                          </FieldLabel>
                        ) : null}
                        <p className="text-sm font-bold text-navy tabular-nums">
                          يُحصّل:{' '}
                          {resolvePayAmount(
                            sessionListedFee(detail),
                            payForm.payMode,
                            payForm.customAmount,
                          ).toLocaleString('en-EG')}{' '}
                          ج.م
                          {resolvePayAmount(
                            sessionListedFee(detail),
                            payForm.payMode,
                            payForm.customAmount,
                          ) <
                          sessionListedFee(detail) - 0.001 ? (
                            <span className="text-amber-800 font-semibold text-xs mr-2">
                              (خصم من{' '}
                              {sessionListedFee(detail).toLocaleString('en-EG')})
                            </span>
                          ) : null}
                        </p>
                        {resolvePayAmount(
                          sessionListedFee(detail),
                          payForm.payMode,
                          payForm.customAmount,
                        ) <
                        sessionListedFee(detail) - 0.001 ? (
                          <FieldLabel label="سبب الخصم *">
                            <input
                              className="field"
                              required
                              value={payForm.discountReason}
                              onChange={(e) =>
                                setPayForm({
                                  ...payForm,
                                  discountReason: e.target.value,
                                })
                              }
                              placeholder="مثال: قريب للمدرس · منحة · خصم إداري"
                            />
                          </FieldLabel>
                        ) : null}
                      </div>
                    ) : null}
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
                      disabled={
                        busy === 'pay' ||
                        (!scanned &&
                          payMatch.status !== 'found' &&
                          !(
                            payMatch.status === 'missing' &&
                            payForm.studentName.trim() &&
                            payForm.phone.trim() &&
                            payForm.parentPhone.trim() &&
                            payForm.gradeLevelId
                          ))
                      }
                    >
                      تأكيد الدفع ودخول الجلسة
                    </button>
                  </form>
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
                      {(pagedEntries.slice).map((e) => (
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
                            {e.listedFee != null &&
                            Number(e.listedFee) > Number(e.amount) + 0.001 ? (
                              <div className="text-amber-800 font-semibold">
                                من {Number(e.listedFee).toLocaleString('en-EG')}{' '}
                                ج.م
                                {e.discountReason ? (
                                  <span className="block text-[11px] font-normal text-navy/60">
                                    {e.discountReason}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
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
                            detail.status === 'OPEN' ? (
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
                            {isManager && !detail.teacherPaidAt ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs px-2 py-1 w-full text-rose-700"
                                disabled={busy === `del-${e.id}`}
                                onClick={() =>
                                  setEntryToDelete({
                                    id: e.id,
                                    name: `${e.student.firstName} ${e.student.lastName === '-' ? '' : e.student.lastName}`.trim(),
                                  })
                                }
                              >
                                مسح
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
                <TablePager
                  page={pagedEntries.page}
                  pages={pagedEntries.pages}
                  total={pagedEntries.total}
                  size={pagedEntries.size}
                  from={pagedEntries.from}
                  to={pagedEntries.to}
                  onPage={pagedEntries.setPage}
                />

                {refundForm.entryId && detail.status === 'OPEN' ? (
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
              {pagedBlocks.slice.map((b) => (
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
            <TablePager
              page={pagedBlocks.page}
              pages={pagedBlocks.pages}
              total={pagedBlocks.total}
              size={pagedBlocks.size}
              from={pagedBlocks.from}
              to={pagedBlocks.to}
              onPage={pagedBlocks.setPage}
            />
          </SectionCard>
        </div>
      </div>
      {settle
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-[#0B2545]/55 backdrop-blur-[2px]"
                aria-label="إغلاق"
                onClick={() => setSettle(null)}
              />
              <div
                className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
                dir="rtl"
              >
                <p className="text-[11px] font-bold tracking-[0.16em] text-gold">
                  تسوية الجلسة
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-navy">
                  {settle.teacher.firstName} {settle.teacher.lastName}
                  {settle.subject?.nameAr ? ` · ${settle.subject.nameAr}` : ''}
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-amber-50 px-3 py-3">
                    <p className="text-[11px] text-amber-800/70">المدرس</p>
                    <p className="text-xl font-extrabold tabular-nums text-amber-950">
                      {Number(settle.settledTeacherAmount || 0).toLocaleString(
                        'en-EG',
                      )}{' '}
                      <span className="text-xs font-semibold">ج.م</span>
                    </p>
                    <p className="mt-1 text-[11px] text-amber-800/70">
                      الباقي بعد مبلغ السنتر
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-3 py-3">
                    <p className="text-[11px] text-emerald-800/70">السنتر</p>
                    <p className="text-xl font-extrabold tabular-nums text-emerald-950">
                      {Number(settle.settledCenterAmount || 0).toLocaleString(
                        'en-EG',
                      )}{' '}
                      <span className="text-xs font-semibold">ج.م</span>
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-800/70">
                      تفضل في الدرج
                    </p>
                  </div>
                </div>
                {settle.teacherPaidAt ? (
                  <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    اتدفع للمدرس · نصيب السنتر في الدرج
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-navy/60">
                    ادفع حصة المدرس من الدرج. اللي يتبقى نصيب السنتر في الدرج.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!settle.teacherPaidAt ? (
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      disabled={busy === 'pay-teacher'}
                      onClick={() => void payTeacherShare(settle.id)}
                    >
                      تم دفع للمدرس
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost flex-1"
                    onClick={() => setSettle(null)}
                  >
                    {settle.teacherPaidAt ? 'تم' : 'لاحقاً'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {scanOpen
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-[#0B2545]/55 backdrop-blur-[2px]"
                aria-label="إغلاق"
                onClick={() => setScanOpen(false)}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" dir="rtl">
                <h3 className="text-lg font-extrabold text-navy">مسح كارت الطالب</h3>
                <p className="mt-1 text-sm text-navy/50">
                  وجّه الكاميرا على الـ QR
                </p>
                <div
                  id={OPS_SCANNER_ID}
                  className="mt-4 mx-auto w-full max-w-[260px] overflow-hidden rounded-xl bg-navy aspect-square"
                />
                <button
                  type="button"
                  className="btn-ghost w-full mt-4"
                  onClick={() => setScanOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      <AppDialog
        open={ask === 'close'}
        tone="info"
        title="قفل الجلسة"
        message="هتتقفل الجلسة ويتثبت مبلغ السنتر ونصيب المدرس. بعدها تقدر تسجّل إن المدرس استلم فلوسه."
        confirmLabel="قفل وتسوية"
        cancelLabel="رجوع"
        onConfirm={() => void runCloseSession()}
        onClose={() => setAsk(null)}
      />
      <AppDialog
        open={ask === 'delete'}
        tone="danger"
        title="مسح الجلسة"
        message="هتتمسح الجلسة وكل القيود المرتبطة بيها. التحصيل المسجّل هيتشال من الجلسة دي."
        confirmLabel="مسح الجلسة"
        cancelLabel="رجوع"
        onConfirm={() => void runDeleteSession()}
        onClose={() => setAsk(null)}
      />
      <AppDialog
        open={!!entryToDelete}
        tone="danger"
        title="مسح تسجيل الطالب"
        message={
          entryToDelete
            ? `هيتشال ${entryToDelete.name} من الجلسة خالص، ويقدر يتسجل تاني بعد كده.`
            : ''
        }
        confirmLabel="مسح التسجيل"
        cancelLabel="رجوع"
        onConfirm={() => void runDeleteEntry()}
        onClose={() => setEntryToDelete(null)}
      />
      <AppDialog
        open={!!scanNotice}
        tone={scanNotice?.tone || 'info'}
        title={scanNotice?.title}
        message={scanNotice?.message}
        confirmLabel="حسناً"
        onClose={() => setScanNotice(null)}
      />
    </AppShell>
  );
}
