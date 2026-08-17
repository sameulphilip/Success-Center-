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
import { api, getStoredUser } from '@/lib/api';

type Teacher = { id: string; firstName: string; lastName: string };
type Subject = { id: string; nameAr: string };
type Classroom = { id: string; name: string; capacity: number };

type Offer = {
  id: string;
  title: string;
  price: string | number;
  teacherPercent: string | number;
  isActive: boolean;
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
  cashTo?: 'DRAWER' | 'OWNER';
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
  stock: number;
  teacher?: Teacher | null;
};

type HandoutSale = {
  id: string;
  qty: number;
  amount: string | number;
  teacherShare: string | number;
  centerShare: string | number;
  method: string;
  payStatus: string;
  cashTo?: 'DRAWER' | 'OWNER';
  receiptNumber: string;
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
  cashTo?: 'DRAWER' | 'OWNER';
  status: string;
  receiptNumber?: string | null;
  classroom: Classroom;
};

function cashToLabel(to?: string) {
  return to === 'OWNER' ? 'صاحب السنتر' : 'الدرج';
}

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

  const [offerForm, setOfferForm] = useState({
    teacherId: '',
    subjectId: '',
    title: '',
    price: 0,
    teacherPercent: 50,
    codesCount: 20,
  });
  const [sellOnline, setSellOnline] = useState({
    offerId: '',
    method: 'CASH',
    vodafoneTxn: '',
    buyerName: '',
    qty: 1,
  });
  const [handoutForm, setHandoutForm] = useState({
    title: '',
    price: 0,
    teacherPercent: 50,
    teacherId: '',
    stock: 50,
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
    if (!offerForm.teacherId && t[0]) {
      setOfferForm((f) => ({ ...f, teacherId: t[0].id }));
    }
    if (!rentalForm.classroomId && c[0]) {
      setRentalForm((f) => ({ ...f, classroomId: c[0].id }));
    }
    if (!sellOnline.offerId && o[0]) {
      setSellOnline((f) => ({ ...f, offerId: o[0].id }));
    }
    if (!sellHandout.productId && h[0]) {
      setSellHandout((f) => ({ ...f, productId: h[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function loadCodes(offerId: string) {
    setSelectedOffer(offerId);
    setCodes(await api(`/revenue/online/offers/${offerId}/codes`));
  }

  async function createOffer(e: FormEvent) {
    e.preventDefault();
    setBusy('offer');
    setError('');
    try {
      await api('/revenue/online/offers', {
        method: 'POST',
        body: JSON.stringify({
          ...offerForm,
          subjectId: offerForm.subjectId || undefined,
        }),
      });
      setMsg('تم إنشاء عرض الأونلاين والأكواد');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sellCode(e: FormEvent) {
    e.preventDefault();
    setBusy('sellOn');
    try {
      const sale = await api<
        OnlineSale & { count?: number; codes?: string[]; totalAmount?: number }
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
      setMsg(
        `تم البيع${n > 1 ? ` (${n} كود)` : ''} — ${codesSold} · الفلوس على ${cashToLabel(sale.cashTo)}`,
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
    try {
      await api('/revenue/handouts', {
        method: 'POST',
        body: JSON.stringify({
          ...handoutForm,
          teacherId: handoutForm.teacherId || undefined,
        }),
      });
      setMsg('تم إضافة الملزمة');
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
      setMsg(`تم بيع الملزمة · الفلوس على ${cashToLabel(sale.cashTo)}`);
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
          <SectionCard title="إنشاء عرض أونلاين + أكواد">
            <form onSubmit={createOffer} className="space-y-2">
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
                  onChange={(e) =>
                    setOfferForm({ ...offerForm, teacherId: e.target.value })
                  }
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
                  {subjects.map((s) => (
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
                <FieldLabel label="نسبة المدرس %">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={offerForm.teacherPercent}
                    onChange={(e) =>
                      setOfferForm({
                        ...offerForm,
                        teacherPercent: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel label="عدد أكواد">
                  <input
                    className="field"
                    type="number"
                    min={1}
                    max={200}
                    value={offerForm.codesCount}
                    onChange={(e) =>
                      setOfferForm({
                        ...offerForm,
                        codesCount: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === 'offer'}
              >
                إنشاء العرض
              </button>
            </form>

            <ul className="mt-4 space-y-2 max-h-56 overflow-auto">
              {offers.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-sand px-3 py-2 text-right text-sm"
                    onClick={() => loadCodes(o.id)}
                  >
                    <span className="font-semibold block">{o.title}</span>
                    <span className="text-[11px] text-navy/45">
                      {o.teacher.firstName} ·{' '}
                      {Number(o.price).toLocaleString('en-EG')} · مدرس{' '}
                      {Number(o.teacherPercent)}% · أكواد {o._count?.codes ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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
                    {offers.map((o) => (
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
                      max={50}
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
              <ul className="space-y-2 max-h-72 overflow-auto text-sm">
                {onlineSales.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-mist px-3 py-2"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{s.offer.title}</span>
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
                  </li>
                ))}
                {!onlineSales.length ? <EmptyState>لا مبيعات بعد</EmptyState> : null}
              </ul>
            </SectionCard>

            {selectedOffer ? (
              <SectionCard title="أكواد العرض" subtitle={selectedOffer}>
                <ul className="max-h-48 overflow-auto text-xs font-mono space-y-1">
                  {codes.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span>{c.code}</span>
                      <span>{c.status}</span>
                    </li>
                  ))}
                </ul>
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
          <SectionCard title="إضافة ملزمة">
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
                <FieldLabel label="نسبة المدرس %">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={handoutForm.teacherPercent}
                    onChange={(e) =>
                      setHandoutForm({
                        ...handoutForm,
                        teacherPercent: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
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
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy === 'handout'}
              >
                حفظ الملزمة
              </button>
            </form>
            <ul className="mt-4 space-y-2 text-sm">
              {handouts.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl bg-sand px-3 py-2 flex justify-between"
                >
                  <span>
                    <span className="font-semibold">{h.title}</span>
                    <span className="text-[11px] text-navy/45 block">
                      {Number(h.price).toLocaleString('en-EG')} · مخزون {h.stock}{' '}
                      · مدرس {Number(h.teacherPercent)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
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
                  {handouts.map((h) => (
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
            <ul className="mt-4 space-y-2 text-sm max-h-64 overflow-auto">
              {handoutSales.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-mist px-3 py-2"
                >
                  <p className="font-semibold">{s.product.title}</p>
                  <p className="text-[11px] text-navy/45">
                    ×{s.qty} · {Number(s.amount).toLocaleString('en-EG')} · مدرس{' '}
                    {Number(s.teacherShare).toLocaleString('en-EG')} · سنتر{' '}
                    {Number(s.centerShare).toLocaleString('en-EG')} ·{' '}
                    {cashToLabel(s.cashTo)}
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
                </li>
              ))}
            </ul>
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
            <ul className="space-y-2 max-h-[480px] overflow-auto text-sm">
              {rentals.map((r) => (
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
          </SectionCard>
        </div>
      ) : null}
    </AppShell>
  );
}
