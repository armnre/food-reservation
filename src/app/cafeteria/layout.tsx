import React from 'react';
import { RoleShell } from '@/components/layout/role-shell';
import { ROLES } from '@/lib/permissions';

export default function CafeteriaLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell roles={[ROLES.CAFETERIA_OPERATOR]}>{children}</RoleShell>;
}
