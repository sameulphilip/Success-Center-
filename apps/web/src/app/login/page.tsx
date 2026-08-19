'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandMark } from '@/components/BrandMark';
import { Eye, EyeOff } from 'lucide-react';
import { login, phoneLogin, phoneSetup, phoneStatus } from '@/lib/api';
import { PoweredByCowdlly } from '@/components/PoweredByCowdlly';
import { CENTER_NAME, FOUNDER_NAME } from '@/lib/brand';

function PasswordField({
  value,
  onChange,
  minLength,
  required,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  required?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative mt-1.5">
      <input
        className="field !mt-0 pe-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={visible ? 'text' : 'password'}
        minLength={minLength}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-navy/45 hover:bg-sand hover:text-navy"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        title={visible ? 'إخفاء' : 'إظهار'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

type Mode = 'staff' | 'student';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode =
    search.get('mode') === 'staff' ? 'staff' : ('student' as Mode);
  const initialPhone = search.get('phone') || '';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('admin@center.local');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [studentStep, setStudentStep] = useState<
    'phone' | 'setup' | 'login' | 'waiting'
  >('phone');
  const [hint, setHint] = useState('');
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialPhone) setPhone(initialPhone);
    if (initialMode === 'student') setMode('student');
    else setMode('staff');
  }, [initialPhone, initialMode]);

  useEffect(() => {
    const p = (initialPhone || phone).trim();
    if (mode !== 'student' || !p) return;
    if (!initialPhone) return;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const status = await phoneStatus(p);
        setHint(status.message);
        setStudentName(status.fullName || '');
        if (status.status === 'needs_password') setStudentStep('setup');
        else if (status.status === 'ready') setStudentStep('login');
        else setStudentStep('waiting');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر التحقق');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialPhone]);

  function redirectByRole(role: string) {
    if (role === 'STUDENT' || role === 'PARENT') router.replace('/portal');
    else if (role === 'TEACHER') router.replace('/attendance');
    else router.replace('/dashboard');
  }

  async function onStaffSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      redirectByRole(data.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  async function onCheckPhone(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setHint('');
    try {
      const status = await phoneStatus(phone);
      setHint(status.message);
      setStudentName(status.fullName || '');
      if (status.status === 'needs_password') setStudentStep('setup');
      else if (status.status === 'ready') setStudentStep('login');
      else setStudentStep('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التحقق');
    } finally {
      setLoading(false);
    }
  }

  async function onSetupPassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
                    setError('الرقمان السريان غير متطابقين');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await phoneSetup(phone, password);
      redirectByRole(data.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تعيين الرقم السري');
    } finally {
      setLoading(false);
    }
  }

  async function onStudentLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await phoneLogin(phone, password);
      redirectByRole(data.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr] bg-[#eef2f7]">
      <section className="relative hidden lg:flex overflow-hidden brand-rail items-center justify-center p-12">
        <div className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_30%_20%,#d4a017,transparent_40%),radial-gradient(circle_at_80%_70%,#ffffff,transparent_35%)]" />
        <div className="relative z-10 max-w-md text-center animate-rise">
          <BrandMark size="xl" layout="stack" invert showTagline />
          <p className="mt-6 text-white/70 leading-relaxed text-lg">
            الطلاب يدخلون برقم الموبايل بعد تأكيد دفع الاستمارة، وأول مرة يعيّنون الرقم السري.
          </p>
        </div>
      </section>

      <section className="grid place-items-center p-6">
        <div className="w-full max-w-[420px] rounded-2xl border border-mist bg-white p-8 shadow-panel animate-rise">
          <div className="lg:hidden mb-5 flex justify-center">
            <BrandMark size="lg" layout="stack" showTagline />
          </div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">
            {CENTER_NAME}
          </p>
          <p className="mt-1 text-sm font-semibold text-navy/70">{FOUNDER_NAME}</p>
          <h2 className="mt-2 text-2xl font-extrabold text-navy">تسجيل الدخول</h2>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-sand p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'student'
                  ? 'bg-[#0B2545] text-white'
                  : 'text-navy/60'
              }`}
              onClick={() => {
                setMode('student');
                setError('');
                setHint('');
                setStudentStep('phone');
                setPassword('');
                setConfirmPassword('');
              }}
            >
              طالب
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'staff' ? 'bg-[#0B2545] text-white' : 'text-navy/60'
              }`}
              onClick={() => {
                setMode('staff');
                setError('');
                setPassword('');
              }}
            >
              إدارة / مدرس
            </button>
          </div>

          {mode === 'staff' ? (
            <form onSubmit={onStaffSubmit} className="mt-6">
              <label className="block text-sm font-medium text-navy/80">
                البريد الإلكتروني
                <input
                  className="field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-navy/80">
                كلمة المرور
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  required
                  autoComplete="current-password"
                />
              </label>
              {error ? (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
              <button disabled={loading} className="btn-primary mt-6 w-full py-3">
                {loading ? 'جاري الدخول...' : 'دخول'}
              </button>
            </form>
          ) : (
            <div className="mt-6">
              {studentStep === 'phone' || studentStep === 'waiting' ? (
                <form onSubmit={onCheckPhone}>
                  <p className="text-sm text-navy/55 mb-3">
                    ادخل رقم موبايلك اللي سجّلت بيه في الاستمارة. بعد تأكيد الاستقبال، أول مرة هتعيّن الرقم السري.
                  </p>
                  <label className="block text-sm font-medium text-navy/80">
                    رقم الموبايل
                    <input
                      className="field"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="01xxxxxxxxx"
                      required
                    />
                  </label>
                  {hint ? (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {hint}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </p>
                  ) : null}
                  <button
                    disabled={loading}
                    className="btn-primary mt-6 w-full py-3"
                  >
                    {loading ? 'جاري التحقق...' : 'متابعة'}
                  </button>
                </form>
              ) : null}

              {studentStep === 'setup' ? (
                <form onSubmit={onSetupPassword}>
                  <p className="text-sm text-navy/55 mb-1">
                    أول مرة — اكتب الرقم السري لحسابك
                  </p>
                  {studentName ? (
                    <p className="text-sm font-bold text-navy mb-3">
                      مرحبًا {studentName}
                    </p>
                  ) : null}
                  <label className="block text-sm font-medium text-navy/80">
                    رقم الموبايل
                    <input className="field" value={phone} readOnly />
                  </label>
                  <label className="mt-4 block text-sm font-medium text-navy/80">
                    الرقم السري الجديد
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      minLength={6}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium text-navy/80">
                    تأكيد الرقم السري
                    <PasswordField
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      minLength={6}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  {error ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </p>
                  ) : null}
                  <button
                    disabled={loading}
                    className="btn-accent mt-6 w-full py-3"
                  >
                    {loading ? 'جاري الحفظ...' : 'حفظ ودخول البوابة'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost mt-2 w-full"
                    onClick={() => setStudentStep('phone')}
                  >
                    رجوع
                  </button>
                </form>
              ) : null}

              {studentStep === 'login' ? (
                <form onSubmit={onStudentLogin}>
                  {studentName ? (
                    <p className="text-sm font-bold text-navy mb-3">
                      مرحبًا {studentName}
                    </p>
                  ) : null}
                  <label className="block text-sm font-medium text-navy/80">
                    رقم الموبايل
                    <input className="field" value={phone} readOnly />
                  </label>
                  <label className="mt-4 block text-sm font-medium text-navy/80">
                    الرقم السري
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  {error ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </p>
                  ) : null}
                  <button
                    disabled={loading}
                    className="btn-primary mt-6 w-full py-3"
                  >
                    {loading ? 'جاري الدخول...' : 'دخول البوابة'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost mt-2 w-full"
                    onClick={() => setStudentStep('phone')}
                  >
                    رقم آخر
                  </button>
                </form>
              ) : null}
            </div>
          )}
          <div className="mt-6 flex justify-center border-t border-mist pt-4">
            <PoweredByCowdlly variant="dark" />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center text-navy/50">
          جاري التحميل...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
