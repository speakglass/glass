'use client';

import React, { useEffect } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GlassProvider } from '@/contexts/GlassContext';
import { toast } from 'sonner';
import { initAnalytics } from '@/utils/analytics';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initAnalytics();
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <GlassProvider
        onError={(error) => {
          toast.error(error.message);
        }}
      >
        {children}
      </GlassProvider>
    </ThemeProvider>
  );
}
