'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { AppDialog } from '@/components/AppDialog';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api, getStoredUser } from '@/lib/api';
import { TablePager, usePaged } from '@/components/TablePager';

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  subjects?: {
    subjectId?: string;
    subject?: { id: string; nameAr: string } | null;
  }[];
};
type Subject = { id: string; nameAr: string };
type Classroom = { id: string; name: string; capacity: number };

type Offer = {
  id: string;
  title: string;
  price: string | number;
  teacherPercent: string | number;
  centerAmount?: string | number | null;
  isActive: boolean;
  teacherId: string;
  subjectId?: string | null;
  teacher: Teacher;
  subject?: Subject | null;
  _count?: { codes: number; sales: number };
};

type OnlineSale = {
  id: string;
  amount: string | number;
  teacherShare: string | number;
  centerShare: string | number;
  method: string;
  payStatus: string;
  cashTo?: 'DRAWER' | 'OWNER' | 'TEACHER_HOLD' | 'SAFE';
  receiptNumber: string;
  buyerName?: string | null;
  buyerPhone?: string | null;
  code: { code: string };
  offer: { title: string; teacher: Teacher };
};

type Handout = {
  id: string;
  title: string;
  price: string | number;
  teacherPercent: string | number;
  centerAmount?: string | number | null;
  stock: number;
  isActive?: boolean;
  teacherId?: string | null;
  teacher?: Teacher | null;
  _count?: { sales: number };
};

type HandoutSale = {
  id: string;
  qty: number;
  amount: string | number;
  teacherShare: string | number;
  centerShare: string | number;
  method: string;
  payStatus: string;
  cashTo?: 'DRAWER' | 'OWNER' | 'TEACHER_HOLD' | 'SAFE';
  receiptNumber: string;
  buyerPhone?: string | null;
  vodafoneTxn?: string | null;
  note?: string | null;
  settlementId?: string | null;
  product: { title: string };
};

type Rental = {
  id: string;
  renterName: string;
  renterPhone?: string | null;
  title?: string | null;
  startsAt: string;
  endsAt: string;
  amount: string | number;
  method: string;
  payStatus: string;
  cashTo?: 'DRAWER' | 'OWNER' | 'TEACHER_HOLD' | 'SAFE';
  status: string;
  receiptNumber?: string | null;
  classroom: Classroom;
};

function cashToLabel(to?: string) {
  if (to === 'OWNER') return 'صاحب السنتر';
  if (to === 'TEACHER_HOLD') return 'حساب المدرس';
  if (to === 'SAFE') return 'الخزنة';
  return 'الدرج';
}

function teacherName(t?: { firstName?: string; lastName?: string } | null) {
  if (!t?.firstName) return '';
  const last = t.lastName && t.lastName !== '-' ? t.lastName : '';
  return `${t.firstName} ${last}`.trim();
}

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

function centerCutOf(
  price: string | number,
  teacherPercent: string | number,
  centerAmount?: string | number | null,
) {
  if (centerAmount != null && centerAmount !== '') {
    const n = Number(centerAmount);
    if (Number.isFinite(n)) return n;
  }
  return (
    Math.round(
      Number(price) * (1 - Number(teacherPercent) / 100) * 100,
    ) / 100
  );
}

const emptyOfferForm = {
  teacherId: '',
  subjectId: '',
  title: '',
  price: 0,
  centerAmount: 0,
  codesCount: 20,
  isActive: true,
};

const emptyHandoutForm = {
  title: '',
  price: 0,
  centerAmount: 0,
  teacherId: '',
  stock: 50,
  isActive: true,
};

export default function RevenuePage() {
  const me = getStoredUser();
  const toOwner =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';
  const [tab, setTab] = useState<'online' | 'handouts' | 'rooms'>('online');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Classroom[]>([]);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [onlineSales, setOnlineSales] = useState<OnlineSale[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [selectedOffer, setSelectedOffer] = useState('');

  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [handoutSales, setHandoutSales] = useState<HandoutSale[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);

  const [offerForm, setOfferForm] = useState({ ...emptyOfferForm });
  const [editingOfferId, setEditingOfferId] = useState('');
  const [confirm, setConfirm] = useState<null | {
    kind: 'sale' | 'offer' | 'handout' | 'handoutSale';
    id: string;
    label: string;
  }>(null);
  const [sellOnline, setSellOnline] = useState({
    offerId: '',
    method: 'CASH',
    vodafoneTxn: '',
    buyerName: '',
    qty: 1,
  });
  const [handoutForm, setHandoutForm] = useState({ ...emptyHandoutForm });
  const [editingHandoutId, setEditingHandoutId] = useState('');
  const [editingHandoutSaleId, setEditingHandoutSaleId] = useState('');
  const [handoutSaleForm, setHandoutSaleForm] = useState({
    qty: 1,
    method: 'CASH',
    vodafoneTxn: '',
    buyerPhone: '',
    note: '',
  });
  const [sellHandout, setSellHandout] = useState({
    productId: '',
    qty: 1,
    method: 'CASH',
    vodafoneTxn: '',
    buyerPhone: '',
  });
  const [rentalForm, setRentalForm] = useState({
    classroomId: '',
    renterName: '',
    renterPhone: '',
    title: '',
    startsAt: '',
    endsAt: '',
    amount: 0,
    method: 'CASH',
    vodafoneTxn: '',
  });

  const pOnline = usePaged(onlineSales, onlineSales.length);
  const pHandoutSales = usePaged(handoutSales, handoutSales.length);
  const pRentals = usePaged(rentals, rentals.length);
  const pCodes = usePaged(codes, selectedOffer);
  const pOffers = usePaged(offers, offers.length);
  const pHandouts = usePaged(handouts, handouts.length);

  async function load() {
    const [t, s, c, o, os, h, hs, r] = await Promise.all([
      api<Teacher[]>('/teachers'),
      api<Subject[]>('/catalog/subjects'),
      api<Classroom[]>('/catalog/classrooms'),
      api<Offer[]>('/revenue/online/offers'),
      api<OnlineSale[]>('/revenue/online/sales'),
      api<Handout[]>('/revenue/handouts'),
      api<HandoutSale[]>('/revenue/handouts/sales'),
      api<Rental[]>('/revenue/rentals'),
    ]);
    setTeachers(t);
    setSubjects(s);
    setRooms(c);
    setOffers(o);
    setOnlineSales(os);
    setHandouts(h);
    setHandoutSales(hs);
    setRentals(r);
    if (!editingOfferId) {
      setOfferForm((f) => {
        const teacherId = f.teacherId || t[0]?.id || '';
        const teacher = t.find((x) => x.id === teacherId);
        const subs = subjectsOf(teacher);
        const subjectId =
          (f.subjectId && subs.some((x) => x.id === f.subjectId)
            ? f.subjectId
            : subs[0]?.id) || f.subjectId || '';
        return { ...f, teacherId, subjectId };
      });
    }
    if (!rentalForm.classroomId && c[0]) {
      setRentalForm((f) => ({ ...f, classroomId: c[0].id }));
    }
    const activeOffers = o.filter((x) => x.isActive);
    setSellOnline((f) => {
      if (f.offerId && activeOffers.some((x) => x.id === f.offerId)) return f;
      return { ...f, offerId: activeOffers[0]?.id || '' };
    });
    const activeHandouts = h.filter((x) => x.isActive !== false);
    setSellHandout((f) => {
      if (f.productId && activeHandouts.some((x) => x.id === f.productId)) {
        return f;
      }
      return { ...f, productId: activeHandouts[0]?.id || h[0]?.id || '' };
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function loadCodes(offerId: string) {
    setSelectedOffer(offerId);
    setCodes(await api(`/revenue/online/offers/${offerId}/codes`));
  }

  async function saveOffer(e: FormEvent) {
    e.preventDefault();
    setBusy('offer');
    setError('');
    try {
      if (editingOfferId) {
        const updated = await api<{ updatedSales?: number }>(
          `/revenue/online/offers/${editingOfferId}/update`,
          {
            method: 'POST',
            body: JSON.stringify({
              teacherId: offerForm.teacherId,
              subjectId: offerForm.subjectId || null,
              title: offerForm.title,
              price: Number(offerForm.price),
              centerAmount: Number(offerForm.centerAmount),
              isActive: offerForm.isActive,
            }),
          },
        );
        const n = updated.updatedSales || 0;
        setMsg(
          n
            ? `تم تعديل العرض وتحديث ${n} كود مباع والحسابات`
            : 'تم تعديل العرض',
        );
        setEditingOfferId('');
        setOfferForm({
          ...emptyOfferForm,
          teacherId: offerForm.teacherId,
        });
      } else {
        await api('/revenue/online/offers', {
          method: 'POST',
          body: JSON.stringify({
            ...offerForm,
            subjectId: offerForm.subjectId || undefined,
          }),
        });
        setMsg('تم إنشاء عرض الأونلاين والأكواد');
      }
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function startEditOffer(o: Offer) {
    setEditingOfferId(o.id);
    setOfferForm({
      teacherId: o.teacherId || o.teacher.id,
      subjectId: o.subjectId || o.subject?.id || '',
      title: o.title,
      price: Number(o.price),
      centerAmount: centerCutOf(o.price, o.teacherPercent, o.centerAmount),
      codesCount: 20,
      isActive: o.isActive,
    });
    setError('');
    setMsg('');
  }

  function applyTeacher(teacherId: string) {
    const teacher = teachers.find((x) => x.id === teacherId);
    const subs = subjectsOf(teacher);
    setOfferForm((f) => ({
      ...f,
      teacherId,
      subjectId: subs[0]?.id || '',
    }));
  }

  function cancelEditOffer() {
    setEditingOfferId('');
    const teacherId = teachers[0]?.id || '';
    const subs = subjectsOf(teachers.find((x) => x.id === teacherId));
    setOfferForm({
      ...emptyOfferForm,
      teacherId,
      subjectId: subs[0]?.id || '',
    });
  }

  async function sellCode(e: FormEvent) {
    e.preventDefault();
    setBusy('sellOn');
    try {
      const sale = await api<
        OnlineSale & {
          count?: number;
          codes?: string[];
          totalAmount?: number;
          totalCenterShare?: number;
          totalTeacherShare?: number;
        }
      >(
        `/revenue/online/offers/${sellOnline.offerId}/sell`,
        {
          method: 'POST',
          body: JSON.stringify({
            qty: sellOnline.qty,
            method: sellOnline.method,
            vodafoneTxn:
              sellOnline.method === 'VODAFONE_CASH'
                ? sellOnline.vodafoneTxn
                : undefined,
            buyerName: sellOnline.buyerName || undefined,
          }),
        },
      );
      const codesSold = sale.codes?.length
        ? sale.codes.join(' · ')
        : sale.code.code;
      const n = sale.count || 1;
      const center = Number(
        sale.totalCenterShare ?? Number(sale.centerShare) * n,
      );
      const teacher = Number(
        sale.totalTeacherShare ?? Number(sale.teacherShare) * n,
      );
      setMsg(
        `تم البيع${n > 1 ? ` (${n} كود)` : ''} — ${codesSold} · سنتر ${center.toLocaleString('en-EG')} على ${cashToLabel(sale.cashTo)} · مدرس ${teacher.toLocaleString('en-EG')}`,
      );
      await load();
      if (selectedOffer) await loadCodes(selectedOffer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function confirmOnline(id: string) {
    await api(`/revenue/online/sales/${id}/confirm`, { method: 'POST' });
    await load();
    setMsg('تم تأكيد دفع الأونلاين');
  }

  async function createHandout(e: FormEvent) {
    e.preventDefault();
    setBusy('handout');
    setError('');
    try {
      if (editingHandoutId) {
        const updated = await api<{ updatedSales?: number }>(
          `/revenue/handouts/${editingHandoutId}/update`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: handoutForm.title,
              price: Number(handoutForm.price),
              centerAmount: Number(handoutForm.centerAmount),
              teacherId: handoutForm.teacherId || null,
              stock: Number(handoutForm.stock),
              isActive: handoutForm.isActive,
            }),
          },
        );
        const n = updated.updatedSales || 0;
        setMsg(
          n
            ? `تم تعديل الملزمة وتحديث ${n} عملية بيع`
            : 'تم تعديل الملزمة',
        );
        setEditingHandoutId('');
        setHandoutForm({ ...emptyHandoutForm });
      } else {
        await api('/revenue/handouts', {
          method: 'POST',
          body: JSON.stringify({
            ...handoutForm,
            teacherId: handoutForm.teacherId || undefined,
          }),
        });
        setMsg('تم إضافة الملزمة');
        setHandoutForm({ ...emptyHandoutForm });
      }
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function startEditHandout(h: Handout) {
    setEditingHandoutId(h.id);
    setHandoutForm({
      title: h.title,
      price: Number(h.price),
      centerAmount: centerCutOf(h.price, h.teacherPercent, h.centerAmount),
      teacherId: h.teacherId || h.teacher?.id || '',
      stock: h.stock,
      isActive: h.isActive !== false,
    });
    setError('');
    setMsg('');
  }

  function cancelEditHandout() {
    setEditingHandoutId('');
    setHandoutForm({ ...emptyHandoutForm });
  }

  function startEditHandoutSale(s: HandoutSale) {
    setEditingHandoutSaleId(s.id);
    setHandoutSaleForm({
      qty: s.qty,
      method: s.method || 'CASH',
      vodafoneTxn: s.vodafoneTxn || '',
      buyerPhone: s.buyerPhone || '',
      note: s.note || '',
    });
    setError('');
    setMsg('');
  }

  function cancelEditHandoutSale() {
    setEditingHandoutSaleId('');
    setHandoutSaleForm({
      qty: 1,
      method: 'CASH',
      vodafoneTxn: '',
      buyerPhone: '',
      note: '',
    });
  }

  async function saveHandoutSale(e: FormEvent) {
    e.preventDefault();
    if (!editingHandoutSaleId) return;
    setBusy(`hsave-${editingHandoutSaleId}`);
    setError('');
    try {
      await api(`/revenue/handouts/sales/${editingHandoutSaleId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          qty: Number(handoutSaleForm.qty),
          method: handoutSaleForm.method,
          vodafoneTxn:
            handoutSaleForm.method === 'VODAFONE_CASH'
              ? handoutSaleForm.vodafoneTxn
              : null,
          buyerPhone: handoutSaleForm.buyerPhone || null,
          note: handoutSaleForm.note || null,
        }),
      });
      setMsg('تم تعديل بيع الملزمة');
      cancelEditHandoutSale();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sellHandoutSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy('sellHn');
    try {
      const sale = await api<HandoutSale>(
        `/revenue/handouts/${sellHandout.productId}/sell`,
        {
          method: 'POST',
          body: JSON.stringify({
            qty: sellHandout.qty,
            method: sellHandout.method,
            vodafoneTxn:
              sellHandout.method === 'VODAFONE_CASH'
                ? sellHandout.vodafoneTxn
                : undefined,
            buyerPhone: sellHandout.buyerPhone || undefined,
          }),
        },
      );
      setMsg(
        `تم بيع الملزمة · سنتر ${Number(sale.centerShare).toLocaleString('en-EG')} على ${cashToLabel(sale.cashTo)} · مدرس ${Number(sale.teacherShare).toLocaleString('en-EG')}`,
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function confirmHandout(id: string) {
    await api(`/revenue/handouts/sales/${id}/confirm`, { method: 'POST' });
    await load();
    setMsg('تم تأكيد بيع الملزمة');
  }

  async function createRental(e: FormEvent) {
    e.preventDefault();
    setBusy('rental');
    try {
      const rental = await api<Rental>('/revenue/rentals', {
        method: 'POST',
        body: JSON.stringify({
          ...rentalForm,
          method: rentalForm.method,
          vodafoneTxn:
            rentalForm.method === 'VODAFONE_CASH'
              ? rentalForm.vodafoneTxn
              : undefined,
        }),
      });
      setMsg(`تم حجز القاعة · الفلوس على ${cashToLabel(rental.cashTo)}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function confirmRental(id: string) {
    await api(`/revenue/rentals/${id}/confirm`, { method: 'POST' });
    await load();
    setMsg('تم تأكيد إيجار القاعة');
  }

  async function cancelRental(id: string) {
    await api(`/revenue/rentals/${id}/cancel`, { method: 'POST' });
    await load();
  }

  async function doDeleteConfirm() {
    if (!confirm) return;
    const key = `${confirm.kind}-${confirm.id}`;
    setBusy(key);
    setError('');
    try {
      if (confirm.kind === 'offer') {
        await api(`/revenue/online/offers/${confirm.id}`, { method: 'DELETE' });
        if (selectedOffer === confirm.id) {
          setSelectedOffer('');
          setCodes([]);
        }
        if (sellOnline.offerId === confirm.id) {
          setSellOnline((s) => ({ ...s, offerId: '' }));
        }
        if (editingOfferId === confirm.id) cancelEditOffer();
        setMsg('تم مسح العرض وكل أكواده');
      } else if (confirm.kind === 'handout') {
        await api(`/revenue/handouts/${confirm.id}`, { method: 'DELETE' });
        if (sellHandout.productId === confirm.id) {
          setSellHandout((s) => ({ ...s, productId: '' }));
        }
        if (editingHandoutId === confirm.id) cancelEditHandout();
        setMsg('تم مسح الملزمة وكل مبيعاتها');
      } else if (confirm.kind === 'handoutSale') {
        await api(`/revenue/handouts/sales/${confirm.id}`, {
          method: 'DELETE',
        });
        if (editingHandoutSaleId === confirm.id) cancelEditHandoutSale();
        setMsg('تم مسح بيع الملزمة ورجع المخزون');
      } else {
        await api(`/revenue/online/sales/${confirm.id}`, { method: 'DELETE' });
        setMsg('تم مسح البيع والكود رجع متاح');
        if (selectedOffer) await loadCodes(selectedOffer);
      }
      setConfirm(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'فشل المسح');
    } finally {
      setBusy('');
    }
  }

  const teacherSubjects = subjectsOf(
    teachers.find((t) => t.id === offerForm.teacherId),
  );
  const subjectOptions = teacherSubjects.length ? teacherSubjects : subjects;

  return (
    <AppShell>
      <PageHeader
        title="إيرادات إضافية"
        subtitle={
          toOwner
            ? 'تحصيلك أنت بيروح لصاحب السنتر · الاستقبال بيتحسب في الدرج'
            : 'تحصيل الاستقبال بيتحسب في الدرج'
        }
      />
      <PageHero
        eyebrow="REVENUE"
        title="مرحلة التحصيل الإضافي"
        subtitle={
          toOwner
            ? 'كود أونلاين · ملازم · قاعات — المدير يدخلها لصاحب السنتر، الاستقبال للدرج'
            : 'كود أونلاين لمرة واحدة، بيع ملازم، وتأجير قاعة — التحصيل يدخل الدرج'
        }
        metrics={[
          { label: 'عروض أونلاين', value: offers.length, highlight: true },
          { label: 'ملازم', value: handouts.length },
          { label: 'تأجير', value: rentals.length },
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

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-sand p-1">
        {(
          [
            ['online', 'أونلاين'],
            ['handouts', 'ملازم'],
            ['rooms', 'قاعات'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`rounded-lg py-2 text-sm font-semibold ${
              tab === k ? 'bg-[#0B2545] text-white' : 'text-navy/60'
            }`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'online' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title={
              editingOfferId
                ? 'تعديل عرض أونلاين'
                : 'إنشاء عرض أونلاين + أكواد'
            }
            subtitle={
              editingOfferId
                ? 'تعديل السعر ومبلغ السنتر هيطبّق على كل الأكواد اللي اتباعت من العرض ده'
                : undefined
            }
          >
            <form onSubmit={saveOffer} className="space-y-2">
              <FieldLabel label="العنوان">
                <input
                  className="field"
                  required
                  value={offerForm.title}
                  onChange={(e) =>
                    setOfferForm({ ...offerForm, title: e.target.value })
                  }
                />
              </FieldLabel>
              <FieldLabel label="المدرس">
                <select
                  className="field"
                  required
                  value={offerForm.teacherId}
                  onChange={(e) => applyTeacher(e.target.value)}
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="المادة">
                <select
                  className="field"
                  value={offerForm.subjectId}
                  onChange={(e) =>
                    setOfferForm({ ...offerForm, subjectId: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {subjectOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <FieldLabel label="السعر">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    required
                    value={offerForm.price}
                    onChange={(e) =>
                      setOfferForm({
                        ...offerForm,
                        price: Number(e.target.value),
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
                    value={offerForm.centerAmount}
                    onChange={(e) =>
                      setOfferForm({
                        ...offerForm,
                        centerAmount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label={editingOfferId ? 'نشط' : 'عدد أكواد'}>
                  {editingOfferId ? (
                    <select
                      className="field"
                      value={offerForm.isActive ? '1' : '0'}
                      onChange={(e) =>
                        setOfferForm({
                          ...offerForm,
                          isActive: e.target.value === '1',
                        })
                      }
                    >
                      <option value="1">ظاهر للبيع</option>
                      <option value="0">متوقف</option>
                    </select>
                  ) : (
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={5000}
                      value={offerForm.codesCount}
                      onChange={(e) =>
                        setOfferForm({
                          ...offerForm,
                          codesCount: Number(e.target.value),
                        })
                      }
                    />
                  )}
                </FieldLabel>
              </div>
              <p className="text-[11px] text-navy/45">
                {Number(offerForm.centerAmount || 0) >
                Number(offerForm.price || 0)
                  ? `السعر ${Number(offerForm.price || 0).toLocaleString('en-EG')} · السنتر ${Number(offerForm.centerAmount || 0).toLocaleString('en-EG')} ج.م للكود — المدرس 0`
                  : `المدرس ياخد الباقي: ${(
                      Number(offerForm.price || 0) -
                      Number(offerForm.centerAmount || 0)
                    ).toLocaleString('en-EG')} ج.م للكود`}
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={busy === 'offer'}
                >
                  {editingOfferId ? 'حفظ التعديل' : 'إنشاء العرض'}
                </button>
                {editingOfferId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cancelEditOffer}
                  >
                    إلغاء
                  </button>
                ) : null}
              </div>
            </form>

            <ul className="mt-4 space-y-2">
              {pOffers.slice.map((o) => (
                <li
                  key={o.id}
                  className={`rounded-xl bg-sand px-3 py-2 ${
                    editingOfferId === o.id ? 'ring-2 ring-navy/25' : ''
                  } ${o.isActive ? '' : 'opacity-55'}`}
                >
                  <button
                    type="button"
                    className="w-full text-right text-sm"
                    onClick={() => loadCodes(o.id)}
                  >
                    <span className="font-semibold block">{o.title}</span>
                    <span className="text-[11px] text-navy/45">
                      {o.teacher.firstName} ·{' '}
                      {Number(o.price).toLocaleString('en-EG')} · سنتر{' '}
                      {centerCutOf(o.price, o.teacherPercent, o.centerAmount)} ج.م · أكواد{' '}
                      {o._count?.codes ?? 0}
                      {!o.isActive ? ' · متوقف' : ''}
                    </span>
                  </button>
                  {toOwner ? (
                    <div className="mt-1 flex gap-3">
                    <button
                      type="button"
                      className="text-xs font-bold text-navy/70 hover:underline"
                      onClick={() => startEditOffer(o)}
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold text-rose-700 hover:underline"
                      disabled={busy === `offer-${o.id}`}
                      onClick={() =>
                        setConfirm({
                          kind: 'offer',
                          id: o.id,
                          label: `${o.title} · ${o._count?.codes ?? 0} كود · ${o._count?.sales ?? 0} مباع`,
                        })
                      }
                    >
                      مسح العرض
                    </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <TablePager
              page={pOffers.page}
              pages={pOffers.pages}
              total={pOffers.total}
              size={pOffers.size}
              from={pOffers.from}
              to={pOffers.to}
              onPage={pOffers.setPage}
            />
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="بيع كود">
              <form onSubmit={sellCode} className="space-y-2">
                <FieldLabel label="العرض">
                  <select
                    className="field"
                    required
                    value={sellOnline.offerId}
                    onChange={(e) =>
                      setSellOnline({ ...sellOnline, offerId: e.target.value })
                    }
                  >
                    {offers
                      .filter((o) => o.isActive)
                      .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <FieldLabel label="اسم المشتري">
                    <input
                      className="field"
                      value={sellOnline.buyerName}
                      onChange={(e) =>
                        setSellOnline({
                          ...sellOnline,
                          buyerName: e.target.value,
                        })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="الكمية">
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={5000}
                      required
                      value={sellOnline.qty}
                      onChange={(e) =>
                        setSellOnline({
                          ...sellOnline,
                          qty: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </FieldLabel>
                </div>
                {(() => {
                  const offer = offers.find((o) => o.id === sellOnline.offerId);
                  const unit = Number(offer?.price || 0);
                  const total = unit * Number(sellOnline.qty || 1);
                  return offer ? (
                    <p className="text-[12px] text-navy/50">
                      الإجمالي {total.toLocaleString('en-EG')} ج.م
                      {sellOnline.qty > 1
                        ? ` (${sellOnline.qty} × ${unit.toLocaleString('en-EG')})`
                        : ''}
                      {!toOwner
                        ? ' · على حساب المدرس (متدخلش قفل اليوم)'
                        : ''}
                    </p>
                  ) : null;
                })()}
                <FieldLabel label="الدفع">
                  <select
                    className="field"
                    value={sellOnline.method}
                    onChange={(e) =>
                      setSellOnline({ ...sellOnline, method: e.target.value })
                    }
                  >
                    <option value="CASH">كاش</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                  </select>
                </FieldLabel>
                {sellOnline.method === 'VODAFONE_CASH' ? (
                  <FieldLabel label="رقم العملية">
                    <input
                      className="field"
                      required
                      value={sellOnline.vodafoneTxn}
                      onChange={(e) =>
                        setSellOnline({
                          ...sellOnline,
                          vodafoneTxn: e.target.value,
                        })
                      }
                    />
                  </FieldLabel>
                ) : null}
                <button
                  type="submit"
                  className="btn-accent w-full"
                  disabled={busy === 'sellOn' || !offers.length}
                >
                  بيع كود وإصدار إيصال
                </button>
              </form>
            </SectionCard>

            <SectionCard title="مبيعات الأونلاين">
              <ul className="space-y-2 text-sm">
                {pOnline.slice.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-mist px-3 py-2"
                  >
                    <div className="flex justify-between gap-2">
                      <span>
                        <span className="font-semibold block">{s.offer.title}</span>
                        <span className="text-[11px] text-navy/45">
                          {teacherName(s.offer.teacher)}
                          {s.buyerName ? ` · ${s.buyerName}` : ''}
                        </span>
                      </span>
                      <span className="font-mono text-xs">{s.code.code}</span>
                    </div>
                    <p className="text-[11px] text-navy/45 mt-1">
                      {Number(s.amount).toLocaleString('en-EG')} · مدرس{' '}
                      {Number(s.teacherShare).toLocaleString('en-EG')} · سنتر{' '}
                      {Number(s.centerShare).toLocaleString('en-EG')} ·{' '}
                      {cashToLabel(s.cashTo)} · {s.payStatus}
                    </p>
                    {s.payStatus === 'PENDING_CONFIRM' ? (
                      <button
                        type="button"
                        className="btn-accent text-xs mt-2"
                        onClick={() => confirmOnline(s.id)}
                      >
                        تأكيد فودافون
                      </button>
                    ) : null}
                    {toOwner ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-bold text-rose-700 hover:underline"
                        disabled={busy === `sale-${s.id}`}
                        onClick={() =>
                          setConfirm({
                            kind: 'sale',
                            id: s.id,
                            label: `${s.offer.title} · ${s.code.code}`,
                          })
                        }
                      >
                        مسح البيع
                      </button>
                    ) : null}
                  </li>
                ))}
                {!onlineSales.length ? <EmptyState>لا مبيعات بعد</EmptyState> : null}
              </ul>
              <TablePager
                page={pOnline.page}
                pages={pOnline.pages}
                total={pOnline.total}
                size={pOnline.size}
                from={pOnline.from}
                to={pOnline.to}
                onPage={pOnline.setPage}
              />
            </SectionCard>

            {selectedOffer ? (
              <SectionCard title="أكواد العرض" subtitle={selectedOffer}>
                <ul className="text-xs font-mono space-y-1">
                  {pCodes.slice.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span>{c.code}</span>
                      <span className="flex items-center gap-2">
                        <span>{c.status}</span>
                        {toOwner && c.status === 'SOLD' && c.sale?.id ? (
                          <button
                            type="button"
                            className="font-sans font-bold text-rose-700 hover:underline"
                            onClick={() =>
                              setConfirm({
                                kind: 'sale',
                                id: c.sale.id,
                                label: c.code,
                              })
                            }
                          >
                            مسح
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <TablePager
                  page={pCodes.page}
                  pages={pCodes.pages}
                  total={pCodes.total}
                  size={pCodes.size}
                  from={pCodes.from}
                  to={pCodes.to}
                  onPage={pCodes.setPage}
                />
                <button
                  type="button"
                  className="btn-ghost mt-2 text-xs"
                  onClick={async () => {
                    await api(`/revenue/online/offers/${selectedOffer}/codes`, {
                      method: 'POST',
                      body: JSON.stringify({ count: 10 }),
                    });
                    await loadCodes(selectedOffer);
                    await load();
                  }}
                >
                  إضافة 10 أكواد
                </button>
              </SectionCard>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'handouts' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title={editingHandoutId ? 'تعديل ملزمة' : 'إضافة ملزمة'}
          >
            <form onSubmit={createHandout} className="space-y-2">
              <FieldLabel label="الاسم">
                <input
                  className="field"
                  required
                  value={handoutForm.title}
                  onChange={(e) =>
                    setHandoutForm({ ...handoutForm, title: e.target.value })
                  }
                />
              </FieldLabel>
              <FieldLabel label="المدرس (اختياري)">
                <select
                  className="field"
                  value={handoutForm.teacherId}
                  onChange={(e) =>
                    setHandoutForm({
                      ...handoutForm,
                      teacherId: e.target.value,
                    })
                  }
                >
                  <option value="">—</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <FieldLabel label="السعر">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    required
                    value={handoutForm.price}
                    onChange={(e) =>
                      setHandoutForm({
                        ...handoutForm,
                        price: Number(e.target.value),
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
                    value={handoutForm.centerAmount}
                    onChange={(e) =>
                      setHandoutForm({
                        ...handoutForm,
                        centerAmount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label={editingHandoutId ? 'نشط' : 'المخزون'}>
                  {editingHandoutId ? (
                    <select
                      className="field"
                      value={handoutForm.isActive ? '1' : '0'}
                      onChange={(e) =>
                        setHandoutForm({
                          ...handoutForm,
                          isActive: e.target.value === '1',
                        })
                      }
                    >
                      <option value="1">نشط</option>
                      <option value="0">متوقف</option>
                    </select>
                  ) : (
                    <input
                      className="field"
                      type="number"
                      min={0}
                      value={handoutForm.stock}
                      onChange={(e) =>
                        setHandoutForm({
                          ...handoutForm,
                          stock: Number(e.target.value),
                        })
                      }
                    />
                  )}
                </FieldLabel>
              </div>
              {editingHandoutId ? (
                <FieldLabel label="المخزون">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    value={handoutForm.stock}
                    onChange={(e) =>
                      setHandoutForm({
                        ...handoutForm,
                        stock: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              ) : null}
              <p className="text-[11px] text-navy/45">
                {Number(handoutForm.centerAmount || 0) >
                Number(handoutForm.price || 0)
                  ? `السعر ${Number(handoutForm.price || 0).toLocaleString('en-EG')} · السنتر ${Number(handoutForm.centerAmount || 0).toLocaleString('en-EG')} ج.م للنسخة — المدرس 0`
                  : `المدرس ياخد الباقي: ${(
                      Number(handoutForm.price || 0) -
                      Number(handoutForm.centerAmount || 0)
                    ).toLocaleString('en-EG')} ج.م للنسخة`}
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={busy === 'handout'}
                >
                  {editingHandoutId ? 'حفظ التعديل' : 'حفظ الملزمة'}
                </button>
                {editingHandoutId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cancelEditHandout}
                  >
                    إلغاء
                  </button>
                ) : null}
              </div>
            </form>
            <ul className="mt-4 space-y-2 text-sm">
              {pHandouts.slice.map((h) => (
                <li
                  key={h.id}
                  className={`rounded-xl bg-sand px-3 py-2 ${
                    editingHandoutId === h.id ? 'ring-2 ring-navy/25' : ''
                  } ${h.isActive === false ? 'opacity-55' : ''}`}
                >
                  <span className="font-semibold block">{h.title}</span>
                  <span className="text-[11px] text-navy/45 block">
                    {h.teacher
                      ? `${teacherName(h.teacher)} · `
                      : ''}
                    {Number(h.price).toLocaleString('en-EG')} · مخزون {h.stock}{' '}
                    · سنتر{' '}
                    {centerCutOf(h.price, h.teacherPercent, h.centerAmount)} ج.م
                    {h.isActive === false ? ' · متوقف' : ''}
                  </span>
                  {toOwner ? (
                    <div className="mt-1 flex gap-3">
                      <button
                        type="button"
                        className="text-xs font-bold text-navy/70 hover:underline"
                        onClick={() => startEditHandout(h)}
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        className="text-xs font-bold text-rose-700 hover:underline"
                        disabled={busy === `handout-${h.id}`}
                        onClick={() =>
                          setConfirm({
                            kind: 'handout',
                            id: h.id,
                            label: `${h.title} · مخزون ${h.stock} · ${h._count?.sales ?? 0} مبيعات`,
                          })
                        }
                      >
                        مسح الملزمة
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <TablePager
              page={pHandouts.page}
              pages={pHandouts.pages}
              total={pHandouts.total}
              size={pHandouts.size}
              from={pHandouts.from}
              to={pHandouts.to}
              onPage={pHandouts.setPage}
            />
          </SectionCard>

          <SectionCard title="بيع ملزمة">
            <form onSubmit={sellHandoutSubmit} className="space-y-2">
              <FieldLabel label="الملزمة">
                <select
                  className="field"
                  required
                  value={sellHandout.productId}
                  onChange={(e) =>
                    setSellHandout({
                      ...sellHandout,
                      productId: e.target.value,
                    })
                  }
                >
                  {handouts
                    .filter((h) => h.isActive !== false)
                    .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title} ({h.stock})
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="الكمية">
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={sellHandout.qty}
                    onChange={(e) =>
                      setSellHandout({
                        ...sellHandout,
                        qty: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="موبايل المشتري">
                  <input
                    className="field"
                    value={sellHandout.buyerPhone}
                    onChange={(e) =>
                      setSellHandout({
                        ...sellHandout,
                        buyerPhone: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
              </div>
              {!toOwner ? (
                <p className="text-[11px] text-navy/45">
                  على حساب المدرس · متدخلش قفل اليوم · بعد التصفية نصيب السنتر يدخل الخزنة
                </p>
              ) : null}
              <FieldLabel label="الدفع">
                <select
                  className="field"
                  value={sellHandout.method}
                  onChange={(e) =>
                    setSellHandout({ ...sellHandout, method: e.target.value })
                  }
                >
                  <option value="CASH">كاش</option>
                  <option value="VODAFONE_CASH">فودافون كاش</option>
                </select>
              </FieldLabel>
              {sellHandout.method === 'VODAFONE_CASH' ? (
                <FieldLabel label="رقم العملية">
                  <input
                    className="field"
                    required
                    value={sellHandout.vodafoneTxn}
                    onChange={(e) =>
                      setSellHandout({
                        ...sellHandout,
                        vodafoneTxn: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
              ) : null}
              <button
                type="submit"
                className="btn-accent w-full"
                disabled={busy === 'sellHn' || !handouts.length}
              >
                بيع
              </button>
            </form>
            {editingHandoutSaleId ? (
              <form
                onSubmit={saveHandoutSale}
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2"
              >
                <p className="text-sm font-semibold text-navy">تعديل بيع ملزمة</p>
                <div className="grid grid-cols-2 gap-2">
                  <FieldLabel label="الكمية">
                    <input
                      className="field"
                      type="number"
                      min={1}
                      required
                      value={handoutSaleForm.qty}
                      onChange={(e) =>
                        setHandoutSaleForm({
                          ...handoutSaleForm,
                          qty: Number(e.target.value),
                        })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="موبايل المشتري">
                    <input
                      className="field"
                      value={handoutSaleForm.buyerPhone}
                      onChange={(e) =>
                        setHandoutSaleForm({
                          ...handoutSaleForm,
                          buyerPhone: e.target.value,
                        })
                      }
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label="الدفع">
                  <select
                    className="field"
                    value={handoutSaleForm.method}
                    onChange={(e) =>
                      setHandoutSaleForm({
                        ...handoutSaleForm,
                        method: e.target.value,
                      })
                    }
                  >
                    <option value="CASH">كاش</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                  </select>
                </FieldLabel>
                {handoutSaleForm.method === 'VODAFONE_CASH' ? (
                  <FieldLabel label="رقم العملية">
                    <input
                      className="field"
                      required
                      value={handoutSaleForm.vodafoneTxn}
                      onChange={(e) =>
                        setHandoutSaleForm({
                          ...handoutSaleForm,
                          vodafoneTxn: e.target.value,
                        })
                      }
                    />
                  </FieldLabel>
                ) : null}
                <FieldLabel label="ملاحظة">
                  <input
                    className="field"
                    value={handoutSaleForm.note}
                    onChange={(e) =>
                      setHandoutSaleForm({
                        ...handoutSaleForm,
                        note: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={busy === `hsave-${editingHandoutSaleId}`}
                  >
                    حفظ
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cancelEditHandoutSale}
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm">
              {pHandoutSales.slice.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-xl border border-mist px-3 py-2 ${
                    editingHandoutSaleId === s.id ? 'ring-2 ring-navy/25' : ''
                  }`}
                >
                  <p className="font-semibold">{s.product.title}</p>
                  <p className="text-[11px] text-navy/45">
                    ×{s.qty} · {Number(s.amount).toLocaleString('en-EG')} · مدرس{' '}
                    {Number(s.teacherShare).toLocaleString('en-EG')} · سنتر{' '}
                    {Number(s.centerShare).toLocaleString('en-EG')} ·{' '}
                    {cashToLabel(s.cashTo)}
                    {s.buyerPhone ? ` · ${s.buyerPhone}` : ''}
                  </p>
                  {s.payStatus === 'PENDING_CONFIRM' ? (
                    <button
                      type="button"
                      className="btn-accent text-xs mt-2"
                      onClick={() => confirmHandout(s.id)}
                    >
                      تأكيد فودافون
                    </button>
                  ) : null}
                  {toOwner ? (
                    <div className="mt-2 flex gap-3">
                      {!s.settlementId ? (
                        <button
                          type="button"
                          className="text-xs font-bold text-navy/70 hover:underline"
                          onClick={() => startEditHandoutSale(s)}
                        >
                          تعديل
                        </button>
                      ) : (
                        <span className="text-[11px] text-navy/40">
                          متصفّى مع المدرس
                        </span>
                      )}
                      <button
                        type="button"
                        className="text-xs font-bold text-rose-700 hover:underline"
                        disabled={busy === `handoutSale-${s.id}`}
                        onClick={() =>
                          setConfirm({
                            kind: 'handoutSale',
                            id: s.id,
                            label: `${s.product.title} · ×${s.qty} · ${Number(s.amount).toLocaleString('en-EG')} ج.م`,
                          })
                        }
                      >
                        مسح البيع
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <TablePager
              page={pHandoutSales.page}
              pages={pHandoutSales.pages}
              total={pHandoutSales.total}
              size={pHandoutSales.size}
              from={pHandoutSales.from}
              to={pHandoutSales.to}
              onPage={pHandoutSales.setPage}
            />
          </SectionCard>
        </div>
      ) : null}

      {tab === 'rooms' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="تأجير قاعة">
            <form onSubmit={createRental} className="space-y-2">
              <FieldLabel label="القاعة">
                <select
                  className="field"
                  required
                  value={rentalForm.classroomId}
                  onChange={(e) =>
                    setRentalForm({
                      ...rentalForm,
                      classroomId: e.target.value,
                    })
                  }
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.capacity})
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="اسم المستأجر">
                  <input
                    className="field"
                    required
                    value={rentalForm.renterName}
                    onChange={(e) =>
                      setRentalForm({
                        ...rentalForm,
                        renterName: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="موبايل">
                  <input
                    className="field"
                    value={rentalForm.renterPhone}
                    onChange={(e) =>
                      setRentalForm({
                        ...rentalForm,
                        renterPhone: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
              </div>
              <FieldLabel label="الغرض">
                <input
                  className="field"
                  value={rentalForm.title}
                  onChange={(e) =>
                    setRentalForm({ ...rentalForm, title: e.target.value })
                  }
                />
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="من">
                  <input
                    className="field"
                    type="datetime-local"
                    required
                    value={rentalForm.startsAt}
                    onChange={(e) =>
                      setRentalForm({
                        ...rentalForm,
                        startsAt: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="إلى">
                  <input
                    className="field"
                    type="datetime-local"
                    required
                    value={rentalForm.endsAt}
                    onChange={(e) =>
                      setRentalForm({ ...rentalForm, endsAt: e.target.value })
                    }
                  />
                </FieldLabel>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldLabel label="المبلغ">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    required
                    value={rentalForm.amount}
                    onChange={(e) =>
                      setRentalForm({
                        ...rentalForm,
                        amount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="الدفع">
                  <select
                    className="field"
                    value={rentalForm.method}
                    onChange={(e) =>
                      setRentalForm({ ...rentalForm, method: e.target.value })
                    }
                  >
                    <option value="CASH">كاش</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                  </select>
                </FieldLabel>
              </div>
              {rentalForm.method === 'VODAFONE_CASH' ? (
                <FieldLabel label="رقم العملية">
                  <input
                    className="field"
                    required
                    value={rentalForm.vodafoneTxn}
                    onChange={(e) =>
                      setRentalForm({
                        ...rentalForm,
                        vodafoneTxn: e.target.value,
                      })
                    }
                  />
                </FieldLabel>
              ) : null}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === 'rental' || !rooms.length}
              >
                حفظ التأجير
              </button>
              {!rooms.length ? (
                <p className="text-xs text-navy/45">
                  أضف قاعات من صفحة الإعدادات أولًا
                </p>
              ) : null}
            </form>
          </SectionCard>

          <SectionCard title="حجوزات القاعات">
            <ul className="space-y-2 text-sm">
              {pRentals.slice.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-mist px-3 py-2"
                >
                  <p className="font-semibold">
                    {r.classroom.name} · {r.renterName}
                  </p>
                  <p className="text-[11px] text-navy/45">
                    {new Date(r.startsAt).toLocaleString('ar-EG')} →{' '}
                    {new Date(r.endsAt).toLocaleString('ar-EG')}
                  </p>
                  <p className="text-[11px] text-navy/45">
                    {Number(r.amount).toLocaleString('en-EG')} ج.م ·{' '}
                    {cashToLabel(r.cashTo)} · {r.status} · {r.payStatus}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {r.payStatus === 'PENDING_CONFIRM' ? (
                      <button
                        type="button"
                        className="btn-accent text-xs"
                        onClick={() => confirmRental(r.id)}
                      >
                        تأكيد الدفع
                      </button>
                    ) : null}
                    {r.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => cancelRental(r.id)}
                      >
                        إلغاء
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!rentals.length ? <EmptyState>لا حجوزات بعد</EmptyState> : null}
            </ul>
            <TablePager
              page={pRentals.page}
              pages={pRentals.pages}
              total={pRentals.total}
              size={pRentals.size}
              from={pRentals.from}
              to={pRentals.to}
              onPage={pRentals.setPage}
            />
          </SectionCard>
        </div>
      ) : null}
      <AppDialog
        open={!!confirm}
        tone="danger"
        title={
          confirm?.kind === 'offer'
            ? 'مسح عرض الأكواد'
            : confirm?.kind === 'handout'
              ? 'مسح الملزمة'
              : confirm?.kind === 'handoutSale'
                ? 'مسح بيع ملزمة'
                : 'مسح كود متباع'
        }
        message={
          confirm?.kind === 'offer'
            ? `هيتشال العرض «${confirm.label}» وكل الأكواد والمبيعات المرتبطة بيه.`
            : confirm?.kind === 'handout'
              ? `هيتشال الملزمة «${confirm.label}» وكل مبيعاتها.`
              : confirm?.kind === 'handoutSale'
                ? `هيتشال البيع ويرجع المخزون.\n${confirm?.label || ''}`
                : `هيتشال البيع والكود يرجع متاح.\n${confirm?.label || ''}`
        }
        confirmLabel={
          busy.startsWith('sale-') ||
          busy.startsWith('offer-') ||
          busy.startsWith('handout')
            ? 'جاري المسح...'
            : 'مسح'
        }
        cancelLabel="رجوع"
        onConfirm={() => void doDeleteConfirm()}
        onClose={() => setConfirm(null)}
      />
    </AppShell>
  );
}
