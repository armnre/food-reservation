import { describe, it, expect } from 'vitest';
import { hasPermission, ROLES } from '../lib/permissions';

describe('RBAC', () => {
  it('student has student permissions', () => {
    expect(hasPermission(ROLES.STUDENT, 'view_own_profile')).toBe(true);
  });

  it('super_admin has all', () => {
    expect(hasPermission(ROLES.SUPER_ADMIN, 'manage_all_users')).toBe(true);
  });

  it('student cannot manage users', () => {
    expect(hasPermission(ROLES.STUDENT, 'manage_all_users')).toBe(false);
  });

  it('no role creates higher role', () => {
    expect(hasPermission(ROLES.VICE_STUDENT, 'manage_all_users')).toBe(false);
  });
});
