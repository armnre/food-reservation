import Link from 'next/link';
import Image from 'next/image';
import { ShieldX } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-5 py-12">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_30px_70px_rgba(26,21,37,0.14)]">
        <div className="relative h-44 overflow-hidden">
          <Image src="/brand/login-panel.jpg" alt="" fill className="object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)]/35 to-transparent" />
          <div className="absolute bottom-4 right-6 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500 shadow-lg">
              <ShieldX size={26} />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-foreground-muted)]">خطای ۴۰۳</p>
              <h1 className="text-2xl font-bold tracking-tight">دسترسی مجاز نیست</h1>
            </div>
          </div>
        </div>
        <div className="px-7 pb-8 pt-5">
          <p className="text-sm leading-loose text-[var(--color-foreground-muted)]">
            شما مجوز مشاهدهٔ این بخش را ندارید. اگر فکر می‌کنید این یک اشتباه است، با مدیر سامانه تماس بگیرید
            یا با حساب کاربری مناسب وارد شوید.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-950)] px-6 text-sm font-medium text-white shadow-[0_4px_14px_rgba(58,45,125,0.35)] transition-colors hover:bg-[var(--color-brand-900)]"
            >
              بازگشت به داشبورد
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-6 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-muted)]"
            >
              ورود با حساب دیگر
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
