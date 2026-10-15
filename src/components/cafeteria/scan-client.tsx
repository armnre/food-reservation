'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ScanLine, Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle,
  User, UtensilsCrossed, Clock, Keyboard, RefreshCw, Volume2, VolumeX,
} from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/data';
import { ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import { scanQrAction, markUsedAction } from '@/server/actions/cafeteria-actions';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/validation';

interface TodayItem {
  id: string;
  status: string;
  qrToken: string;
  reservedAt: string;
  usedAt: string | null;
  userName: string;
  userUsername: string;
  foodName: string;
  mealSlotName: string;
  priceRials: number;
}

interface ScanResult {
  reservation: { id: string; status: string; priceRials: number; reservedAt: string; usedAt: string | null };
  user: { displayName: string; username: string } | null;
  food: { name: string } | null;
  slot: { name: string } | null;
  isToday: boolean;
  canMarkUsed: boolean;
}

const STATUS_META: Record<string, { label: string; variant: 'success' | 'info' | 'danger' | 'muted' | 'warning' }> = {
  CONFIRMED: { label: 'تأییدشده', variant: 'success' },
  USED: { label: 'تحویل‌شده', variant: 'info' },
  CANCELLED: { label: 'لغو شده', variant: 'danger' },
  NO_SHOW: { label: 'عدم حضور', variant: 'muted' },
  PENDING: { label: 'در انتظار', variant: 'warning' },
};

export function CafeteriaScanClient({
  initialItems, counts,
}: {
  initialItems: TodayItem[];
  counts: { total: number; confirmed: number; used: number; cancelled: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [confirmUse, setConfirmUse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  function beep(ok: boolean) {
    if (!sound) return;
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = ok ? 880 : 220;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      /* ignore */
    }
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      await new Promise(resolve => setTimeout(resolve, 60));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setScanning(true);
    } catch (e) {
      setCameraError('دسترسی به دوربین ممکن نشد. می‌توانید کد را دستی وارد کنید.');
      setCameraOn(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setScanning(false);
  }

  useEffect(() => () => stopCamera(), []);

  // اسکن текстовой — با کتابخانهٔ jsQR-like ساده از طریق BarcodeDetector
  useEffect(() => {
    if (!scanning || !cameraOn) return;
    let raf = 0;
    let lastDetect = 0;

    async function detect() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        raf = window.requestAnimationFrame(detect);
        return;
      }
      try {
        // @ts-expect-error - BarcodeDetector API
        const Detector = window.BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: ['qr_code'] });
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            const text = codes[0].rawValue;
            const now = Date.now();
            if (text && text !== lastScanRef.current && now - lastDetect > 2500) {
              lastScanRef.current = text;
              lastDetect = now;
              await handleScan(text);
            }
          }
        }
      } catch {
        /* ignore */
      }
      raf = window.requestAnimationFrame(detect);
    }

    raf = window.requestAnimationFrame(detect);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, cameraOn]);

  async function handleScan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setToken(trimmed);
    setBusy(true);
    const res = await scanQrAction(trimmed);
    setBusy(false);
    if (!res.ok) {
      beep(false);
      toast.push({ kind: 'error', title: 'QR نامعتبر', description: res.error });
      setResult(null);
      return;
    }
    beep(res.canMarkUsed);
    setResult(res);
    if (res.canMarkUsed) {
      setConfirmUse(true);
    } else if (res.reservation.status === 'USED') {
      toast.push({ kind: 'warning', title: 'قبلاً استفاده شده', description: `${res.user?.displayName ?? ''} — ${res.food?.name ?? ''}` });
    }
  }

  async function doMarkUsed() {
    if (!result) return;
    setConfirmUse(false);
    setBusy(true);
    const res = await markUsedAction(token || '');
    setBusy(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'خطا', description: res.error });
      return;
    }
    beep(true);
    toast.push({
      kind: 'success',
      title: 'تحویل ثبت شد',
      description: `${res.user?.displayName ?? ''} — ${res.food?.name ?? ''}`,
    });
    setResult(null);
    setToken('');
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* اسکنر */}
      <section className="lg:col-span-2 space-y-5">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(58,45,125,0.04),0_4px_12px_rgba(58,45,125,0.06)]">
          {/* seznam kamerası */}
          <div className="relative aspect-video bg-black">
            {cameraOn ? (
              <>
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-48 w-48 rounded-2xl border-2 border-[var(--color-accent-500)] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
                <div className="absolute right-3 top-3 flex gap-2">
                  <button
                    onClick={() => setSound((v) => !v)}
                    className="grid h-9 w-9 place-items-center rounded-lg bg-black/50 text-white backdrop-blur-sm"
                    aria-label="صدا"
                  >
                    {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                  <button
                    onClick={stopCamera}
                    className="grid h-9 w-9 place-items-center rounded-lg bg-black/50 text-white backdrop-blur-sm"
                    aria-label="بستن دوربین"
                  >
                    <CameraOff size={16} />
                  </button>
                </div>
                {busy && (
                  <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden">
                    <div className="h-full w-1/3 animate-[scan_1.2s_ease-in-out_infinite] rounded-full bg-[var(--color-accent-500)]" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-white/10 text-white/70">
                  <ScanLine size={36} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">دوربین را فعال کنید</p>
                  <p className="mt-1 text-xs text-white/50">یا کد QR را به‌صورت دستی وارد کنید</p>
                </div>
                <Button variant="accent" icon={<Camera size={16} />} onClick={startCamera}>
                  شروع اسکن
                </Button>
                {cameraError && (
                  <p className="text-[11px] text-amber-300">{cameraError}</p>
                )}
              </div>
            )}
          </div>

          {/* ورودی دستی */}
          <div className="border-t border-[var(--color-border)] p-4">
            <Field label="کد QR (دستی)" htmlFor="qr-input">
              <div className="flex gap-2">
                <TextInput
                  id="qr-input"
                  dir="ltr"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && token.trim() && handleScan(token)}
                  placeholder="شناسهٔ رزرو را paste کنید…"
                  className="text-right font-mono"
                />
                <Button
                  onClick={() => handleScan(token)}
                  disabled={!token.trim() || busy}
                  loading={busy}
                  icon={<Keyboard size={15} />}
                >
                  بررسی
                </Button>
              </div>
            </Field>
          </div>
        </div>

        {/* نتیجهٔ اسکن */}
        {result && (
          <div className={`rounded-2xl border p-5 shadow-sm ${
            result.canMarkUsed
              ? 'border-emerald-200 bg-emerald-50/50'
              : result.reservation.status === 'USED'
                ? 'border-sky-200 bg-sky-50/50'
                : 'border-rose-200 bg-rose-50/50'
          }`}>
            <div className="flex items-start gap-3.5">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                result.canMarkUsed ? 'bg-emerald-100 text-emerald-600'
                  : result.reservation.status === 'USED' ? 'bg-sky-100 text-sky-600'
                  : 'bg-rose-100 text-rose-500'
              }`}>
                {result.canMarkUsed ? <CheckCircle2 size={24} />
                  : result.reservation.status === 'USED' ? <CheckCircle2 size={24} />
                  : <XCircle size={24} />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold">
                  {result.user?.displayName ?? '—'}
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--color-foreground-muted)]" dir="ltr">
                  {result.user?.username ?? '—'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] text-[var(--color-foreground-muted)]">
                      <UtensilsCrossed size={10} /> غذا
                    </p>
                    <p className="mt-0.5 text-xs font-semibold">{result.food?.name ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] text-[var(--color-foreground-muted)]">
                      <Clock size={10} /> وعده
                    </p>
                    <p className="mt-0.5 text-xs font-semibold">{result.slot?.name ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    <p className="text-[10px] text-[var(--color-foreground-muted)]">مبلغ</p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums">{formatToman(result.reservation.priceRials)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_META[result.reservation.status]?.variant ?? 'muted'}>
                    {STATUS_META[result.reservation.status]?.label ?? result.reservation.status}
                  </Badge>
                  {!result.isToday && <Badge variant="warning">مربوط به امروز نیست</Badge>}

                  {result.canMarkUsed ? (
                    <Button
                      className="mr-auto"
                      icon={<CheckCircle2 size={15} />}
                      onClick={() => setConfirmUse(true)}
                    >
                      تأیید سرو
                    </Button>
                  ) : (
                    <Button
                      className="mr-auto"
                      variant="secondary"
                      icon={<RefreshCw size={14} />}
                      onClick={() => { setResult(null); setToken(''); }}
                    >
                      اسکن بعدی
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* لیست امروز */}
      <aside className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: 'کل', value: counts.total, tone: 'bg-[var(--color-muted)] text-[var(--color-foreground)]' },
            { label: 'تأییدشده', value: counts.confirmed, tone: 'bg-emerald-50 text-emerald-700' },
            { label: 'تحویل‌شده', value: counts.used, tone: 'bg-sky-50 text-sky-700' },
            { label: 'لغو شده', value: counts.cancelled, tone: 'bg-rose-50 text-rose-700' },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border border-[var(--color-border)] p-3 ${c.tone}`}>
              <p className="text-[10px] opacity-75">{c.label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{toPersianDigits(c.value)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <h2 className="text-sm font-bold">رزروهای امروز</h2>
          {initialItems.length === 0 ? (
            <div className="mt-3">
              <EmptyState image={false} title="رزروی ثبت نشده" description="امروز هنوز رزروی وجود ندارد." />
            </div>
          ) : (
            <div className="mt-3 max-h-[480px] space-y-1.5 overflow-y-auto">
              {initialItems.map((item) => {
                const meta = STATUS_META[item.status] ?? STATUS_META.PENDING;
                return (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      item.status === 'USED' ? 'bg-sky-100 text-sky-600'
                        : item.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-[var(--color-muted)] text-[var(--color-foreground-muted)]'
                    }`}>
                      {item.status === 'USED' ? <CheckCircle2 size={13} />
                        : item.status === 'CONFIRMED' ? <Clock size={13} />
                        : <XCircle size={13} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold">{item.userName}</p>
                      <p className="truncate text-[10px] text-[var(--color-foreground-muted)]">
                        {item.foodName} — {item.mealSlotName}
                      </p>
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmUse}
        onClose={() => setConfirmUse(false)}
        title="تأیید سرو غذا"
        description={`آیا تحویل غذا به «${result?.user?.displayName ?? ''}» — «${result?.food?.name ?? ''}» را تأیید می‌کنید؟ این عمل قابل بازگشت نیست.`}
        confirmLabel="تأیید سرو"
        onConfirm={doMarkUsed}
      />
    </div>
  );
}

export { User, AlertTriangle };
