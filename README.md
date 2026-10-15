# هم‌سفره — دانشگاه شمال

رابط فارسی و RTL رزرو غذای دانشگاه؛ Next.js App Router، TypeScript strict، PostgreSQL/Drizzle و Redis.

> **وضعیت واقعی:** پیش‌نمایش production با رابط بازطراحی‌شده، PWA، ۹۰ تست واحد و ۱۵ تست مرورگری موفق موجود است. هنوز مجوز اعلام «آمادهٔ انتشار مالی عمومی» نداریم. موانع و دو مرحلهٔ باقی‌مانده در `PROJECT_STATE.md` آمده‌اند. پرداخت آزمایشی در production عمداً مسدود است.

## اجرا

1. وابستگی‌ها: `npm ci`
2. تنظیم `.env` از `.env.example`؛ `DATABASE_URL`، `REDIS_URL`، `DATA_ENCRYPTION_KEY` و `DATA_HASH_KEY` لازم‌اند. کلیدها ۳۲ بایت base64 و باید مستقل تولید شوند.
3. PostgreSQL و Redis را اجرا کنید؛ Compose فعلی زیرساخت توسعه است، نه استقرار عمومی.
4. محیط توسعهٔ خالی: `npx drizzle-kit push`؛ trigger append-only در `src/db/migrations/0001_audit_logs_append_only.sql` نیز باید اعمال شود. این روش جای migration نهایی production را نمی‌گیرد.
5. `npm run dev` برای توسعه؛ `npm run build` برای ساخت.

فایل محلی `secrets.env` فقط fallback محیط preview است و در gitignore قرار دارد. در استقرار واقعی، secrets باید از secret manager تزریق شوند. کلید موجود را بدون migration عوض نکنید؛ دادهٔ رمزنگاری‌شده قابل خواندن نخواهد بود.

## آزمون

- `npm run lint`
- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npx vitest run`
- `npm run build`
- `npx playwright install --with-deps chromium`
- در پایگاه دادهٔ آزمایشی: `npx tsx scripts/e2e-fixtures.ts`
- سپس: `BASE_URL=https://your-preview npx playwright test`

Fixtureها رمز تصادفی و شناسهٔ مستقل دارند. فایل `.test-credentials.json` ignored است؛ آن را در مخزن یا محیط عمومی قرار ندهید. هر بار برای تست ورود اول fixture جدید بسازید. اسکرین‌شات‌های ثابت در `docs/screenshots/` نگهداری می‌شوند، گزارش‌های موقت در gitignore و eslint ignore هستند.

## طراحی و PWA

- نشان اختصاصی هم‌سفره: `public/brand/hamsofre.svg`؛ نشان رسمی دانشگاه جداست.
- Vazirmatn محلی: `public/fonts/` همراه مجوز OFL.
- آیکون‌های واقعی ۱۹۲، ۵۱۲، maskable و Apple؛ manifest و service worker قابل نصب.
- Service worker فقط assets عمومی را کش می‌کند. HTML خصوصی، RSC، API، بلیط و موجودی آفلاین ذخیره نمی‌شوند.
- آفلاین به معنی امکان انجام رزرو/پرداخت بدون شبکه نیست؛ صفحهٔ قطع اتصال امن نشان داده می‌شود.
- رابط دانشجو در Chromium با عرض ۳۲۰، ۳۹۰، ۷۶۸، ۱۰۲۴ و ۱۴۴۰ آزموده شده است. تست فیزیکی iOS/Safari همچنان لازم است.

## نکات امنیتی

- نشست opaque سمت دیتابیس، کوکی httpOnly و Secure در production، SameSite=Lax.
- گارد Proxy + DAL و پاسخ واقعی ۴۰۳ برای نقش نامجاز، شامل RSC.
- AES-256-GCM و blind index کد ملی؛ پیش‌نمایش ایمپورت رمزنگاری‌شده و متعلق به صاحب نشست.
- Redis در production اجباری؛ healthcheck قطع آن را ۵۰۳ اعلام می‌کند.
- مبالغ ذخیره‌شده ریال و نمایش تومان است. تکمیل ممیزی مالی و migration بازتولیدپذیر پیش از دادهٔ واقعی ضروری است.
