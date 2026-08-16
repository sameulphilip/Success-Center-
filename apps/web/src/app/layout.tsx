import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientBoot } from '@/components/ClientBoot';

import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${CENTER_NAME} · ${FOUNDER_NAME} | نظام إدارة السنتر`,
  description: `${CENTER_NAME} Educational Center — ${FOUNDER_NAME} — ${CENTER_TAGLINE}`,
  icons: { icon: '/success-logo.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0b2545',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientBoot />
        {children}
      </body>
    </html>
  );
}
