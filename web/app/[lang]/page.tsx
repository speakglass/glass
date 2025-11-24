import { auth } from '@/auth';
import { issueSessionToken } from '@/lib/session-token';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';

const apiBase = process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

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

    if (response.status === 401) {
      const unauthorizedError = new Error('Unauthorized') as UnauthorizedError;
      unauthorizedError.status = 401;
      throw unauthorizedError;
    }

    if (!response.ok) {
      console.error('Failed to fetch onboarding status:', response.status);
      return false;
    }

    const data: OnboardingStatusResponse = await response.json();
    return data.completed;
  } catch (error) {
    if (isUnauthorizedError(error)) {
      throw error;
    }
    console.error('Error fetching onboarding status:', error);
    return false;
  }
}

export default async function RootPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // Not authenticated - middleware should have caught this, but redirect anyway
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  // Check onboarding status
  let onboardingCompleted = false;
  try {
    onboardingCompleted = await getOnboardingStatus(session.user);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      redirect(`/${lang}/login`);
    }
    throw error;
  }
  if (!onboardingCompleted) {
    redirect(`/${lang}/onboarding`);
  }

  // Redirect to dashboard
  redirect(`/${lang}/dashboard`);
}
