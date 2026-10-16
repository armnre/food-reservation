import { db } from '@/db';
import { systemSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { audit, type AuditActor } from '@/lib/audit';
import { BizError } from './wallet';
import type { db as DbType } from '@/db';

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

/* ══════════════════════════════════════════════════════════════════════
   تنظیمات کسب‌وکار سامانه (فاز ۲-۱)
   ══════════════════════════════════════════════════════════════════════
   این مقادیر در جدول `system_settings` (کلید → jsonb) نگهداری می‌شوند تا
   بدون استقرار مجدد قابل تغییر باشند. هر تغییر با audit قبل/بعد ثبت می‌شود
   و فقط مدیر ارشد حق تغییر دارد (در لایهٔ action بررسی می‌شود).
   ────────────────────────────────────────────────────────────────────── */

export interface BusinessSettings {
  /** حداقل فاصلهٔ مجاز لغو رزرو تا شروع وعده (ساعت) */
  cancel_cutoff_hours: number;
  /** بازهٔ مجاز اسکن *پیش از* شروع وعده (دقیقه) */
  scan_window_before_minutes: number;
  /** بازهٔ مجاز اسکن *پس از* شروع وعده (دقیقه) */
  scan_window_after_minutes: number;
  /** حداکثر رزرو فعال یک کاربر در یک وعده */
  max_reservations_per_meal: number;
  /** حداقل مبلغ شارژ کیف پول (ریال) */
  min_wallet_topup_rials: number;
  /** حداکثر مبلغ شارژ کیف پول (ریال) */
  max_wallet_topup_rials: number;
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  cancel_cutoff_hours: 12,
  scan_window_before_minutes: 60,
  scan_window_after_minutes: 60,
  max_reservations_per_meal: 1,
  min_wallet_topup_rials: 10_000,
  max_wallet_topup_rials: 50_000_000,
};

/** دامنهٔ مجاز هر کلید — خارج از این دامنه رد می‌شود تا پیکربندی اشتباه سامانه را قفل نکند */
const BOUNDS: Record<keyof BusinessSettings, { min: number; max: number; label: string }> = {
  cancel_cutoff_hours: { min: 0, max: 720, label: 'مهلت لغو (ساعت)' },
  scan_window_before_minutes: { min: 0, max: 1440, label: 'بازهٔ اسکن پیش از وعده (دقیقه)' },
  scan_window_after_minutes: { min: 0, max: 1440, label: 'بازهٔ اسکن پس از وعده (دقیقه)' },
  max_reservations_per_meal: { min: 1, max: 20, label: 'سقف رزرو در هر وعده' },
  min_wallet_topup_rials: { min: 0, max: 100_000_000, label: 'حداقل شارژ (ریال)' },
  max_wallet_topup_rials: { min: 10_000, max: 5_000_000_000, label: 'حداکثر شارژ (ریال)' },
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof BusinessSettings>;

function coerce(key: keyof BusinessSettings, raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BizError(`${BOUNDS[key].label} باید عدد صحیح باشد`);
  }
  const { min, max } = BOUNDS[key];
  if (value < min || value > max) {
    throw new BizError(`${BOUNDS[key].label} باید بین ${min} و ${max} باشد`);
  }
  return value;
}

/**
 * خواندن تنظیمات با ادغام روی پیش‌فرض‌ها.
 * هرگز ردیف گم‌شده باعث undefined نمی‌شود — همیشه مقدار معتبر برمی‌گردد.
 */
export async function getBusinessSettings(): Promise<BusinessSettings> {
  const rows = await db.select().from(systemSettings);
  return mergeSettings(rows);
}

/** نسخهٔ داخل تراکنش — تا تصمیم مالی و مقدارِ خوانده‌شده سازگار بمانند */
export async function getBusinessSettingsInTx(tx: Tx): Promise<BusinessSettings> {
  const rows = await tx.select().from(systemSettings);
  return mergeSettings(rows);
}

function mergeSettings(rows: Array<{ key: string; value: unknown }>): BusinessSettings {
  const out: BusinessSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in out)) continue;
    const key = row.key as keyof BusinessSettings;
    const value = (row.value ?? null) as unknown;
    try {
      out[key] = coerce(key, typeof value === 'object' && value !== null ? (value as { v?: unknown }).v ?? value : value);
    } catch {
      // مقدار خراب در دیتابیس نباید سامانه را از کار بیندازد — پیش‌فرض معتبر می‌ماند
      out[key] = DEFAULT_SETTINGS[key];
    }
  }
  // ناوردایی: حداقل هرگز از حداکثر بزرگ‌تر نباشد
  if (out.min_wallet_topup_rials > out.max_wallet_topup_rials) {
    out.min_wallet_topup_rials = DEFAULT_SETTINGS.min_wallet_topup_rials;
    out.max_wallet_topup_rials = DEFAULT_SETTINGS.max_wallet_topup_rials;
  }
  return out;
}

/**
 * به‌روزرسانی تنظیمات — فقط کلیدهای حاضر در ورودی تغییر می‌کنند.
 * قبل/بعد در audit ثبت می‌شود (الزام «هر عملیات مدیریتی در audit_logs»).
 */
export async function updateBusinessSettings(input: {
  actor: AuditActor;
  patch: Partial<Record<keyof BusinessSettings, number | string>>;
}): Promise<{ ok: true; settings: BusinessSettings } | { ok: false; error: string }> {
  const entries = Object.entries(input.patch ?? {}) as Array<[string, unknown]>;
  if (entries.length === 0) return { ok: false, error: 'هیچ مقداری برای به‌روزرسانی داده نشد' };

  const before = await getBusinessSettings();
  const next: BusinessSettings = { ...before };

  try {
    for (const [rawKey, rawValue] of entries) {
      if (!SETTING_KEYS.includes(rawKey as keyof BusinessSettings)) {
        throw new BizError(`کلید ناشناخته: ${rawKey}`);
      }
      const key = rawKey as keyof BusinessSettings;
      next[key] = coerce(key, rawValue);
    }
    if (next.min_wallet_topup_rials > next.max_wallet_topup_rials) {
      throw new BizError('حداقل مبلغ شارژ نمی‌تواند از حداکثر آن بزرگ‌تر باشد');
    }
  } catch (e) {
    if (e instanceof BizError) return { ok: false, error: e.message };
    throw e;
  }

  const changed: Record<string, { before: number; after: number }> = {};
  for (const key of SETTING_KEYS) {
    if (before[key] !== next[key]) changed[key] = { before: before[key], after: next[key] };
  }
  if (Object.keys(changed).length === 0) {
    return { ok: true, settings: next };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const key of Object.keys(changed) as Array<keyof BusinessSettings>) {
      await tx
        .insert(systemSettings)
        .values({ key, value: next[key], updatedBy: input.actor.id ?? null, updatedAt: now })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: next[key], updatedBy: input.actor.id ?? null, updatedAt: now },
        });
    }
  });

  await audit({
    actor: input.actor,
    action: 'settings:updated',
    entityType: 'system_settings',
    entityId: Object.keys(changed).join(','),
    before: changed,
    after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.after])),
  });

  return { ok: true, settings: await getBusinessSettings() };
}
