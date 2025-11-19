'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAccountSession } from '@/contexts/account-session-context';
import { createCheckoutSession, BillingPlanKey } from '@/lib/account-api';
import { Loader2 } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { toast } from 'sonner';

export function BillingContent() {
  const { snapshot, token, status } = useAccountSession();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanKey | null>(null);
  const limit = snapshot?.limits?.conversations || null;
  const limitUsageLabel =
    limit && limit.limit ? `${Math.min(limit.used, limit.limit)}/${limit.limit}` : null;
  const billingDisabled = snapshot?.billing?.selfHosted || !snapshot?.billing?.enabled;

  const handleCheckout = async (plan: BillingPlanKey) => {
    if (!token) {
      toast.error(t`Please sign in again`);
      return;
    }
    setLoadingPlan(plan);
    try {
      const session = await createCheckoutSession(token, { plan });
      if (typeof window !== 'undefined') {
        window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[Billing] Failed to start checkout', error);
      toast.error(t`Unable to open checkout`);
    } finally {
      setLoadingPlan(null);
    }
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Trans>Loading billing…</Trans>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
        <Trans>We couldn't load your account details. Please refresh and try again.</Trans>
      </div>
    );
  }

  if (billingDisabled) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card/60 px-6 py-12 text-center space-y-3">
        <h3 className="text-lg font-semibold">
          <Trans>Billing is not available</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>This Glass instance is running in self-hosted mode, so upgrades aren't required.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-border/70 bg-card/70">
        <div className="p-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Saved calls</Trans>
          </p>
          <p className="text-3xl font-bold tracking-tight">{limitUsageLabel ?? '—'}</p>
          <p className="text-sm text-muted-foreground">
            {limit && limit.limit ? (
              <Trans>
                Free plan allows up to {limit.limit} saved conversations. Paid plans unlock unlimited history.
              </Trans>
            ) : (
              <Trans>Upgrade to unlock unlimited saved calls and premium support.</Trans>
            )}
          </p>
        </div>
      </Card>
      <Card className="border border-primary/30 bg-primary/5">
        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              <Trans>Glass Unlimited</Trans>
            </p>
            <h3 className="text-2xl font-semibold tracking-tight mt-1">
              <Trans>Unlimited saved conversations</Trans>
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5">
              <Trans>Unlock unlimited history, faster analysis, and priority support.</Trans>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              className="cursor-pointer flex-1"
              onClick={() => void handleCheckout('monthly')}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === 'monthly' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trans>Upgrade monthly</Trans>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="cursor-pointer flex-1"
              onClick={() => void handleCheckout('yearly')}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === 'yearly' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trans>Upgrade yearly</Trans>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
