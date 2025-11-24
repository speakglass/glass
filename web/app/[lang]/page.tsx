import { auth } from '@/auth';
import { issueSessionToken } from '@/lib/session-token';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE_URL =
  process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

// ============================================================================
// Type Definitions
// ============================================================================

interface OnboardingStatusResponse {
  completed: boolean;
  completed_at: string | null;
}

type UnauthorizedError = Error & { status: number };

// ============================================================================
// Error Handling
// ============================================================================

function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number' &&
    (error as { status: number }).status === 401
  );
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetches the user's onboarding completion status from the API.
 * @throws {UnauthorizedError} If the user is not authenticated
 * @returns {Promise<boolean>} True if onboarding is completed, false otherwise
 */
async function getOnboardingStatus(user: Session['user']): Promise<boolean> {
  try {
    const token = await issueSessionToken(user);
    const response = await fetch(`${API_BASE_URL}/accounts/me/onboarding`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (response.status === 401) {
      const error = new Error('Unauthorized') as UnauthorizedError;
      error.status = 401;
      throw error;
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

// ============================================================================
// Page Component
// ============================================================================

/**
 * Root page that handles routing logic based on authentication and onboarding status.
 *
 * Routing logic:
 * 1. Unauthenticated users → /login
 * 2. Authenticated users without onboarding → /onboarding
 * 3. Authenticated users with onboarding → /dashboard
 */
export default async function RootPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // Step 1: Check authentication
  // Note: Proxy middleware should catch this, but we handle it here as a safety measure
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  // Step 2: Check onboarding status
  let onboardingCompleted = false;
  try {
    onboardingCompleted = await getOnboardingStatus(session.user);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      // Session may have expired or been invalidated
      redirect(`/${lang}/login`);
    }
    throw error;
  }

  // Step 3: Route based on onboarding status
  if (!onboardingCompleted) {
    redirect(`/${lang}/onboarding`);
  }

  redirect(`/${lang}/dashboard`);
}
