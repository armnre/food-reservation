'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Smartphone, Globe, LogOut, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, useToast, EmptyState } from '@/components/ui/feedback';
import { revokeMySessionAction } from '@/server/actions/student-actions';

export interface SessionItem {
  id: string;
  ip: string | null;
  device: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

export function SessionsClient({ items }: { items: SessionItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<SessionItem | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        title="نشست فعالی وجود ندارد"
        description="در حال حاضر هیچ دستگاهی با حساب شما وارد نشده است."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((s) => {
        const isMobile = /mobile|android|iphone/i.test(s.device);
        return (
          <div
            key={s.id}
            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3.5 transition-colors ${
              s.current
                ? 'border-[var(--color-brand-200)] bg-[var(--color-brand-50)]/60'
                : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/40'
            }`}
          >
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                s.current
                  ? 'bg-[var(--color-brand-100)] text-[var(--color-brand-800)]'
                  : 'bg-[var(--color-muted)] text-[var(--color-foreground-muted)]'
              }`}
            >
              {isMobile ? <Smartphone size={17} /> : <Monitor size={17} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-xs font-semibold">{s.device || 'دستگاه ناشناس'}</p>
                {s.current && (
                  <Badge variant="success">
                    <ShieldCheck size={11} /> نشست فعلی
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-foreground-muted)]">
                <span className="flex items-center gap-1">
                  <Globe size={10} />
                  <span className="font-mono" dir="ltr">
                    {s.ip ?? '—'}
                  </span>
                </span>
                <span>آخرین فعالیت: {s.lastSeenAt}</span>
                <span>ایجاد: {s.createdAt}</span>
              </div>
            </div>

            {!s.current && (
              <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => setTarget(s)}>
                بستن نشست
              </Button>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="بستن نشست"
        description="این نشست باطل می‌شود و آن دستگاه باید دوباره وارد شود."
        confirmLabel="بستن نشست"
        danger
        onConfirm={async () => {
          if (!target) return;
          const res = await revokeMySessionAction(target.id);
          setTarget(null);
          if (res.ok) {
            toast.push({ kind: 'success', title: 'نشست بسته شد' });
            router.refresh();
          } else {
            toast.push({ kind: 'error', title: 'خطا', description: res.error });
          }
        }}
      />
    </div>
  );
}
