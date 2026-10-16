'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/data';
import { setInitialPasswordAction } from '@/server/actions/student-actions';

export default function ChangePasswordPage() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = !pw
    ? 0
    : Math.min(
        4,
        (pw.length >= 8 ? 1 : 0) +
          (pw.length >= 12 ? 1 : 0) +
          (/[a-z]/.test(pw) && /[A-Z]/.test(pw) ? 1 : 0) +
          (/\d/.test(pw) && /[^\w\s]/.test(pw) ? 1 : 0),
      );
  const strengthLabels = ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'عالی'];
  const strengthColors = ['bg-rose-400', 'bg-orange-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) {
      setError('تکرار رمز عبور مطابقت ندارد');
      return;
    }
    setBusy(true);
    const res = await setInitialPasswordAction(pw);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  useEffect(() => {
    if (done) {
      const t = window.setTimeout(() => {
        window.location.href = '/';
      }, 1400);
      return () => window.clearTimeout(t);
    }
  }, [done]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-brand-950)] px-5 py-10">
      <div className="absolute inset-0">
        <Image src="/brand/login-panel.jpg" alt="" fill className="object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-l from-[var(--color-brand-950)] via-[var(--color-brand-950)]/90 to-[var(--color-brand-950)]/55" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-surface)]/97 shadow-[0_40px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="relative h-28 overflow-hidden">
            <Image src="/brand/login-panel.jpg" alt="" fill className="object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
            <div className="absolute bottom-4 right-6 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/90 text-[var(--color-brand-800)] shadow-lg">
                <KeyRound size={19} />
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-foreground-muted)]">هم‌سفره</p>
                <h1 className="text-lg font-bold tracking-tight">تعیین رمز شخصی</h1>
              </div>
            </div>
          </div>

          <div className="px-7 pb-8 pt-4">
            {done ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-500">
                  <CheckCircle2 size={30} />
                </div>
                <h2 className="mt-5 text-lg font-bold">رمز عبور با موفقیت ثبت شد</h2>
                <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">در حال ورود به داشبورد…</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] leading-loose text-[var(--color-foreground-muted)]">
                  این نخستین ورود شماست. پیش از دسترسی به بخش‌های سامانه، باید یک رمز عبور شخصی تعیین کنید.
                </p>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <Field label="رمز عبور جدید" required htmlFor="new-password">
                    <div className="relative">
                      <TextInput
                        id="new-password"
                        type={visible ? 'text' : 'password'}
                        dir="ltr"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        placeholder="حداقل ۸ کاراکتر"
                        className="text-right pl-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-foreground-muted)] transition-colors hover:text-[var(--color-foreground)]"
                        aria-label={visible ? 'پنهان کردن' : 'نمایش'}
                      >
                        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </Field>

                  {pw && (
                    <div>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < strength ? strengthColors[strength] : 'bg-[var(--color-muted)]'}`}
                          />
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-[var(--color-foreground-muted)]">
                        قدرت رمز: <span className="font-semibold">{strengthLabels[strength]}</span>
                      </p>
                    </div>
                  )}

                  <Field label="تکرار رمز عبور" required htmlFor="confirm-password">
                    <TextInput
                      id="confirm-password"
                      type={visible ? 'text' : 'password'}
                      dir="ltr"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="تکرار رمز عبور"
                      className="text-right"
                      required
                    />
                  </Field>

                  {error && (
                    <div
                      className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3"
                      role="alert"
                    >
                      <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-500" />
                      <p className="text-xs font-medium leading-relaxed text-rose-700">{error}</p>
                    </div>
                  )}

                  <Button type="submit" block size="lg" loading={busy}>
                    ثبت رمز عبور
                  </Button>
                </form>

                <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-3.5">
                  <p className="text-[11px] leading-loose text-[var(--color-foreground-muted)]">
                    رمز عبور نباید با کد ملی یا شماره دانشجویی شما برابر باشد و باید حداقل ۸ کاراکتر باشد.
                  </p>
                </div>

                <div className="mt-5 text-center">
                  <Link href="/login" className="text-xs text-[var(--color-brand-700)] hover:underline">
                    بازگشت به صفحه ورود
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
