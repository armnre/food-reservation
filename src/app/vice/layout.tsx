import React from 'react';
import { RoleShell } from '@/components/layout/role-shell';
import { ROLES } from '@/lib/permissions';

export default function ViceLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell roles={[ROLES.VICE_STUDENT]}>{children}</RoleShell>;
}
