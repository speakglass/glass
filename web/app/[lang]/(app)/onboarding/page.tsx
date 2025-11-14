import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { issueSessionToken } from '@/lib/session-token';
import { fetchAccountSnapshot } from '@/lib/account-api';
import OnboardingClient from '@/components/onboarding/onboarding-client';

export default async function OnboardingPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  // Check email verification status
  const token = await issueSessionToken(session.user);
  const snapshot = await fetchAccountSnapshot(token);
  
  if (!snapshot.user.emailVerified) {
    redirect(`/${lang}/verify-email-sent?email=${encodeURIComponent(snapshot.user.email)}`);
  }

  return <OnboardingClient />;
}

