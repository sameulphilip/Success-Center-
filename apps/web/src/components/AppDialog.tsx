'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type DialogTone = 'error' | 'success' | 'info' | 'danger';

const toneStyles: Record<
  DialogTone,
  { ring: string; title: string; btn: string }
> = {
  error: {
    ring: 'border-rose-200',
    title: 'text-rose-800',
    btn: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  success: {
    ring: 'border-emerald-200',
    title: 'text-emerald-800',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  info: {
    ring: 'border-sky-200',
    title: 'text-navy',
    btn: 'bg-navy hover:bg-navy/90 text-white',
  },
  danger: {
    ring: 'border-rose-200',
    title: 'text-rose-800',
    btn: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
};

export function AppDialog({
  open,
  title,
  message,
  tone = 'info',
  confirmLabel = 'حسناً',
  cancelLabel,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  message?: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const styles = toneStyles[tone];
  const defaultTitle =
    tone === 'error'
      ? 'تنبيه'
      : tone === 'success'
        ? 'تم بنجاح'
        : tone === 'danger'
          ? 'تأكيد'
          : 'رسالة';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0B2545]/50 backdrop-blur-[2px]"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto rounded-2xl border bg-white p-5 shadow-2xl ${styles.ring}`}
        dir="rtl"
      >
        <h3 className={`text-lg font-extrabold ${styles.title}`}>
          {title || defaultTitle}
        </h3>
        {message ? (
          <p className="mt-3 text-sm leading-relaxed text-navy/80 whitespace-pre-line">
            {message}
          </p>
        ) : null}
        {children}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {cancelLabel ? (
            <button type="button" className="btn-ghost" onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${styles.btn}`}
            onClick={() => {
              const fn = onConfirm;
              onClose();
              if (fn) queueMicrotask(() => fn());
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
