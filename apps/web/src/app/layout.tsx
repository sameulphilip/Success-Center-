import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientBoot } from '@/components/ClientBoot';

export const metadata: Metadata = {
  title: 'Success Center | نظام إدارة السنتر',
  description: 'Success Educational Center — Future Begins Here',
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
