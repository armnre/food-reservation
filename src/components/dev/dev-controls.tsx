'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, Drawer, ConfirmDialog, useToast } from '@/components/ui/feedback';

export function DevControls({ modals = false }: { modals?: boolean }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!modals) {
    return (
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('theme', next);
          }}
        >
          تغییر حالت روشن / تیره
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <Button onClick={() => setDialog(true)}>باز کردن Dialog</Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          باز کردن Drawer
        </Button>
        <Button variant="outline" onClick={() => setConfirm(true)}>
          ConfirmDialog
        </Button>
        <Button
          variant="accent"
          onClick={() =>
            toast.push({ kind: 'success', title: 'عملیات موفق', description: 'تغییرات با موفقیت ذخیره شد' })
          }
        >
          Toast موفق
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            toast.push({ kind: 'error', title: 'خطا', description: 'ارتباط با سرور برقرار نشد' })
          }
        >
          Toast خطا
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            toast.push({ kind: 'warning', title: 'هشدار', description: 'این عملیات قابل بازگشت نیست' })
          }
        >
          Toast هشدار
        </Button>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="نمونه دیالوگ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              انصراف
            </Button>
            <Button onClick={() => setDialog(false)}>تأیید</Button>
          </>
        }
      >
        <p className="text-sm leading-loose text-[var(--color-foreground-muted)]">
          این یک دیالوگ نمونه است. بدنه قابل اسکرول است و با کلید Escape بسته می‌شود.
        </p>
      </Dialog>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="نمونه دراور"
        footer={<Button onClick={() => setDrawer(false)}>بستن</Button>}
      >
        <p className="text-sm leading-loose text-[var(--color-foreground-muted)]">
          دراور از سمت راست باز می‌شود و برای نمایش جزئیات رکورد استفاده می‌شود.
        </p>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast.push({ kind: 'success', title: 'تأیید شد' });
        }}
        title="تأیید عملیات"
        description="آیا از انجام این عملیات مطمئن هستید؟ این عمل قابل بازگشت نیست."
        confirmLabel="بله، انجام بده"
        danger
        requireTypedWord="تأیید"
      />
    </>
  );
}
