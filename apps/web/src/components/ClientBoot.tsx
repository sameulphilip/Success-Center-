'use client';

import { useEffect } from 'react';

/** Clears stale service workers that break Next.js chunk loading (.call errors). */
export function ClientBoot() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => undefined);
  }, []);
  return null;
}
