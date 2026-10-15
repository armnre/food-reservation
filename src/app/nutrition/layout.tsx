import React from 'react';
import { RoleShell } from '@/components/layout/role-shell';
import { ROLES } from '@/lib/permissions';

export default function NutritionLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell roles={[ROLES.NUTRITION_MANAGER, ROLES.SUPER_ADMIN]}>{children}</RoleShell>;
}
