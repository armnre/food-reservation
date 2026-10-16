import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ToastProvider } from '@/components/ui/feedback';
import { PwaProvider } from '@/components/shared/pwa';
export const metadata: Metadata = {
  title: { default: 'هم‌سفره | سامانه تغذیه دانشگاه شمال', template: '%s | هم‌سفره' },
  description: 'یک وعده خوب، یک روز بهتر. رزرو غذای دانشگاه شمال، کیف پول و بلیط دیجیتال در هم‌سفره.',
  applicationName: 'هم‌سفره',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'هم‌سفره' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#25145f' },
    { media: '(prefers-color-scheme: dark)', color: '#111019' },
  ],
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/vazirmatn.woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}",
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <PwaProvider />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
