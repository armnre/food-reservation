import React from 'react';
import { RoleShell } from '@/components/layout/role-shell';
import { ROLES } from '@/lib/permissions';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleShell
      roles={[
        ROLES.STUDENT, ROLES.STAFF, ROLES.VICE_STUDENT,
        ROLES.NUTRITION_MANAGER, ROLES.CAFETERIA_OPERATOR, ROLES.SUPER_ADMIN,
      ]}
    >
      {children}
    </RoleShell>
  );
}
