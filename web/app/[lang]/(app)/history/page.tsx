'use client';

import { ConversationHistory } from '@/components/history/conversation-history';
import { Trans } from '@lingui/react/macro';
import { AuthGate } from '@/components/auth-gate';

export default function HistoryPage() {
  return (
    <AuthGate>
      <div className="h-dvh pt-12 sm:pt-14 flex flex-col overflow-hidden">
        {/* Header Section */}
        <div className="md:block hidden bg-background border-b border-border/30 shrink-0">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-3 sm:py-6">
            <div className="flex items-center justify-between gap-3 sm:gap-6">
              <div className="space-y-0.5 sm:space-y-2 min-w-0">
                <p className="text-[11px] sm:text-sm font-medium text-muted-foreground">
                  <Trans>Conversation history</Trans>
                </p>
                <h1 className="text-xl sm:text-3xl font-bold truncate">
                  <Trans>Your saved calls</Trans>
                </h1>
              </div>
              <div className="size-9 sm:size-12 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-sm shrink-0">
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
          <ConversationHistory />
        </div>
      </div>
    </AuthGate>
  );
}
