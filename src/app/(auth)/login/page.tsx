'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  GraduationCap,
  BriefcaseBusiness,
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  Check,
  RefreshCw,
  LoaderCircle,
  Heart,
} from 'lucide-react';
import Logo from '@/components/brand/logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { InstallButton } from '@/components/shared/pwa';
import { toLatinDigits, toPersianDigits } from '@/lib/validation';
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
function LoginForm() {
  const params = useSearchParams();
  const [kind, setKind] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [answer, setAnswer] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('شماره دانشجویی یا نام کاربری و رمز عبور را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          identifier: toLatinDigits(identifier.trim()),
          password,
          captchaToken: captcha?.token,
          captchaAnswer: toLatinDigits(answer),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ورود انجام نشد؛ دوباره تلاش کنید.');
        if (data.captcha) {
          setCaptcha(data.captcha);
          setAnswer('');
        }
        return;
      }
      const next = params.get('next');
      const allowedNext = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\');
      window.location.assign(
        data.mustChangePassword ? '/change-password' : allowedNext ? next : data.redirectTo || '/',
      );
    } catch {
      setError('ارتباط با سامانه برقرار نشد. اتصال اینترنت را بررسی کنید.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <header className="auth-top">
          <Logo size={43} />
          <ThemeToggle />
        </header>
        <div className="auth-form-wrap">
          <span className="section-kicker">سامانه تغذیه دانشگاه شمال</span>
          <h1>
            به هم‌سفره خوش آمدید<span className="text-[var(--color-accent-500)]">!</span>
          </h1>
          <p>برای یک وعدهٔ خوب، از همین‌جا شروع کنید.</p>
          <div className="auth-tabs" role="tablist" aria-label="نوع ورود">
            <button
              role="tab"
              aria-selected={kind === 'STUDENT'}
              className={kind === 'STUDENT' ? 'active' : ''}
              onClick={() => {
                setKind('STUDENT');
                setError('');
                setCaptcha(null);
              }}
            >
              <GraduationCap size={18} />
              ورود دانشجو
            </button>
            <button
              role="tab"
              aria-selected={kind === 'STAFF'}
              className={kind === 'STAFF' ? 'active' : ''}
              onClick={() => {
                setKind('STAFF');
                setError('');
                setCaptcha(null);
              }}
            >
              <BriefcaseBusiness size={17} />
              ورود کارکنان
            </button>
          </div>
          <form onSubmit={submit} aria-label="فرم ورود">
            <div className="auth-field">
              <label htmlFor="identifier">{kind === 'STUDENT' ? 'شماره دانشجویی' : 'نام کاربری'}</label>
              <div className="auth-input-wrap">
                <UserRound />
                <input
                  id="identifier"
                  name="username"
                  autoComplete="username"
                  inputMode={kind === 'STUDENT' ? 'numeric' : 'text'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={
                    kind === 'STUDENT'
                      ? 'شماره دانشجویی خود را وارد کنید'
                      : 'نام کاربری سازمانی خود را وارد کنید'
                  }
                  required
                  maxLength={64}
                />
              </div>
            </div>
            <div className="auth-field">
              <label htmlFor="password">رمز عبور</label>
              <div className="auth-input-wrap">
                <LockKeyhole />
                <input
                  id="password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="رمز عبور خود را وارد کنید"
                  required
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <div className="auth-help">
              <span>
                <ShieldCheck size={12} className="inline ml-1" />
                ورود امن به حساب شما
              </span>
              <Link href="/forgot-password">رمز عبور را فراموش کرده‌اید؟</Link>
            </div>
            {captcha && (
              <div className="auth-first">
                <div className="flex-1">
                  <label htmlFor="captcha-answer" className="block mb-2">
                    برای ادامه پاسخ دهید: <b dir="ltr">{toPersianDigits(captcha.question)}</b>
                  </label>
                  <input
                    id="captcha-answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    inputMode="numeric"
                    required
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  />
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="تازه‌سازی کپچا"
                  onClick={async () => {
                    const r = await fetch(`/api/auth/login?identifier=${encodeURIComponent(identifier)}`);
                    const d = await r.json();
                    if (d.captcha) setCaptcha(d.captcha);
                  }}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            )}
            {error && (
              <div role="alert" className="auth-error">
                {error}
              </div>
            )}
            <button className="auth-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <>
                  ورود به هم‌سفره
                  <ArrowLeft size={18} />
                </>
              )}
            </button>
          </form>
          <div className="auth-first">
            <GraduationCap size={19} />
            <p>
              <strong>اولین بار است وارد می‌شوید؟</strong>
              <br />
              رمز اولیهٔ دانشجویان، کد ملی است. بعد از ورود، رمز شخصی خود را تعیین کنید.
            </p>
          </div>
          <div className="mt-6 flex justify-center">
            <InstallButton />
          </div>
        </div>
        <footer className="auth-footer">
          با همراهی هم، سر یک سفره <Heart size={11} className="inline mx-1 text-[var(--color-accent-500)]" />{' '}
          <span className="mx-2">·</span> <Link href="/help">راهنما و پشتیبانی</Link>
        </footer>
      </section>
      <aside className="auth-art">
        <div className="university-sign">
          <Image src="/brand/university.webp" alt="نشان رسمی دانشگاه شمال" width={47} height={47} />
          <div>
            <strong>دانشگاه شمال</strong>معاونت پژوهشی و دانشجویی
          </div>
        </div>
        <div className="auth-art-copy">
          <span className="hero-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-500)]" />
            هم‌سفره؛ همراه روزهای دانشگاه
          </span>
          <h2>
            یک وعدهٔ خوب،
            <br />
            <em>یک روز بهتر.</em>
          </h2>
          <p>
            رزرو آسان غذا، بدون صف.
            <br />
            منوی هفته را ببینید، غذایتان را انتخاب کنید و با خیال راحت به روزتان برسید.
          </p>
          <div className="mt-5 flex gap-5 text-[10px] text-[var(--color-hero-muted)]">
            <span>
              <Check size={13} className="inline ml-1" />
              رزرو آنلاین
            </span>
            <span>
              <Check size={13} className="inline ml-1" />
              کیف پول هوشمند
            </span>
            <span>
              <Check size={13} className="inline ml-1" />
              بلیط دیجیتال
            </span>
          </div>
        </div>
        <div className="auth-food-photo">
          <Image
            src="/foods/zereshk-polo.jpg"
            alt="یک وعده زرشک‌پلو با مرغ ایرانی"
            fill
            priority
            sizes="(max-width:767px) 0px, 50vw"
          />
          <div className="auth-food-caption">
            <ShieldCheck size={29} />
            <div>
              <strong>یک سفره، به وسعت دانشگاه</strong>برای دانشجویان، استادان و کارکنان دانشگاه شمال
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
