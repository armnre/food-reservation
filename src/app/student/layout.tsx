import type { ReactNode } from 'react';
import { StudentShell } from '@/components/layout/role-shell-student';
export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentShell role="STUDENT">{children}</StudentShell>;
}
