'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountSnapshot, OnboardingStatus } from '@/lib/account-api';
import { fetchOnboardingStatus, completeOnboarding } from '@/lib/account-api';

type SessionData = {
  token: string;
  snapshot: AccountSnapshot;
  onboardingStatus: OnboardingStatus;
};

type AccountSessionContextValue = {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'signed-out';
  token: string | null;
  snapshot: AccountSnapshot | null;
  onboardingStatus: OnboardingStatus | null;
  refresh: () => Promise<void>;
  markOnboardingComplete: (settings: {
    learningLang: string;
    nativeLang: string;
    proficiency: string;
  }) => Promise<void>;
};

const AccountSessionContext = createContext<AccountSessionContextValue>({
  status: 'idle',
  token: null,
  snapshot: null,
  onboardingStatus: null,
  refresh: async () => {},
  markOnboardingComplete: async () => {},
});

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
      throw new Error(`Failed to load session state: ${response.status}`);
    }

    const payload = (await response.json()) as { token: string; snapshot: AccountSnapshot };

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
    refetch,
  } = useQuery({
    queryKey: ['accountSession'],
    queryFn: fetchSessionData,
    enabled: authStatus === 'authenticated',
    staleTime: Infinity, // Never consider data stale - only refetch on explicit refresh
    gcTime: 30 * 60 * 1000, // 30 minutes cache time
    retry: 3, // Retry up to 3 times to handle timing issues
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000), // Exponential backoff: 1s, 2s, 3s
    refetchOnMount: false, // Don't refetch on component mount if data exists
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });

  // Mutation for completing onboarding
  const markOnboardingCompleteMutation = useMutation({
    mutationFn: async (settings: { learningLang: string; nativeLang: string; proficiency: string }) => {
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
        await refetch();
      },
      markOnboardingComplete: async (settings: { learningLang: string; nativeLang: string; proficiency: string }) => {
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
