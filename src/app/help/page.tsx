import Link from 'next/link';
import { GraduationCap, Wallet, QrCode, ShieldCheck, ArrowRight } from 'lucide-react';
import Logo from '@/components/brand/logo';
import { InstallButton } from '@/components/shared/pwa';
export default function Help() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-9">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/" className="meal-cta">
          <ArrowRight size={14} />
          بازگشت
        </Link>
      </header>
      <h1 className="page-title mt-10">راهنمای هم‌سفره</h1>
      <p className="page-description mb-7">همراه شما، از اولین ورود تا دریافت غذا.</p>
      <div className="space-y-4">
        {[
          {
            Icon: GraduationCap,
            title: 'اولین ورود',
            text: 'با شماره دانشجویی و کد ملی وارد شوید و یک رمز شخصی حداقل ۸ کاراکتری تعیین کنید. کد ملی و شماره دانشجویی نمی‌توانند رمز جدید شما باشند.',
          },
          {
            Icon: Wallet,
            title: 'شارژ و لغو رزرو',
            text: 'مبالغ به تومان نمایش داده می‌شوند. لغو رزرو فقط پیش از مهلت مجاز است و وجه به کیف پول برمی‌گردد. اگر درگاه پیکربندی نشده باشد، پرداخت آنلاین غیرفعال خواهد بود.',
          },
          {
            Icon: QrCode,
            title: 'دریافت غذا',
            text: 'QR بلیط فعال خود را هنگام مراجعه به سلف نشان دهید. هر بلیط فقط یک بار قابل استفاده است. اطلاعات حساب و بلیط‌ها برای امنیت شما آفلاین ذخیره نمی‌شوند.',
          },
          {
            Icon: ShieldCheck,
            title: 'بازیابی رمز',
            text: 'با همراه داشتن کارت دانشجویی یا کارت ملی به معاونت پژوهشی و دانشجویی دانشگاه مراجعه کنید. برای حفظ امنیت، اطلاعات رمز را در اختیار دیگران قرار ندهید.',
          },
        ].map(({ Icon, title, text }) => (
          <section key={title} className="surface-card p-6">
            <Icon size={23} className="mb-3 text-[var(--color-brand-700)]" />
            <h2 className="text-sm font-bold">{title}</h2>
            <p className="mt-2 text-xs leading-loose text-[var(--color-foreground-muted)]">{text}</p>
          </section>
        ))}
      </div>
      <div className="mt-7">
        <InstallButton />
      </div>
    </main>
  );
}
