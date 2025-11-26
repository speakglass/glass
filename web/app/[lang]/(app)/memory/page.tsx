'use client';

import { MemoryTable } from '@/components/memory/memory-table';
import { Trans } from '@lingui/react/macro';
import { AuthGate } from '@/components/auth-gate';

export default function MemoryPage() {
  return (
    <AuthGate>
      <div className="h-dvh pt-12 sm:pt-14 flex flex-col overflow-hidden">
        {/* Header Section */}
        <div className="bg-background border-b border-border/30 shrink-0">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-2 sm:py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground md:mb-1 mb-">
                  <Trans>Memory</Trans>
                </p>
                <h1 className="text-base sm:text-3xl font-bold truncate">
                  <Trans>Your memories</Trans>
                </h1>
              </div>
              <div className="size-10 sm:size-12 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-sm shrink-0">
                <img
                  src="/glass-ai.png"
                  alt="Glass AI"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 sm:py-8 flex-1 min-h-0 overflow-auto">
          <MemoryTable />
        </div>
      </div>
    </AuthGate>
  );
}
