import { auth } from '@/auth';
import { issueSessionToken } from '@/lib/session-token';
import { fetchAccountSnapshot } from '@/lib/account-api';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import Chat from '@/components/chat';

const apiBase = process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

interface OnboardingStatusResponse {
  completed: boolean;
  completed_at: string | null;
}

async function getOnboardingStatus(user: Session['user']): Promise<boolean> {
  try {
    const token = await issueSessionToken(user);
    const response = await fetch(`${apiBase}/accounts/me/onboarding`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('Failed to fetch onboarding status:', response.status);
      return false;
    }

    const data: OnboardingStatusResponse = await response.json();
    return data.completed;
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    return false;
  }
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // This should not happen because middleware handles auth, but just in case
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  // Check email verification status
  const token = await issueSessionToken(session.user);
  const snapshot = await fetchAccountSnapshot(token);

  if (!snapshot.user.emailVerified) {
    redirect(`/${lang}/verify-email-sent?email=${encodeURIComponent(snapshot.user.email)}`);
  }

  // Check onboarding status on server side
  const onboardingCompleted = await getOnboardingStatus(session.user);
  if (!onboardingCompleted) {
    redirect(`/${lang}/onboarding`);
  }

  return (
    <div className={'grow flex flex-col'}>
      <Chat />
    </div>
  );
}
