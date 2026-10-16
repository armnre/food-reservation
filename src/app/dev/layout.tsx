import { notFound } from 'next/navigation';

/**
 * محافظ مسیرهای توسعه (فاز ۱-۵).
 *
 * `/dev/**` فقط ابزار توسعه است (ویترین کامپوننت‌ها و کنترل‌های دمو) و در
 * production هیچ ارزش کاربری ندارد؛ بودنش در production سطح حمله را بی‌دلیل
 * بزرگ می‌کند. بنابراین در production این layout مستقیماً ۴۰۴ می‌دهد تا
 * حتی وجود مسیر هم لو نرود.
 *
 * لایهٔ دوم دفاع در `src/proxy.ts` است (rewrite به ۴۰۴ پیش از رسیدن به صفحه).
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <>{children}</>;
}
