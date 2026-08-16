'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { PoweredByCowdlly } from '@/components/PoweredByCowdlly';
import { BrandMark } from '@/components/BrandMark';
import { AppDialog } from '@/components/AppDialog';

const CHECKIN_URL =
  process.env.NEXT_PUBLIC_CHECKIN_API_URL ||
  'http://localhost:3001/api/check-in';
const DEVICE_KEY =
  process.env.NEXT_PUBLIC_DEVICE_API_KEY || 'success-device-key-change-me';

const SCANNER_ID = 'success-qr-reader';
const COOLDOWN_MS = 2800;
const CHOICE_IDLE_MS = 20000;

type ScanSource = 'QR_STUDENT' | 'NFC_CARD';
type UiStatus = 'idle' | 'ok' | 'err' | 'warn' | 'choice';

type SessionChoice = {
  id: string;
  title?: string | null;
  feeAmount?: string | number;
  teacherName?: string;
  subjectName?: string;
  paidLabel?: string | null;
  teacher?: { firstName: string; lastName: string };
  subject?: { nameAr?: string; nameEn?: string } | null;
  canCheckIn?: boolean;
};

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike;
  }
}

interface NDEFReaderLike {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: NDEFReadingEventLike) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}

interface NDEFReadingEventLike {
  message: {
    records: Array<{
      recordType: string;
      data?: DataView;
      encoding?: string;
    }>;
  };
}

function decodeNdefText(record: {
  data?: DataView;
  encoding?: string;
}): string | null {
  if (!record.data) return null;
  const encoding = record.encoding || 'utf-8';
  try {
    return new TextDecoder(encoding).decode(record.data);
  } catch {
    return new TextDecoder().decode(record.data);
  }
}

function sessionLabel(s: SessionChoice) {
  if (s.paidLabel) return s.paidLabel;
  const teacher =
    s.teacherName ||
    (s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : 'مدرس');
  const subject =
    s.subjectName || s.subject?.nameAr || s.subject?.nameEn || s.title || 'حصة';
  return `${teacher} · ${subject}`;
}

export default function CheckInKioskPage() {
  const [teacherId, setTeacherId] = useState<string | undefined>();
  const [status, setStatus] = useState<UiStatus>('idle');
  const [message, setMessage] = useState(
    'ادفع عند الاستقبال أولاً · ثم امسح QR أو NFC',
  );
  const [detail, setDetail] = useState('');
  const [cameraState, setCameraState] = useState<
    'starting' | 'live' | 'error'
  >('starting');
  const [nfcState, setNfcState] = useState<
    'unsupported' | 'starting' | 'listening' | 'error'
  >('starting');
  const [nfcHint, setNfcHint] = useState('');
  const [choices, setChoices] = useState<SessionChoice[]>([]);
  const [pendingPayload, setPendingPayload] = useState('');
  const [pendingSource, setPendingSource] = useState<ScanSource>('QR_STUDENT');
  const [popup, setPopup] = useState<{
    tone: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('teacherId');
    if (id) setTeacherId(id);
  }, []);

  const busyRef = useRef(false);
  const lastPayloadRef = useRef('');
  const lastAtRef = useRef(0);
  const wedgeRef = useRef('');
  const wedgeInputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const scannerRef = useRef<any>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const resetIdle = useCallback((delay = COOLDOWN_MS) => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      setStatus('idle');
      setMessage('ادفع عند الاستقبال أولاً · ثم امسح QR أو NFC');
      setDetail('');
      setChoices([]);
      setPendingPayload('');
      busyRef.current = false;
      wedgeInputRef.current?.focus();
    }, delay);
  }, []);

  const submit = useCallback(
    async (value: string, source: ScanSource, sessionId?: string) => {
      const raw = value.trim();
      if (!raw) return;

      const now = Date.now();
      if (
        !sessionId &&
        (busyRef.current ||
          (raw === lastPayloadRef.current &&
            now - lastAtRef.current < COOLDOWN_MS))
      ) {
        return;
      }

      busyRef.current = true;
      lastPayloadRef.current = raw;
      lastAtRef.current = now;
      clearResetTimer();
      setStatus('idle');
      setMessage('جاري التحقق من الدفع والدخول...');
      setDetail('');
      if (!sessionId) setChoices([]);

      try {
        const res = await fetch(CHECKIN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-key': DEVICE_KEY,
          },
          body: JSON.stringify({
            payload: raw,
            sessionId,
            teacherId,
            source,
            deviceName: source === 'NFC_CARD' ? 'web-nfc' : 'web-qr-camera',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            Array.isArray(data.message)
              ? data.message.join(', ')
              : data.message || 'فشل التسجيل',
          );
        }

        if (data.gate === 'CHOOSE_SESSION') {
          const eligible: SessionChoice[] =
            data.eligibleSessions ||
            (data.sessions || []).filter((s: SessionChoice) => s.canCheckIn);
          setPendingPayload(raw);
          setPendingSource(source);
          setChoices(eligible);
          setStatus('choice');
          setMessage(data.message || 'اختر الحصة للدخول');
          setDetail(data.studentName || '');
          busyRef.current = false;
          resetIdle(CHOICE_IDLE_MS);
          return;
        }

        if (data.gate === 'NEED_PAYMENT' || data.gate === 'NO_SESSION') {
          const other = (data.otherPaidSessions || [])[0];
          setStatus('err');
          setPopup({
            tone: 'error',
            title: 'مرفوض',
            message: [
              data.message || 'الدفع مطلوب قبل الدخول',
              other?.paidLabel
                ? `${data.studentName || ''} · ${other.paidLabel}`
                : data.studentName || '',
            ]
              .filter(Boolean)
              .join('\n'),
          });
          busyRef.current = true;
          return;
        }

        if (data.gate === 'ALREADY' || data.alreadyCheckedIn || data.gate === 'ALLOWED') {
          setStatus('ok');
          setPopup({
            tone: 'success',
            title: 'مسموح بالدخول',
            message: [data.message, data.detail].filter(Boolean).join('\n'),
          });
          busyRef.current = true;
          return;
        }

        if (data.ok || data.gate === 'ENTERED') {
          setStatus('ok');
          setPopup({
            tone: 'success',
            title: 'مسموح بالدخول',
            message: [data.message, data.detail].filter(Boolean).join('\n'),
          });
          busyRef.current = true;
          return;
        }

        setStatus('err');
        setPopup({
          tone: 'error',
          title: 'مرفوض',
          message: data.message || 'تعذّر إكمال الدخول',
        });
        busyRef.current = true;
      } catch (e) {
        setStatus('err');
        setPopup({
          tone: 'error',
          title: 'مرفوض',
          message:
            (e instanceof Error ? e.message : 'خطأ غير متوقع') +
            '\nحصّل من الاستقبال ثم أعد المسح',
        });
        busyRef.current = true;
      } finally {
        wedgeInputRef.current?.focus();
      }
    },
    [resetIdle, teacherId],
  );

  function chooseSession(sessionId: string) {
    if (!pendingPayload) return;
    clearResetTimer();
    void submit(pendingPayload, pendingSource, sessionId);
  }

  // Camera QR
  useEffect(() => {
    let stopped = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewW, viewH) => {
              const side = Math.min(viewW, viewH) * 0.72;
              return { width: side, height: side };
            },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decoded: string) => {
            void submit(decoded, 'QR_STUDENT');
          },
          () => undefined,
        );
        if (!stopped) setCameraState('live');
      } catch {
        if (!stopped) {
          setCameraState('error');
          setMessage('تعذّر تشغيل الكاميرا — فعّل الإذن أو استخدم NFC');
        }
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
        .finally(() => {
          scanner.clear().catch(() => undefined);
        });
    };
  }, [submit]);

  // Web NFC
  useEffect(() => {
    if (typeof window === 'undefined' || !window.NDEFReader) {
      setNfcState('unsupported');
      setNfcHint('NFC متاح على Chrome Android مع قارئ NFC');
      return;
    }

    const abort = new AbortController();
    const reader = new window.NDEFReader();
    setNfcState('starting');

    reader.onreading = (event) => {
      for (const record of event.message.records) {
        if (record.recordType !== 'text' && record.recordType !== 'url') {
          continue;
        }
        const text = decodeNdefText(record)?.trim();
        if (!text) continue;
        void submit(text, 'NFC_CARD');
        return;
      }
      setStatus('err');
      setMessage('كارت NFC بدون بيانات صالحة');
    };

    reader.onreadingerror = () => {
      setNfcState('error');
      setNfcHint('فشل قراءة NFC — قرّب الكارت وحاول مرة أخرى');
    };

    reader
      .scan({ signal: abort.signal })
      .then(() => {
        setNfcState('listening');
        setNfcHint('قرّب كارت NFC من الجهاز');
      })
      .catch((err: unknown) => {
        setNfcState('error');
        const msg = err instanceof Error ? err.message : 'تعذّر تفعيل NFC';
        setNfcHint(msg);
      });

    return () => abort.abort();
  }, [submit]);

  useEffect(() => {
    const focus = () => wedgeInputRef.current?.focus();
    focus();
    const id = window.setInterval(focus, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => () => clearResetTimer(), []);

  function onWedgeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = wedgeRef.current.trim();
      wedgeRef.current = '';
      if (wedgeInputRef.current) wedgeInputRef.current.value = '';
      if (!value) return;
      const source: ScanSource = value.toUpperCase().startsWith('SUCCESS:')
        ? 'NFC_CARD'
        : 'QR_STUDENT';
      void submit(value, source);
      return;
    }
    if (e.key.length === 1) {
      wedgeRef.current += e.key;
    }
  }

  const nfcLabel =
    nfcState === 'listening'
      ? 'NFC جاهز'
      : nfcState === 'unsupported'
        ? 'NFC غير مدعوم هنا'
        : nfcState === 'error'
          ? 'NFC غير متاح'
          : 'جاري تفعيل NFC...';

  const bg =
    status === 'ok'
      ? 'bg-emerald-700'
      : status === 'err'
        ? 'bg-red-700'
        : status === 'warn'
          ? 'bg-amber-700'
          : status === 'choice'
            ? 'bg-[#123a66]'
            : 'bg-[#0B2545]';

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${bg}`}
    >
      <div className="w-full max-w-lg text-center text-white">
        <BrandMark size="lg" layout="stack" invert showTagline />
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold">
          دخول الحصة
        </h1>
        <p className="mt-1 text-white/65 text-sm">
          الدفع قبل الدخول إلزامي · QR / NFC
        </p>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs">
          <span
            className={`rounded-full px-3 py-1 font-semibold ${
              cameraState === 'live'
                ? 'bg-emerald-400/20 text-emerald-200'
                : cameraState === 'error'
                  ? 'bg-red-400/20 text-red-100'
                  : 'bg-white/10 text-white/70'
            }`}
          >
            {cameraState === 'live'
              ? 'الكاميرا تعمل'
              : cameraState === 'error'
                ? 'الكاميرا متوقفة'
                : 'تشغيل الكاميرا...'}
          </span>
          <span
            className={`rounded-full px-3 py-1 font-semibold ${
              nfcState === 'listening'
                ? 'bg-amber-400/20 text-amber-200'
                : nfcState === 'unsupported' || nfcState === 'error'
                  ? 'bg-white/10 text-white/50'
                  : 'bg-white/10 text-white/70'
            }`}
          >
            {nfcLabel}
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/15 bg-black/30 shadow-lg">
          <div id={SCANNER_ID} className="w-full min-h-[280px]" />
        </div>

        <div
          className={`mt-5 rounded-2xl px-5 py-6 transition-colors ${
            status === 'ok'
              ? 'bg-white text-emerald-800'
              : status === 'err'
                ? 'bg-white text-red-700'
                : status === 'warn'
                  ? 'bg-white text-amber-800'
                  : status === 'choice'
                    ? 'bg-white text-navy'
                    : 'bg-white/10 text-white'
          }`}
        >
          <p className="text-xl sm:text-2xl font-bold">{message}</p>
          {detail ? <p className="mt-2 text-sm opacity-70">{detail}</p> : null}

          {status === 'choice' && choices.length ? (
            <div className="mt-4 grid gap-2">
              {choices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseSession(s.id)}
                  className="rounded-xl bg-[#0B2545] px-4 py-3 text-sm font-bold text-white hover:bg-[#163a63]"
                >
                  {sessionLabel(s)}
                  <span className="block text-[11px] font-normal text-amber-200 mt-1">
                    مدفوع · يقدر يدخل
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {nfcHint ? (
            <p className="mt-2 text-xs opacity-60">{nfcHint}</p>
          ) : null}
        </div>

        <input
          ref={wedgeInputRef}
          type="text"
          aria-label="USB scanner input"
          className="sr-only"
          autoComplete="off"
          autoFocus
          onKeyDown={onWedgeKeyDown}
        />

        <p className="mt-5 text-xs text-white/40">
          لو ظهرت رسالة الدفع: سجّل التحصيل من صفحة تشغيل الحصص ثم أعد المسح.
        </p>
        <div className="mt-6 flex justify-center">
          <PoweredByCowdlly variant="onNavy" />
        </div>
      </div>
      <AppDialog
        open={!!popup}
        tone={popup?.tone || 'info'}
        title={popup?.title}
        message={popup?.message}
        confirmLabel="حسناً"
        onClose={() => {
          setPopup(null);
          setStatus('idle');
          setMessage('ادفع عند الاستقبال أولاً · ثم امسح QR أو NFC');
          setDetail('');
          busyRef.current = false;
          lastPayloadRef.current = '';
          wedgeInputRef.current?.focus();
        }}
      />
    </div>
  );
}
