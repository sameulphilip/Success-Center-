'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PoweredByCowdlly } from '@/components/PoweredByCowdlly';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type Offering = {
  id: string;
  teacherName: string;
  subjectName: string;
  isOnline: boolean;
  pageNumber: number;
};

type PublicForm = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  academicYear: string;
  gradeLabel: string;
  notes?: string | null;
  defaultFee: number;
  formFee?: number;
  offerings: Offering[];
};

type SubmitResult = {
  id: string;
  status: string;
  totalAmount: number;
  message: string;
  studentPhone?: string;
  nextSteps?: string[];
  selections: {
    teacherName: string;
    subjectName: string;
    isOnline: boolean;
  }[];
};

export default function PublicBookingPage() {
  const params = useParams();
  const rawSlug = params?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug || '';

  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_URL}/booking/public/${slug}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'الاستمارة غير متاحة');
        }
        const data = (await res.json()) as PublicForm;
        if (!cancelled) setForm(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'تعذر تحميل الاستمارة');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (slug) load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const bySubject = useMemo(() => {
    const map = new Map<string, Offering[]>();
    for (const o of form?.offerings || []) {
      const list = map.get(o.subjectName) || [];
      list.push(o);
      map.set(o.subjectName, list);
    }
    return Array.from(map.entries());
  }, [form]);

  const formFee = Number(form?.formFee ?? form?.defaultFee ?? 0) || 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/booking/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          studentPhone,
          parentPhone,
          offeringIds: Array.from(selected),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message;
        throw new Error(msg || 'فشل التسجيل');
      }
      setResult({
        id: data.id,
        status: data.status || 'SUBMITTED',
        totalAmount: Number(
          data.totalAmount ?? form?.formFee ?? form?.defaultFee ?? 0,
        ),
        studentPhone: data.studentPhone || studentPhone,
        message:
          data.message ||
          'تم تسجيل الحجز. برجاء التوجه للسنتر للدفع كاش واستلام الإيصال.',
        nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
        selections: Array.isArray(data.selections) ? data.selections : [],
      });
    } catch (err: any) {
      setError(err.message || 'فشل التسجيل');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <header className="relative overflow-hidden bg-[#0B2545] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(800px 320px at 90% 0%, rgba(201,150,18,0.35), transparent 55%), radial-gradient(600px 280px at 10% 100%, rgba(255,255,255,0.08), transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-8 sm:py-10">
          <div className="flex items-center gap-4 animate-rise">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/success-logo.png"
              alt="Success"
              width={72}
              height={72}
              className="rounded-full bg-white p-1 shadow-lg object-contain"
            />
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Success
              </p>
              <p className="text-[11px] tracking-[0.28em] text-amber-300 uppercase mt-1">
                Future Begins Here
              </p>
            </div>
          </div>
          {form ? (
            <div className="mt-6 animate-rise" style={{ animationDelay: '80ms' }}>
              <h1 className="text-xl sm:text-2xl font-extrabold">{form.title}</h1>
              <p className="mt-1 text-sm text-white/65">
                {form.gradeLabel} · {form.academicYear}
                {form.subtitle ? ` · ${form.subtitle}` : ''}
              </p>
              <p className="mt-3 text-sm">
                <span className="text-white/55">سعر الاستمارة · </span>
                <span className="font-extrabold text-amber-300 tabular-nums">
                  {Number(form.formFee ?? form.defaultFee ?? 0).toLocaleString(
                    'en-EG',
                  )}{' '}
                  ج.م
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
        {loading ? (
          <p className="panel p-6 text-sm text-navy/55">جاري تحميل الاستمارة…</p>
        ) : null}

        {error && !result ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {result ? (
          <section className="panel p-6 animate-rise space-y-4">
            <p className="text-xs tracking-[0.2em] text-amber-700 font-bold">
              BOOKING CONFIRMED
            </p>
            <h2 className="text-xl font-extrabold text-navy">تم تسجيل الحجز</h2>
            <p className="text-sm text-navy/65">{result.message}</p>
            <div className="rounded-xl bg-sand px-4 py-3 flex justify-between gap-3">
              <span className="text-sm text-navy/55">سعر الاستمارة</span>
              <span className="text-lg font-extrabold text-navy tabular-nums">
                {Number(result.totalAmount ?? 0).toLocaleString('en-EG')} ج.م
              </span>
            </div>
            <ul className="space-y-2">
              {result.selections.map((s, i) => (
                <li
                  key={`${s.teacherName}-${i}`}
                  className="rounded-xl border border-mist px-3 py-2 text-sm flex justify-between gap-2"
                >
                  <span>
                    <span className="font-semibold text-navy">{s.teacherName}</span>
                    <span className="text-navy/45"> · {s.subjectName}</span>
                    {s.isOnline ? (
                      <span className="ms-2 text-[11px] text-amber-700 font-bold">
                        Online
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-[#C99612]/40 bg-amber-50/50 p-4 space-y-3">
              <p className="text-xs tracking-[0.18em] text-amber-800 font-bold">
                الخطوة الجاية
              </p>
              <ol className="space-y-2 text-sm text-navy/80 list-decimal list-inside">
                {(result.nextSteps?.length
                  ? result.nextSteps
                  : [
                      'ادفع في السنتر كاش أو فودافون كاش واستلم الإيصال',
                      'بعد تأكيد الدفع هيتفتح حسابك تلقائي برقم موبايلك',
                      'سجّل دخول كطالب وعيّن كلمة المرور أول مرة',
                    ]
                ).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <a
                href={`/login?mode=student&phone=${encodeURIComponent(
                  result.studentPhone || '',
                )}`}
                className="btn-accent w-full"
              >
                بعد الدفع — دخول برقم الموبايل
              </a>
              <p className="text-[11px] text-navy/45">
                لو لسه ما دفعتش، الاستقبال لازم يأكد الدفع (كاش أو فودافون كاش)
                الأول عشان الحساب يتفتح.
              </p>
            </div>

            <p className="text-xs text-navy/45">
              رقم الطلب: <span className="font-mono">{result.id}</span>
            </p>
          </section>
        ) : null}

        {form && !result ? (
          <form onSubmit={onSubmit} className="space-y-5 animate-rise">
            <section className="panel p-5 space-y-3">
              <h2 className="section-title">بيانات الطالب</h2>
              <label className="block text-sm">
                <span className="text-navy/55">الاسم بالكامل</span>
                <input
                  className="field"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="الاسم كما في البطاقة"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-navy/55">موبايل الطالب</span>
                  <input
                    className="field"
                    required
                    inputMode="tel"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-navy/55">موبايل ولي الأمر</span>
                  <input
                    className="field"
                    required
                    inputMode="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <h2 className="section-title">اختيار المدرسين</h2>
                  <p className="text-xs text-navy/45 mt-1">
                    تقدر تختار أكثر من مدرس لنفس المادة
                  </p>
                </div>
                <span className="text-xs text-navy/45">
                  {selected.size} اختيار
                </span>
              </div>

              {bySubject.map(([subject, offerings]) => (
                <div key={subject} className="panel p-4">
                  <h3 className="font-bold text-navy mb-3">{subject}</h3>
                  <ul className="space-y-2">
                    {offerings.map((o) => {
                      const checked = selected.has(o.id);
                      return (
                        <li key={o.id}>
                          <label
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                              checked
                                ? 'border-[#C99612] bg-amber-50/70'
                                : 'border-mist bg-white hover:bg-sand'
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                className="size-4 accent-[#0B2545]"
                                checked={checked}
                                onChange={() => toggle(o.id)}
                              />
                              <span className="min-w-0">
                                <span className="block font-semibold text-navy truncate">
                                  {o.teacherName}
                                </span>
                                {o.isOnline ? (
                                  <span className="text-[11px] font-bold text-amber-700">
                                    Online
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-navy/40">
                                    حضور
                                  </span>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>

            {form.notes ? (
              <p className="text-xs text-navy/50 px-1 whitespace-pre-wrap">
                {form.notes}
              </p>
            ) : (
              <p className="text-xs text-navy/50 px-1">
                الدفع داخل السنتر كاش أو فودافون كاش. بعد التسجيل توجّه
                للاستقبال لاستلام الإيصال.
              </p>
            )}

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-white/95 backdrop-blur px-4 py-3 safe-area-pad">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-navy/45">سعر الاستمارة</p>
                  <p className="text-base sm:text-lg font-extrabold text-navy tabular-nums">
                    {formFee.toLocaleString('en-EG')} ج.م
                  </p>
                </div>
                <button
                  type="submit"
                  className="btn-accent shrink-0 px-4 sm:min-w-[140px]"
                  disabled={submitting || selected.size === 0}
                >
                  {submitting ? 'جاري التسجيل…' : 'تسجيل الحجز'}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </main>
      <div className="pb-24 pt-4 flex justify-center">
        <PoweredByCowdlly variant="dark" />
      </div>
    </div>
  );
}
