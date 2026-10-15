import React from 'react';
import { AppShell } from './app-shell';
import { requireRole } from '@/server/dal/auth';
import type { Role } from '@/lib/permissions';

export async function RoleShell({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const ctx = await requireRole(...roles);
  return (
    <AppShell
      displayName={ctx.user.displayName}
      role={ctx.user.role}
      username={ctx.user.username}
    >
      {children}
    </AppShell>
  );
}
