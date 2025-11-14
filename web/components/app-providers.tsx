'use client';

import React, { useEffect } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { GlassProvider } from '@/contexts/glass-context';
import { toast } from 'sonner';
import { initAnalytics } from '@/utils/analytics';
import { NextStepProvider } from 'nextstepjs';
import { SessionProvider } from 'next-auth/react';
import { AccountSessionProvider } from '@/contexts/account-session-context';
import { QueryProvider } from './providers/query-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initAnalytics();
  }, []);
  return (
    <SessionProvider>
      <QueryProvider>
        <AccountSessionProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <GlassProvider
              onError={(error) => {
                toast.error(error.message);
              }}
            >
              <NextStepProvider>{children}</NextStepProvider>
            </GlassProvider>
          </ThemeProvider>
        </AccountSessionProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
