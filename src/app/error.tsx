'use client';
import { ErrorState } from '@/components/ui/feedback';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-6 py-20">
      <div className="surface-card">
        <ErrorState
          description="در دریافت اطلاعات مشکلی پیش آمد. اطلاعات شما محفوظ است؛ دوباره تلاش کنید."
          onRetry={reset}
        />
      </div>
    </main>
  );
}
