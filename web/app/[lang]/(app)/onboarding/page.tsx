import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { issueSessionToken } from '@/lib/session-token';
import { fetchAccountSnapshot } from '@/lib/account-api';
import OnboardingClient from '@/components/onboarding/onboarding-client';

type UnauthorizedError = Error & { status: number };

function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number' &&
    (error as { status: number }).status === 401
  );
}

export default async function OnboardingPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  // Check email verification status
  const token = await issueSessionToken(session.user);
  let snapshot: Awaited<ReturnType<typeof fetchAccountSnapshot>>;
  try {
    snapshot = await fetchAccountSnapshot(token);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      redirect(`/${lang}/login`);
    }
    throw error;
  }
  
  if (!snapshot.user.emailVerified) {
    redirect(`/${lang}/verify-email-sent?email=${encodeURIComponent(snapshot.user.email)}`);
  }

  return <OnboardingClient />;
}
