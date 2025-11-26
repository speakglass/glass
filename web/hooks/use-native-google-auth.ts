/**
 * Native Google Authentication hook for Capacitor
 *
 * This hook provides seamless Google Sign-In for both web and native platforms.
 * - On web: Falls back to Next Auth Google provider
 * - On iOS/Android: Uses native Google Sign-In SDK via Capacitor plugin
 */

'use client';

import { useState, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { isNativePlatform } from '@/lib/capacitor';
import { toast } from '@/utils/toast';

export interface GoogleAuthResult {
  email: string;
  name: string;
  imageUrl?: string;
  idToken: string;
}

export interface UseNativeGoogleAuthReturn {
  signInWithGoogle: (callbackUrl?: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to handle Google Sign-In on both web and native platforms
 */
export function useNativeGoogleAuth(): UseNativeGoogleAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = useCallback(async (callbackUrl?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const isNative = isNativePlatform();

      if (isNative) {
        const result = await GoogleAuth.signIn();

        if (!result?.authentication?.idToken) {
          throw new Error('Failed to get authentication token from Google');
        }

        const { email, givenName, familyName, imageUrl, authentication } = result;

        if (!email) {
          throw new Error('Email not provided by Google');
        }

        const name = [givenName, familyName].filter(Boolean).join(' ') || email;

        const response = await signIn('native-oauth', {
          email,
          name,
          imageUrl: imageUrl || '',
          idToken: authentication.idToken,
          provider: 'google',
          redirect: false,
        });

        if (response?.error) {
          throw new Error(response.error);
        }

        if (response?.ok) {
          window.location.href = callbackUrl || '/dashboard';
        }
      } else {
        await signIn('google', { callbackUrl });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in with Google';
      console.error('[GoogleAuth] Sign-in error:', errorMessage);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    signInWithGoogle,
    isLoading,
    error,
  };
}

/**
 * Refresh the Google Auth token (native only)
 */
export async function refreshGoogleAuthToken(): Promise<string | null> {
  if (!isNativePlatform()) {
    return null;
  }

  try {
    const result = await GoogleAuth.refresh();
    return result.idToken || null;
  } catch (error) {
    console.error('[GoogleAuth] Failed to refresh token:', error);
    return null;
  }
}

/**
 * Sign out from Google (native only)
 */
export async function signOutFromGoogle(): Promise<void> {
  if (!isNativePlatform()) {
    return;
  }

  try {
    await GoogleAuth.signOut();
    console.log('[GoogleAuth] Native sign-out successful');
  } catch (error) {
    console.error('[GoogleAuth] Failed to sign out:', error);
  }
}
