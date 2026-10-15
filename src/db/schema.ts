import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, varchar, index, AnyPgColumn } from 'drizzle-orm/pg-core';
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
});

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

/* جداول اسکلت فازهای بعد */
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
  /** تاریخ شمسی/میلادی روز منو — یکتا روی (تاریخ، وعده) */
  date: timestamp('date').notNull(),
  mealSlotId: uuid('meal_slot_id').references(() => mealSlots.id, { onDelete: 'restrict' }).notNull(),
  status: text('status', {
    enum: ['DRAFT', 'PUBLISHED', 'CLOSED'],
  }).default('DRAFT').notNull(),
  /** بازه رزرو (ج‑۳) */
  reservationOpensAt: timestamp('reservation_opens_at'),
  reservationClosesAt: timestamp('reservation_closes_at'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('menus_date_slot_idx').on(table.date, table.mealSlotId),
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
]);

export const menuItemPrices = pgTable('menu_item_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'restrict' }).notNull(),
  customerGroup: text('customer_group', { enum: ['STUDENT', 'EMPLOYEE', 'FACULTY', 'CONTRACTOR'] }).notNull(),
  /** عدد صحیح ریال */
  priceRials: integer('price_rials').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('menu_item_prices_item_idx').on(table.menuItemId),
]);

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'restrict' }).notNull(),
  status: text('status', { enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'USED', 'NO_SHOW'] }).default('PENDING').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  priceSnapshotRials: integer('price_snapshot_rials').notNull(),
  qrToken: text('qr_token').notNull().unique(),
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
  sql`CREATE UNIQUE INDEX reservations_user_item_active_idx ON reservations(user_id, menu_item_id) WHERE status = 'CONFIRMED'`,
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] }).default('OPEN').notNull(),
  priority: text('priority', { enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }).default('MEDIUM').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** برای کیف‌های سیستمی null است */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).unique(),
  ownerType: text('owner_type', { enum: ['USER', 'TREASURY', 'GATEWAY_CLEARING'] }).default('USER').notNull(),
  /** کلید کیف‌های سیستمی (مثلاً TREASURY) */
  ownerKey: text('owner_key'),
  balanceRials: integer('balance_rials').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('wallets_user_id_idx').on(table.userId),
  index('wallets_owner_idx').on(table.ownerType, table.ownerKey),
  /** فقط کیف کاربر باید نامنفی باشد؛ kif системی می‌تواند منفی شود */
  sql`CREATE CONSTRAINT wallet_balance_check CHECK (${table.ownerType} <> 'USER' OR ${table.balanceRials} >= 0)`,
]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }).notNull(),
  /** مبلغ signed — مثبت = واریز، منفی = برداشت */
  amountRials: integer('amount_rials').notNull(),
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
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  amountRials: integer('amount_rials').notNull(),
  status: text('status', { enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] }).default('PENDING').notNull(),
  gateway: text('gateway').default('sandbox').notNull(),
  providerReference: text('provider_reference'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  sql`CREATE CONSTRAINT positive_payment CHECK (${table.amountRials} > 0)`,
  index('payments_user_id_idx').on(table.userId),
  index('payments_status_idx').on(table.status),
]);

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  amountRials: integer('amount_rials').notNull(),
  status: text('status', { enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] }).default('PENDING').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  sql`CREATE CONSTRAINT positive_withdrawal CHECK (${table.amountRials} > 0)`,
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
