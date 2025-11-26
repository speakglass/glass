'use client';

import { BillingContent } from '@/components/billing/billing-content';
import { Trans } from '@lingui/react/macro';
import { AuthGate } from '@/components/auth-gate';

export default function BillingPage() {
  return (
    <AuthGate>
      <div className="fixed inset-0 pt-12 sm:pt-14 flex flex-col">
        <div className="bg-background border-b border-border/30 z-10">
          <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-6 sm:py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">
                  <Trans>Upgrade</Trans>
                </p>
                <h1 className="text-base sm:text-3xl font-bold">
                  <Trans>Billing</Trans>
                </h1>
              </div>
              <div className="size-8 sm:size-12 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-sm">
                <img src="/glass-ai.png" alt="Glass AI" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
            <BillingContent />
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
