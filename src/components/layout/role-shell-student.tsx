import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { requireRole } from '@/server/dal/auth';
import type { Role } from '@/lib/permissions';

export async function StudentShell({ children, role }: { children: ReactNode; role: Role }) {
  const { user } = await requireRole(role);
  return (
    <AppShell displayName={user.displayName} role={user.role} username={user.username}>
      {children}
    </AppShell>
  );
}
