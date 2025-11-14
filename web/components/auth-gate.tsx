'use client';

import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Trans } from '@lingui/react/macro';
import { useAccountSession } from '@/contexts/account-session-context';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { status: accountStatus } = useAccountSession();

  // Wait for session and account session to be ready before rendering
  // This ensures onboardingStatus is loaded before showing the page
  // Note: Middleware already handles authentication redirects
  if (status === 'loading' || accountStatus === 'loading' || accountStatus === 'idle') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <Trans>Preparing your workspace…</Trans>
        </p>
      </div>
    );
  }

  // If account status is ready, render children
  // StartCall component will handle showing the appropriate screen based on onboarding status
  return <>{children}</>;
}
