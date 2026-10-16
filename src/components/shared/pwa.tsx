'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share2, PlusSquare, Smartphone, WifiOff, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let promptEvent: InstallEvent | null = null;
function listen(cb: () => void) {
  window.addEventListener('pwa-ready', cb);
  return () => window.removeEventListener('pwa-ready', cb);
}
function connectivity(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
export function PwaProvider() {
  const online = useSyncExternalStore(
    connectivity,
    () => navigator.onLine,
    () => true,
  );
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const install = (e: Event) => {
      e.preventDefault();
      promptEvent = e as InstallEvent;
      window.dispatchEvent(new Event('pwa-ready'));
    };
    window.addEventListener('beforeinstallprompt', install);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (reg.waiting) setUpdate(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(worker);
            });
          });
        })
        .catch(() => {});
    }
    return () => window.removeEventListener('beforeinstallprompt', install);
  }, []);
  return (
    <>
      {!online && (
        <div className="pwa-offline-indicator">
          <WifiOff size={14} className="inline ml-2" />
          اتصال اینترنت قطع است؛ رزرو و پرداخت تا اتصال مجدد انجام نمی‌شود.
        </div>
      )}
      {update && (
        <div className="fixed bottom-24 left-4 z-50 surface-card p-4 text-xs shadow-xl">
          نسخهٔ جدید هم‌سفره آماده است.
          <button
            className="mr-4 text-[var(--color-brand-700)] font-bold"
            onClick={() => {
              update.postMessage({ type: 'SKIP_WAITING' });
              navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
                once: true,
              });
            }}
          >
            <RefreshCw size={12} className="inline ml-1" />
            به‌روزرسانی
          </button>
        </div>
      )}
    </>
  );
}
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const canInstall = useSyncExternalStore(
    listen,
    () => Boolean(promptEvent),
    () => false,
  );
  const [help, setHelp] = useState(false);
  return (
    <>
      <button
        className="pwa-install"
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            promptEvent = null;
            window.dispatchEvent(new Event('pwa-ready'));
          } else setHelp(true);
        }}
      >
        <Download size={15} />
        {compact ? 'نصب برنامه' : 'نصب هم‌سفره روی گوشی'}
      </button>
      <Dialog
        open={help}
        onClose={() => setHelp(false)}
        title="هم‌سفره، همیشه همراه شما"
        size="sm"
        footer={<Button onClick={() => setHelp(false)}>متوجه شدم</Button>}
      >
        <Smartphone size={40} className="text-[var(--color-brand-600)] mb-4" />
        <p className="text-sm leading-loose">
          بدون نیاز به فروشگاه برنامه، هم‌سفره را به صفحهٔ اصلی اضافه کنید.
        </p>
        <div className="mt-5 space-y-4 text-xs leading-loose text-[var(--color-foreground-muted)]">
          <p>
            <strong className="text-[var(--color-foreground)]">آیفون و آیپد (Safari):</strong>
            <br />
            <Share2 size={14} className="inline" /> دکمهٔ اشتراک‌گذاری را بزنید و{' '}
            <PlusSquare size={14} className="inline" /> «Add to Home Screen» را انتخاب کنید.
          </p>
          <p>
            <strong className="text-[var(--color-foreground)]">اندروید و دسکتاپ (Chrome / Edge):</strong>
            <br />
            {canInstall
              ? 'از دکمهٔ نصب استفاده کنید.'
              : 'از منوی مرورگر، «Install app» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.'}
          </p>
        </div>
      </Dialog>
    </>
  );
}
