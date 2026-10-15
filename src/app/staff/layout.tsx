import type { ReactNode } from 'react';
import { StudentShell } from '@/components/layout/role-shell-student';
export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StudentShell role="STAFF">{children}</StudentShell>;
}
