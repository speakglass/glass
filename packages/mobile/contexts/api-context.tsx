import React, { createContext, useContext, useMemo } from 'react';
import { GlassApiClient } from '@glass/shared';
import { API_BASE_URL } from '@/lib/api-config';
import { useAuth } from './auth-context';

const ApiContext = createContext<GlassApiClient | null>(null);

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const { token, signOut } = useAuth();

  const apiClient = useMemo(
    () =>
      new GlassApiClient({
        baseUrl: API_BASE_URL,
        getAuthToken: async () => token,
        onTokenExpired: async () => {
          console.log('Token expired in ApiProvider, signing out...');
          await signOut();
        },
      }),
    [token, signOut]
  );

  return <ApiContext.Provider value={apiClient}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
}
