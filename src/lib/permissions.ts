export const ROLES = {
  STUDENT: 'STUDENT',
  STAFF: 'STAFF',
  VICE_STUDENT: 'VICE_STUDENT',
  NUTRITION_MANAGER: 'NUTRITION_MANAGER',
  CAFETERIA_OPERATOR: 'CAFETERIA_OPERATOR',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  [ROLES.STUDENT]: [
    'view_own_profile', 'view_menu', 'reserve_food', 'cancel_own_reservation',
    'view_own_wallet', 'topup_wallet', 'request_withdrawal', 'view_own_reservations',
  ],
  [ROLES.STAFF]: [
    'view_own_profile', 'view_menu', 'reserve_food', 'cancel_own_reservation',
    'view_own_wallet', 'topup_wallet', 'request_withdrawal', 'view_own_reservations',
  ],
  [ROLES.CAFETERIA_OPERATOR]: [
    'scan_ticket', 'mark_ticket_used', 'view_menu', 'view_staff_list', 'view_today_reservations',
  ],
  [ROLES.NUTRITION_MANAGER]: [
    'manage_staff_cafeteria', 'manage_menu', 'manage_foods', 'manage_prices',
    'view_reports', 'view_wallets', 'view_reservations',
  ],
  [ROLES.VICE_STUDENT]: [
    'manage_staff', 'manage_students', 'view_reports', 'reset_student_password', 'view_menu_readonly',
  ],
  [ROLES.SUPER_ADMIN]: [
    'manage_all_users', 'manage_all_roles', 'view_audit_logs', 'manage_system',
    'manage_withdrawals', 'view_all_wallets', 'view_reports', 'view_reservations',
  ],
} as const;

export function hasPermission(role: Role, permission: string): boolean {
  const perms = PERMISSIONS[role] as unknown as string[];
  return (perms ?? []).includes(permission);
}

export function canCreateRole(actor: Role, target: Role): boolean {
  if (actor === 'SUPER_ADMIN') return target !== 'SUPER_ADMIN';
  if (actor === 'VICE_STUDENT') return target === 'STAFF';
  if (actor === 'NUTRITION_MANAGER') return target === 'CAFETERIA_OPERATOR';
  return false;
}
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  if (actor === 'VICE_STUDENT') return target === 'STAFF' || target === 'STUDENT';
  return actor === 'NUTRITION_MANAGER' && target === 'CAFETERIA_OPERATOR';
}
