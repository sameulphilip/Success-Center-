export function studentLoginUrl(origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin.replace(/\/$/, '')}/login?mode=student`;
}

export function studentLoginQrSrc(url: string, size = 520) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(url)}`;
}
