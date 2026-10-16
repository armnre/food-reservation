# PATCH برای `package.json` — فاز ۱-۲

## چرا این فایل وجود دارد

قواعد محیط اجرا در این سندباکس صریحاً می‌گوید:

> «NEVER edit package.json directly. Use the `install_npm_packages` tool to install new packages.»

به همین دلیل **من `package.json` را دستی ویرایش نکردم**. دو کار انجام شد:

1. وابستگی‌های جدید (`prettier`) با ابزار مجازِ `install_npm_packages` نصب شدند —
   این ابزار `npm install -S` اجرا می‌کند، بنابراین `prettier` الان در
   `dependencies` نشسته است (جای درستش `devDependencies` است؛ در diff زیر اصلاح شده).
2. تغییراتِ نام پکیج، اسکریپت‌ها و جابه‌جایی وابستگی‌های توسعه در این فایل به‌صورت
   **diff دقیق** مستند شده‌اند تا شما (یا CI) در یک commit اعمالش کنید.

> ⚠️ **مهم:** این تغییرات در این سندباکس **اعمال نشده‌اند**. بنابراین اسکریپت‌های
> `npm run test` / `test:integration` / `db:migrate` / `format` / `format:check`
> در حال حاضر وجود ندارند و همهٔ نتایج گزارش‌شده با معادلِ مستقیمِ آن‌ها
> (`npx vitest run`، `npx tsx scripts/migrate.ts`، `npx prettier --check .`) گرفته شده‌اند.
> این دقیقاً همان روشی است که در `PROJECT_STATE.md` مستند شده است.

## Diff دقیق

```diff
--- a/package.json
+++ b/package.json
@@
 {
-  "name": "nextjs-postgresql-template",
+  "name": "shomal-food-reservation",
+  "version": "1.0.0",
+  "description": "سامانهٔ رزرو غذای دانشگاه شمال آمل — هم‌سفره",
   "private": true,
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint .",
-    "typecheck": "tsc --noEmit"
+    "typecheck": "tsc --noEmit",
+    "typegen": "next typegen",
+    "test": "vitest run",
+    "test:watch": "vitest",
+    "test:integration": "vitest run --config vitest.config.integration.ts",
+    "test:e2e": "playwright test",
+    "db:migrate": "tsx scripts/migrate.ts",
+    "db:generate": "drizzle-kit generate",
+    "db:seed": "tsx src/db/seed.ts",
+    "reconcile": "tsx scripts/reconcile.ts",
+    "rotate-keys": "tsx scripts/rotate-keys.ts",
+    "screenshots": "playwright test src/tests/e2e/screenshots.spec.ts",
+    "format": "prettier --write .",
+    "format:check": "prettier --check .",
+    "verify": "npm run lint && npm run typegen && npm run typecheck && npm run format:check && npm run test && npm run test:integration && npm run build"
   },
   "dependencies": {
-    "@playwright/test": "^1.63.0",
     "@radix-ui/react-dialog": "^1.2.0",
-    "@types/qrcode": "^1.5.6",
     "argon2": "^0.45.1",
     "clsx": "^2.1.1",
     "date-fns-jalali": "^4.4.0-0",
     "dotenv": "17.3.1",
     "drizzle-orm": "0.45.2",
     "exceljs": "^4.4.0",
     "framer-motion": "^14.0.0",
     "ioredis": "^6.0.0",
     "lucide-react": "^1.52.0",
     "next": "16.2.6",
     "pg": "8.20.0",
-    "prettier": "^3.6.2",
-    "prettier-plugin-tailwindcss": "^0.6.14",
     "qrcode": "^1.5.4",
     "react": "19.2.6",
     "react-dom": "19.2.6",
     "recharts": "^3.10.1",
     "sharp": "^0.35.5",
     "tailwind-merge": "^3.7.0",
-    "tsx": "^4.23.15",
-    "vitest": "^5.0.3",
     "zod": "^4.6.5"
   },
   "devDependencies": {
+    "@playwright/test": "^1.63.0",
     "@tailwindcss/postcss": "4.1.17",
     "@types/node": "22.19.15",
     "@types/pg": "8.18.0",
+    "@types/qrcode": "^1.5.6",
     "@types/react": "19.2.14",
     "@types/react-dom": "19.2.3",
     "drizzle-kit": "0.31.10",
     "eslint": "9.39.4",
     "eslint-config-next": "16.2.6",
     "postcss": "8.5.8",
+    "prettier": "^3.6.2",
+    "prettier-plugin-tailwindcss": "^0.6.14",
     "tailwindcss": "4.1.17",
+    "tsx": "^4.23.15",
     "typescript": "5.9.3"
+    "vitest": "^5.0.3"
   }
 }
```

> نکتهٔ ویرایشی: در بلوک `devDependencies` بالا بعد از `"typescript": "5.9.3"`
> باید **کاما** اضافه شود (`"typescript": "5.9.3",`) تا JSON معتبر بماند.

## نکتهٔ `prettier-plugin-tailwindcss`

این پلاگین نصب شد اما در `.prettierrc.json` **فعال نشده است**. دلیل: فعال‌کردنش
ترتیب کلاس‌های Tailwind را در همهٔ کامپوننت‌ها بازنویسی می‌کند و diff بسیار بزرگِ
بی‌ارزشِ بازبینی تولید می‌کند. اگر خواستید فعالش کنید، این را به `.prettierrc.json`
اضافه کنید و یک commit **جداگانه** و فقط-قالب‌بندی بزنید:

```json
{ "plugins": ["prettier-plugin-tailwindcss"] }
```

## تأیید پس از اعمال

```bash
npm ci            # یا npm install اگر lockfile ندارید
npm run format:check
npm run lint
npm run typegen && npm run typecheck
npm run test
npm run test:integration
npm run build
```
