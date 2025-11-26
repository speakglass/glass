'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAccountSession } from '@/contexts/account-session-context';
import { Loader2 } from 'lucide-react';

/**
 * Root page that handles routing logic based on authentication and onboarding status.
 *
 * Routing logic:
 * 1. Unauthenticated users → /login
 * 2. Authenticated users without onboarding → /onboarding
 * 3. Authenticated users with onboarding → /dashboard
 */
export default function RootPage() {
  const router = useRouter();
  const params = useParams();
  const lang = params.lang as string;
  const { status: sessionStatus } = useSession();
  const { status: accountStatus, onboardingStatus } = useAccountSession();

  useEffect(() => {
    // Wait for both sessions to be loaded
    if (sessionStatus === 'loading' || accountStatus === 'loading' || accountStatus === 'idle') {
      return;
    }

    // Redirect unauthenticated users to login
    if (sessionStatus === 'unauthenticated') {
      router.push(`/${lang}/login`);
      return;
    }

    // Redirect based on onboarding status
    if (sessionStatus === 'authenticated' && accountStatus === 'ready') {
      if (!onboardingStatus?.completed) {
        router.push(`/${lang}/onboarding`);
      } else {
        router.push(`/${lang}/dashboard`);
      }
    }
  }, [sessionStatus, accountStatus, onboardingStatus, lang, router]);

  // Show loading state while determining redirect
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
