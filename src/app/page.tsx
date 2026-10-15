import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/dal/auth';
import { defaultHomeForRole } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const ctx = await getCurrentUser();
  redirect(defaultHomeForRole(ctx.user.role));
}
