import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GlassApiClient, type AccountSnapshot, type OnboardingStatus, type LearningLevel } from '@glass/shared';
import { AuthStorage, type StoredUser } from '@glass/shared/utils';
import { storage } from '@/lib/storage';
import { API_BASE_URL } from '@/lib/api-config';

export interface AuthContextValue {
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  user: StoredUser | null;
  token: string | null;
  snapshot: AccountSnapshot | null;
  onboardingStatus: OnboardingStatus | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  completeOnboarding: (settings: {
    learningLang: string;
    nativeLang: string;
    languageLevel: LearningLevel;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: 'idle',
  user: null,
  token: null,
  snapshot: null,
  onboardingStatus: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  refreshSnapshot: async () => {},
  completeOnboarding: async () => {},
});

const authStorage = new AuthStorage(storage);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('idle');
  const [user, setUser] = useState<StoredUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

  const handleTokenExpired = useCallback(async () => {
    console.log('Token expired, logging out...');
    await authStorage.clear();
    setToken(null);
    setUser(null);
    setSnapshot(null);
    setOnboardingStatus(null);
    setStatus('unauthenticated');
  }, []);

  const apiClient = new GlassApiClient({
    baseUrl: API_BASE_URL,
    getAuthToken: async () => token,
    onTokenExpired: handleTokenExpired,
  });

  // Initialize auth state from storage
  useEffect(() => {
    (async () => {
      setStatus('loading');
      try {
        const storedToken = await authStorage.getToken();
        const storedUser = await authStorage.getUser();

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);

          // Fetch fresh data to verify token is still valid
          try {
            const client = new GlassApiClient({
              baseUrl: API_BASE_URL,
              getAuthToken: async () => storedToken,
              onTokenExpired: handleTokenExpired,
            });
            const [freshSnapshot, freshOnboarding] = await Promise.all([
              client.fetchAccountSnapshot(),
              client.fetchOnboardingStatus(),
            ]);
            setSnapshot(freshSnapshot);
            setOnboardingStatus(freshOnboarding);
            setStatus('authenticated');
          } catch (error: any) {
            console.error('Failed to fetch fresh data:', error);
            // If it's a 401, the token is invalid, log out
            if (error?.status === 401) {
              console.log('Token is invalid, logging out...');
              await authStorage.clear();
              setToken(null);
              setUser(null);
              setSnapshot(null);
              setOnboardingStatus(null);
              setStatus('unauthenticated');
            } else {
              // For other errors (network issues, server down, etc.),
              // assume onboarding is completed if user was stored
              // This allows offline usage and prevents redirect to onboarding
              console.log('Using offline mode - assuming onboarding completed');
              setOnboardingStatus({ completed: true, completedAt: null });
              setStatus('authenticated');
            }
          }
        } else {
          setStatus('unauthenticated');
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setStatus('unauthenticated');
      }
    })();
  }, [handleTokenExpired]);

  const refreshSnapshot = useCallback(async () => {
    if (!token) return;

    try {
      const [freshSnapshot, freshOnboarding] = await Promise.all([
        apiClient.fetchAccountSnapshot(),
        apiClient.fetchOnboardingStatus(),
      ]);
      setSnapshot(freshSnapshot);
      setOnboardingStatus(freshOnboarding);
    } catch (error: any) {
      console.error('Failed to refresh snapshot:', error);
      // Don't throw on 401 - it will be handled by the token expired callback
      if (error?.status !== 401) {
        throw error;
      }
    }
  }, [token, apiClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setStatus('loading');
      try {
        const response = await fetch(`${API_BASE_URL}/accounts/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Login failed:', response.status, errorText);
          throw new Error(errorText || 'Login failed');
        }

        const data = (await response.json()) as {
          token: string;
          user: { id: string; email: string; name?: string | null };
        };

        const storedUser: StoredUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? undefined,
        };

        await authStorage.setToken(data.token);
        await authStorage.setUser(storedUser);

        setToken(data.token);
        setUser(storedUser);
        setStatus('authenticated');

        // Fetch account data
        const client = new GlassApiClient({
          baseUrl: API_BASE_URL,
          getAuthToken: async () => data.token,
          onTokenExpired: handleTokenExpired,
        });
        const [accountSnapshot, onboarding] = await Promise.all([
          client.fetchAccountSnapshot(),
          client.fetchOnboardingStatus(),
        ]);
        setSnapshot(accountSnapshot);
        setOnboardingStatus(onboarding);
      } catch (error) {
        setStatus('unauthenticated');
        console.error('Sign in error:', error);
        throw error;
      }
    },
    [handleTokenExpired]
  );

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      setStatus('loading');
      try {
        const response = await fetch(`${API_BASE_URL}/accounts/mobile-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Registration failed:', response.status, errorText);
          throw new Error(errorText || 'Registration failed');
        }

        const data = (await response.json()) as {
          token: string;
          user: { id: string; email: string; name?: string | null; message?: string };
        };

        const storedUser: StoredUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? undefined,
        };

        await authStorage.setToken(data.token);
        await authStorage.setUser(storedUser);

        setToken(data.token);
        setUser(storedUser);
        setStatus('authenticated');

        // Fetch account data
        const client = new GlassApiClient({
          baseUrl: API_BASE_URL,
          getAuthToken: async () => data.token,
          onTokenExpired: handleTokenExpired,
        });
        const [accountSnapshot, onboarding] = await Promise.all([
          client.fetchAccountSnapshot(),
          client.fetchOnboardingStatus(),
        ]);
        setSnapshot(accountSnapshot);
        setOnboardingStatus(onboarding);
      } catch (error) {
        setStatus('unauthenticated');
        console.error('Sign up error:', error);
        throw error;
      }
    },
    [handleTokenExpired]
  );

  const signOut = useCallback(async () => {
    await authStorage.clear();
    setToken(null);
    setUser(null);
    setSnapshot(null);
    setOnboardingStatus(null);
    setStatus('unauthenticated');
  }, []);

  const completeOnboarding = useCallback(
    async (settings: { learningLang: string; nativeLang: string; languageLevel: LearningLevel }) => {
      if (!token) throw new Error('Not authenticated');

      const result = await apiClient.completeOnboarding(settings);
      setOnboardingStatus(result);
      await refreshSnapshot();
    },
    [token, refreshSnapshot]
  );

  const value: AuthContextValue = {
    status,
    user,
    token,
    snapshot,
    onboardingStatus,
    signIn,
    signUp,
    signOut,
    refreshSnapshot,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
