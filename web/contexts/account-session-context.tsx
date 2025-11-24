'use client';

import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountSnapshot, OnboardingStatus } from '@/lib/account-api';
import { fetchOnboardingStatus, completeOnboarding } from '@/lib/account-api';
import type { LearningLevel } from '@/types/learning-level';
import { isLearningLevel } from '@/types/learning-level';

export type SessionData = {
  token: string;
  snapshot: AccountSnapshot;
  onboardingStatus: OnboardingStatus;
};

type AccountSessionContextValue = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'signed-out';
  token: string | null;
  snapshot: AccountSnapshot | null;
  onboardingStatus: OnboardingStatus | null;
  refresh: () => Promise<SessionData | null>;
  markOnboardingComplete: (settings: {
    learningLang: string;
    nativeLang: string;
    languageLevel: LearningLevel;
  }) => Promise<void>;
};

const AccountSessionContext = createContext<AccountSessionContextValue>({
  status: 'idle',
  token: null,
  snapshot: null,
  onboardingStatus: null,
  refresh: async () => null,
  markOnboardingComplete: async () => {},
});

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

async function fetchSessionData(): Promise<SessionData> {
  try {
    const response = await fetch('/api/session', {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Session] API error:', response.status, errorText);

      // If 401 Unauthorized, throw a special error that triggers logout
      if (response.status === 401) {
        const error = new Error('Unauthorized') as UnauthorizedError;
        error.status = 401;
        throw error;
      }

      throw new Error(`Failed to load session state: ${response.status}`);
    }

    const payload = (await response.json()) as { token: string; snapshot: AccountSnapshot };
    const userLevel = payload.snapshot?.user.languageLevel ?? null;
    payload.snapshot.user.languageLevel = isLearningLevel(userLevel) ? userLevel : null;

    // Fetch onboarding status
    try {
      const onboardingStatus = await fetchOnboardingStatus(payload.token);

      // Sync with localStorage cache
      if (typeof window !== 'undefined') {
        localStorage.setItem('glass_onboarding_completed', String(onboardingStatus.completed));
      }

      return {
        token: payload.token,
        snapshot: payload.snapshot,
        onboardingStatus,
      };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }
      console.error('[Session] failed to fetch onboarding status', error);
      // Fallback to localStorage
      const cached =
        typeof window !== 'undefined' ? localStorage.getItem('glass_onboarding_completed') === 'true' : false;

      return {
        token: payload.token,
        snapshot: payload.snapshot,
        onboardingStatus: { completed: cached, completedAt: null },
      };
    }
  } catch (error) {
    console.error('[Session] fetchSessionData error:', error);
    throw error;
  }
}

export function AccountSessionProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useSession();
  const queryClient = useQueryClient();

  // Fetch session data with TanStack Query
  const {
    data: sessionData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['accountSession'],
    queryFn: fetchSessionData,
    enabled: authStatus === 'authenticated',
    staleTime: Infinity, // Never consider data stale - only refetch on explicit refresh
    gcTime: 30 * 60 * 1000, // 30 minutes cache time
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (isUnauthorizedError(error)) {
        return false;
      }
      // Retry up to 3 times for other errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000), // Exponential backoff: 1s, 2s, 3s
    refetchOnMount: false, // Don't refetch on component mount if data exists
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });

  // Handle 401 errors by signing out
  useEffect(() => {
    if (isError && isUnauthorizedError(error)) {
      console.warn('[Session] 401 Unauthorized - signing out');
      // Sign out and redirect to login
      void signOut({ redirect: true, callbackUrl: '/login' });
    }
  }, [isError, error]);

  // Mutation for completing onboarding
  const markOnboardingCompleteMutation = useMutation({
    mutationFn: async (settings: { learningLang: string; nativeLang: string; languageLevel: LearningLevel }) => {
      if (!sessionData?.token) {
        throw new Error('No token available');
      }
      return completeOnboarding(sessionData.token, settings);
    },
    onSuccess: (result) => {
      // Update the cache
      queryClient.setQueryData(['accountSession'], (old: SessionData | undefined) => {
        if (!old) return old;
        return { ...old, onboardingStatus: result };
      });

      // Update localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('glass_onboarding_completed', 'true');
      }
    },
  });

  // Determine overall status
  const status = useMemo<AccountSessionContextValue['status']>(() => {
    if (authStatus === 'loading') return 'idle';
    if (authStatus === 'unauthenticated') return 'signed-out';
    if (isLoading) return 'loading';
    if (isError) return 'error';
    if (sessionData) return 'ready';
    return 'idle';
  }, [authStatus, isLoading, isError, sessionData]);

  const value = useMemo<AccountSessionContextValue>(
    () => ({
      status,
      token: sessionData?.token ?? null,
      snapshot: sessionData?.snapshot ?? null,
      onboardingStatus: sessionData?.onboardingStatus ?? null,
      refresh: async () => {
        const result = await refetch();
        return result.data ?? null;
      },
      markOnboardingComplete: async (settings: {
        learningLang: string;
        nativeLang: string;
        languageLevel: LearningLevel;
      }) => {
        await markOnboardingCompleteMutation.mutateAsync(settings);
      },
    }),
    [status, sessionData, refetch, markOnboardingCompleteMutation]
  );

  return <AccountSessionContext.Provider value={value}>{children}</AccountSessionContext.Provider>;
}

export function useAccountSession() {
  return useContext(AccountSessionContext);
}
