import { pgTable, uuid, text, timestamp, boolean, integer, bigint, jsonb, varchar, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: text('role', { enum: ['STUDENT', 'STAFF', 'VICE_STUDENT', 'NUTRITION_MANAGER', 'CAFETERIA_OPERATOR', 'SUPER_ADMIN'] }).notNull(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: text('password_hash'),
  mustChangePassword: boolean('must_change_password').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  displayName: text('display_name').notNull(),
  mobile: varchar('mobile', { length: 20 }),
  createdBy: uuid('created_by'),
  lastLoginAt: timestamp('last_login_at'),
  failedLoginCount: integer('failed_login_count').default(0).notNull(),
  lockedUntil: timestamp('locked_until'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('users_username_idx').on(table.username),
  index('users_role_idx').on(table.role),
  check('users_role_check', sql`${table.role} IN ('STUDENT','STAFF','VICE_STUDENT','NUTRITION_MANAGER','CAFETERIA_OPERATOR','SUPER_ADMIN')`),
]);

export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull().unique(),
  studentNumber: varchar('student_number', { length: 20 }).notNull().unique(),
  /** کد ملی رمزنگاری‌شده با AES-256-GCM — هیچ‌وقت مقدار خام ذخیره نمی‌شود */
  nationalCode: text('national_code').notNull(),
  /** ایندکس کور HMAC-SHA256 برای جستجو و یکتایی */
  nationalCodeHash: text('national_code_hash').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  faculty: text('faculty'),
  major: text('major'),
  entryYear: integer('entry_year'),
  status: text('status', { enum: ['ACTIVE', 'ON_LEAVE', 'WITHDRAWN', 'GRADUATED'] }).default('ACTIVE').notNull(),
  customerGroup: text('customer_group', { enum: ['STUDENT', 'EMPLOYEE', 'FACULTY', 'CONTRACTOR'] }).default('STUDENT').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('student_profiles_student_number_idx').on(table.studentNumber),
  index('student_profiles_national_code_idx').on(table.nationalCode),
  check('student_profiles_status_check', sql`${table.status} IN ('ACTIVE','ON_LEAVE','WITHDRAWN','GRADUATED')`),
  check('student_profiles_group_check', sql`${table.customerGroup} IN ('STUDENT','EMPLOYEE','FACULTY','CONTRACTOR')`),
]);

export const staffProfiles = pgTable('staff_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull().unique(),
  kind: text('kind', { enum: ['EMPLOYEE', 'FACULTY', 'CONTRACTOR', 'CAFETERIA'] }).notNull(),
  nationalCode: text('national_code'),
  nationalCodeHash: text('national_code_hash'),
  department: text('department'),
  employerNote: text('employer_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  check('staff_profiles_kind_check', sql`${table.kind} IN ('EMPLOYEE','FACULTY','CONTRACTOR','CAFETERIA')`),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('sessions_token_hash_idx').on(table.tokenHash),
  index('sessions_user_id_idx').on(table.userId),
]);

export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  ip: varchar('ip', { length: 45 }).notNull(),
  success: boolean('success').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('login_attempts_identifier_idx').on(table.identifier),
  index('login_attempts_ip_idx').on(table.ip),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
  actorRole: text('actor_role', { enum: ['STUDENT', 'STAFF', 'VICE_STUDENT', 'NUTRITION_MANAGER', 'CAFETERIA_OPERATOR', 'SUPER_ADMIN'] }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('audit_logs_entity_type_idx').on(table.entityType),
  index('audit_logs_entity_id_idx').on(table.entityId),
  index('audit_logs_created_at_idx').on(table.createdAt),
]);

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const foods = pgTable('foods', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category', {
    enum: ['MAIN', 'SIDE', 'SALAD', 'DESSERT', 'DRINK', 'OTHER'],
  }).default('MAIN').notNull(),
  calories: integer('calories'),
  /** برچسب‌ها: ['گیاهی','تند',…] */
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  /** مسیر نسبی تصویر در UPLOAD_DIR */
  imagePath: text('image_path'),
  thumbPath: text('thumb_path'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('foods_name_idx').on(table.name),
  check('foods_category_check', sql`${table.category} IN ('MAIN','SIDE','SALAD','DESSERT','DRINK','OTHER')`),
]);

export const mealSlots = pgTable('meal_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const menus = pgTable('menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** تاریخ شمسی/میلادی روز منو — یکتا روی (تاریخ، وعده) در میان منوهای حذف‌نشده */
  date: timestamp('date').notNull(),
  mealSlotId: uuid('meal_slot_id').references(() => mealSlots.id, { onDelete: 'restrict' }).notNull(),
  status: text('status', {
    enum: ['DRAFT', 'PUBLISHED', 'CLOSED'],
  }).default('DRAFT').notNull(),
  /** بازه رزرو (ج-۳) */
  reservationOpensAt: timestamp('reservation_opens_at'),
  reservationClosesAt: timestamp('reservation_closes_at'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('menus_date_slot_idx').on(table.date, table.mealSlotId),
  uniqueIndex('menus_date_slot_live_idx').on(table.date, table.mealSlotId).where(sql`deleted_at IS NULL`),
  check('menus_status_check', sql`${table.status} IN ('DRAFT','PUBLISHED','CLOSED')`),
]);

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuId: uuid('menu_id').references(() => menus.id, { onDelete: 'restrict' }).notNull(),
  foodId: uuid('food_id').references(() => foods.id, { onDelete: 'restrict' }).notNull(),
  /** ظرفیت کل (عدد صحیح > ۰) */
  capacity: integer('capacity').notNull(),
  reservedCount: integer('reserved_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('menu_items_menu_id_idx').on(table.menuId),
  uniqueIndex('menu_items_menu_food_idx').on(table.menuId, table.foodId),
  check('menu_items_capacity_check', sql`${table.capacity} > 0`),
  check('menu_items_reserved_check', sql`${table.reservedCount} >= 0 AND ${table.reservedCount} <= ${table.capacity}`),
]);

export const menuItemPrices = pgTable('menu_item_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'restrict' }).notNull(),
  customerGroup: text('customer_group', { enum: ['STUDENT', 'EMPLOYEE', 'FACULTY', 'CONTRACTOR'] }).notNull(),
  /** عدد صحیح ریال (bigint — جمع فروش TREASURY از سقف integer فراتر می‌رود) */
  priceRials: bigint('price_rials', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('menu_item_prices_item_idx').on(table.menuItemId),
  uniqueIndex('menu_item_prices_item_group_idx').on(table.menuItemId, table.customerGroup),
  check('menu_item_prices_group_check', sql`${table.customerGroup} IN ('STUDENT','EMPLOYEE','FACULTY','CONTRACTOR')`),
  check('menu_item_prices_nonnegative_check', sql`${table.priceRials} >= 0`),
]);

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'restrict' }).notNull(),
  status: text('status', { enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'USED', 'NO_SHOW'] }).default('PENDING').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  priceSnapshotRials: bigint('price_snapshot_rials', { mode: 'number' }).notNull(),
  qrToken: text('qr_token').notNull().unique(),
  /** کلید یکتای هر «تلاش» رزرو (UUID از سمت فرم) — رزرو مجدد پس از لغو مجاز است */
  idempotencyKey: text('idempotency_key').notNull().unique(),
  reservedAt: timestamp('reserved_at').notNull(),
  usedAt: timestamp('used_at'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('reservations_user_id_idx').on(table.userId),
  index('reservations_menu_item_id_idx').on(table.menuItemId),
  index('reservations_status_idx').on(table.status),
  // هر کاربر حداکثر یک رزرو «فعال» برای هر آیتم — رزرو مجدد پس از لغو مجاز است
  uniqueIndex('reservations_user_item_active_idx').on(table.userId, table.menuItemId).where(sql`status = 'CONFIRMED'`),
  check('reservations_status_check', sql`${table.status} IN ('PENDING','CONFIRMED','CANCELLED','USED','NO_SHOW')`),
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  reservationId: uuid('reservation_id').references(() => reservations.id, { onDelete: 'restrict' }).notNull(),
  code: text('code').notNull().unique(),
  status: text('status', { enum: ['VALID', 'USED', 'CANCELLED'] }).default('VALID').notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  usedAt: timestamp('used_at'),
}, (table) => [
  index('tickets_user_id_idx').on(table.userId),
  index('tickets_reservation_id_idx').on(table.reservationId),
]);

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** برای کیف‌های سیستمی null است */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).unique(),
  ownerType: text('owner_type', { enum: ['USER', 'TREASURY', 'GATEWAY_CLEARING', 'WITHDRAWAL_ESCROW', 'ADJUSTMENT'] }).default('USER').notNull(),
  /** کلید کیف‌های سیستمی (مثلاً TREASURY) */
  ownerKey: text('owner_key'),
  /** موجودی به ریال — bigint چون TREASURY جمع فروش‌هاست و از سقف integer فراتر می‌رود */
  balanceRials: bigint('balance_rials', { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('wallets_user_id_idx').on(table.userId),
  index('wallets_owner_idx').on(table.ownerType, table.ownerKey),
  // فقط کیف کاربر نامنفی است؛ کیف سیستمی (مثلاً تسویه) می‌تواند منفی شود
  check('wallet_balance_check', sql`${table.ownerType} <> 'USER' OR ${table.balanceRials} >= 0`),
  check('wallets_owner_type_check', sql`${table.ownerType} IN ('USER','TREASURY','GATEWAY_CLEARING','WITHDRAWAL_ESCROW','ADJUSTMENT')`),
]);

/** تراکنش دفتر کل — هر تراکنش چند ردیف با جمع صفر دارد (فاز ۳-۱) */
export const ledgerTransactions = pgTable('ledger_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  description: text('description'),
  /** شناسهٔ موجودیت مرجع (رزرو، پرداخت، برداشت، …) */
  referenceId: uuid('reference_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('ledger_transactions_reference_idx').on(table.referenceId),
  index('ledger_transactions_created_at_idx').on(table.createdAt),
]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }).notNull(),
  /** تراکنش گروه‌کنندهٔ دفتر کل — ردیف‌های یک تراکنش جمع صفر دارند */
  transactionId: uuid('transaction_id').references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
  /** موجودی کیف پس از این ردیف — برای ممیزی زنجیرهٔ موجودی */
  balanceAfter: bigint('balance_after', { mode: 'number' }),
  /** مبلغ signed — مثبت = واریز، منفی = برداشت (bigint ریال) */
  amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
  entryType: text('entry_type', {
    enum: ['DEPOSIT', 'WITHDRAWAL', 'PURCHASE', 'REFUND', 'ADJUSTMENT', 'SALE'],
  }).notNull(),
  referenceId: uuid('reference_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('ledger_entries_wallet_id_idx').on(table.walletId),
  index('ledger_entries_reference_idx').on(table.referenceId),
  index('ledger_entries_created_at_idx').on(table.createdAt),
  check('ledger_entries_type_check', sql`${table.entryType} IN ('DEPOSIT','WITHDRAWAL','PURCHASE','REFUND','ADJUSTMENT','SALE')`),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
  status: text('status', { enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] }).default('PENDING').notNull(),
  gateway: text('gateway').default('sandbox').notNull(),
  providerReference: text('provider_reference'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('payments_user_id_idx').on(table.userId),
  index('payments_status_idx').on(table.status),
  check('positive_payment_check', sql`${table.amountRials} > 0`),
  check('payments_status_check', sql`${table.status} IN ('PENDING','COMPLETED','FAILED','REFUNDED')`),
]);

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
  status: text('status', { enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] }).default('PENDING').notNull(),
  /** شماره شبا رمزنگاری‌شده AES-256-GCM (فاز ۳-۴) */
  ibanEncrypted: text('iban_encrypted'),
  /** ایندکس کور برای جستجو */
  ibanHash: text('iban_hash'),
  accountHolder: text('account_holder'),
  /** شمارهٔ پیگیری بانکی پس از تأیید */
  bankReference: text('bank_reference'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  check('positive_withdrawal_check', sql`${table.amountRials} > 0`),
  check('withdrawal_status_check', sql`${table.status} IN ('PENDING','APPROVED','REJECTED','COMPLETED')`),
]);

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['STUDENT', 'STAFF'] }).default('STUDENT').notNull(),
  fileName: text('file_name').notNull(),
  status: text('status', {
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNDONE'],
  }).default('PENDING').notNull(),
  recordCount: integer('record_count').default(0).notNull(),
  createdCount: integer('created_count').default(0).notNull(),
  updatedCount: integer('updated_count').default(0).notNull(),
  rejectedCount: integer('rejected_count').default(0).notNull(),
  deactivatedCount: integer('deactivated_count').default(0).notNull(),
  errorMessage: text('error_message'),
  importedBy: uuid('imported_by').references(() => users.id, { onDelete: 'restrict' }),
  undoneAt: timestamp('undone_at'),
  undoneBy: uuid('undone_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** ردیف‌های هر batch — برای گزارش، بازگردانی و ردیابی کامل */
export const importRows = pgTable('import_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').references(() => importBatches.id, { onDelete: 'restrict' }).notNull(),
  rowNumber: integer('row_number').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status', {
    enum: ['CREATED', 'UPDATED', 'SKIPPED', 'CONFLICT', 'ERROR', 'UNDONE'],
  }).notNull(),
  errors: jsonb('errors'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('import_rows_batch_id_idx').on(table.batchId),
]);

/** گزارش تغییرات گروه مشتری کارکنان */
export const customerGroupHistory = pgTable('customer_group_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  before: text('before'),
  after: text('after').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
