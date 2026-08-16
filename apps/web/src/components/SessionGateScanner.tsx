'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { SectionCard } from '@/components/ui';
import { AppDialog } from '@/components/AppDialog';

type GateSession = {
  id: string;
  teacherName?: string;
  subjectName?: string;
  paidLabel?: string | null;
  canCheckIn?: boolean;
  alreadyIn?: boolean;
  needsPayment?: boolean;
  needsConfirm?: boolean;
  teacher?: { firstName: string; lastName: string };
  subject?: { nameAr?: string | null } | null;
  title?: string | null;
  feeAmount?: string | number;
};

type GateResult = {
  ok?: boolean;
  alreadyCheckedIn?: boolean;
  needsSessionChoice?: boolean;
  paidLabel?: string;
  message?: string;
  student?: { firstName?: string; lastName?: string };
  sessions?: GateSession[];
  otherPaidSessions?: GateSession[];
  session?: GateSession & {
    teacher?: { firstName: string; lastName: string };
    subject?: { nameAr?: string | null } | null;
  };
};

function nameOf(s?: { firstName?: string; lastName?: string } | null) {
  if (!s) return 'طالب';
  return `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'طالب';
}

function sessionText(s: GateSession) {
  const teacher =
    s.teacherName ||
    (s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : 'مدرس');
  const subject = s.subjectName || s.subject?.nameAr || s.title || 'حصة';
  return `${teacher} · ${subject}`;
}

export function SessionGateScanner({ teacherOnly }: { teacherOnly?: boolean }) {
  const me = getStoredUser();
  const teacherId = teacherOnly ? me?.teacherId || undefined : undefined;
  const [openSessions, setOpenSessions] = useState<GateSession[]>([]);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err' | 'warn' | 'choice'>(
    'idle',
  );
  const [message, setMessage] = useState('وجّه كارت الطالب للكاميرا');
  const [detail, setDetail] = useState('');
  const [choices, setChoices] = useState<GateSession[]>([]);
  const [pendingQr, setPendingQr] = useState('');
  const [cam, setCam] = useState<'starting' | 'live' | 'error'>('starting');
  const [popup, setPopup] = useState<{
    tone: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef('');
  const lastAtRef = useRef(0);
  const scannerRef = useRef<any>(null);
  const boxId = 'teacher-session-qr';

  const loadOpen = useCallback(async () => {
    try {
      const list = await api<GateSession[]>('/ops/sessions/open');
      setOpenSessions(list);
    } catch {
      setOpenSessions([]);
    }
  }, []);

  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  const submit = useCallback(
    async (qr: string, sessionId?: string) => {
      const raw = qr.trim();
      if (!raw) return;
      const now = Date.now();
      if (
        !sessionId &&
        (busyRef.current || (raw === lastRef.current && now - lastAtRef.current < 2500))
      ) {
        return;
      }
      busyRef.current = true;
      lastRef.current = raw;
      lastAtRef.current = now;
      setStatus('idle');
      setMessage('جاري التحقق من دفع الحصة...');
      setDetail('');
      if (!sessionId) setChoices([]);

      try {
        const data = await api<GateResult>('/ops/check-in', {
          method: 'POST',
          body: JSON.stringify({
            qrPayload: raw,
            sessionId,
            teacherId,
            source: 'QR',
          }),
        });

        if (data.needsSessionChoice && !sessionId) {
          const eligible = (data.sessions || []).filter((s) => s.canCheckIn);
          if (eligible.length === 1) {
            busyRef.current = false;
            await submit(raw, eligible[0].id);
            return;
          }
          if (eligible.length > 1) {
            setPendingQr(raw);
            setChoices(eligible);
            setStatus('choice');
            setMessage(`اختر حصة ${nameOf(data.student)}`);
            setDetail('دفع مؤكد — اختار الحصة');
            busyRef.current = false;
            return;
          }
          const other = data.otherPaidSessions?.[0];
          setStatus('err');
          setPopup({
            tone: 'error',
            title: 'مرفوض',
            message: other?.paidLabel
              ? `${nameOf(data.student)} · ${other.paidLabel}\nمش حصة المدرس الحالي`
              : `${nameOf(data.student)} محتاج يدفع الحصة دي عند الاستقبال`,
          });
          busyRef.current = true;
          return;
        }

        if (data.alreadyCheckedIn) {
          setStatus('ok');
          setPopup({
            tone: 'success',
            title: 'مسموح بالدخول',
            message: `${nameOf(data.student)}\n${
              data.session
                ? sessionText(data.session)
                : data.paidLabel || 'دفع مؤكد'
            }`,
          });
          busyRef.current = true;
          return;
        }

        if (data.ok) {
          setStatus('ok');
          setPopup({
            tone: 'success',
            title: 'مسموح بالدخول',
            message: `${nameOf(data.student)}\n${
              data.session
                ? sessionText(data.session)
                : data.paidLabel || 'دفع الحصة مؤكد'
            }`,
          });
          busyRef.current = true;
          void loadOpen();
          return;
        }

        setStatus('err');
        setPopup({
          tone: 'error',
          title: 'مرفوض',
          message: 'تعذّر تسجيل الدخول',
        });
        busyRef.current = true;
      } catch (e) {
        setStatus('err');
        setPopup({
          tone: 'error',
          title: 'مرفوض',
          message:
            (e instanceof Error ? e.message : 'فشل المسح') +
            '\nلو دفع عند الاستقبال، لازم الحصة تكون مفتوحة لنفس المدرس',
        });
        busyRef.current = true;
      }
    },
    [loadOpen, teacherId],
  );

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(boxId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (w: number, h: number) => {
              const side = Math.min(w, h) * 0.78;
              return { width: side, height: side };
            },
          },
          (decoded: string) => {
            void submit(decoded);
          },
          () => undefined,
        );
        if (!stopped) setCam('live');
      } catch {
        if (!stopped) setCam('error');
      }
    })();
    return () => {
      stopped = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      scanner
        .stop()
        .catch(() => undefined)
        .finally(() => scanner.clear().catch(() => undefined));
    };
  }, [submit]);

  const tone =
    status === 'ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : status === 'err'
        ? 'border-rose-300 bg-rose-50 text-rose-800'
        : status === 'warn'
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-mist bg-sand text-navy';

  return (
    <SectionCard
      title="دخول الحصة بالكاميرا"
      subtitle="الطالب يدفع عند الاستقبال · المسح هنا يثبت إنه دفع حصتك ويدخل"
      badge={
        <span className={cam === 'live' ? 'badge-ok' : 'badge-warn'}>
          {cam === 'live'
            ? 'الكاميرا شغالة'
            : cam === 'error'
              ? 'الكاميرا متوقفة'
              : 'تشغيل...'}
        </span>
      }
    >
      {openSessions.length ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {openSessions.map((s) => (
            <li
              key={s.id}
              className="rounded-full bg-[#0B2545] px-3 py-1 text-[11px] font-semibold text-white"
            >
              حصة مفتوحة · {sessionText(s)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-amber-800">
          مفيش حصة مفتوحة ليك دلوقتي — الاستقبال يفتح الجلسة من تشغيل الحصص.
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-navy/10 bg-black">
        <div id={boxId} className="min-h-[240px] w-full" />
      </div>

      <div className={`mt-3 rounded-2xl border px-4 py-4 ${tone}`}>
        <p className="text-lg font-extrabold">{message}</p>
        {detail ? <p className="mt-1 text-sm opacity-80">{detail}</p> : null}
        {status === 'choice' && choices.length ? (
          <div className="mt-3 grid gap-2">
            {choices.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn-primary"
                onClick={() => void submit(pendingQr, s.id)}
              >
                {s.paidLabel || sessionText(s)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <AppDialog
        open={!!popup}
        tone={popup?.tone || 'info'}
        title={popup?.title}
        message={popup?.message}
        confirmLabel="حسناً"
        onClose={() => {
          setPopup(null);
          busyRef.current = false;
          setStatus('idle');
          setMessage('وجّه كارت الطالب للكاميرا');
          setDetail('');
        }}
      />
    </SectionCard>
  );
}
