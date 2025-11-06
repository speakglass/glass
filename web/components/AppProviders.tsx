'use client';

import React from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GlassProvider } from '@/contexts/GlassContext';
import { toast } from 'sonner';

export function AppProviders({ children }: { children: React.ReactNode }) {
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
