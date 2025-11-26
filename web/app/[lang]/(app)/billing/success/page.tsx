'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { AuthGate } from '@/components/auth-gate';
import { useParams } from 'next/navigation';

export default function BillingSuccessPage() {
  const params = useParams();
  const lang = params.lang as string;

  return (
    <AuthGate>
    <div className="min-h-screen bg-background px-6 py-16 flex items-center justify-center">
      <div className="w-full max-w-3xl space-y-10">
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-md">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <Trans>Billing updated</Trans>
            </p>
            <h1 className="text-4xl font-semibold text-emphasis">
              <Trans>You're all set!</Trans>
            </h1>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            <Trans>
              Thanks for upgrading your Glass workspace. Your subscription is active and your receipts will arrive via
              email. You can start roleplaying or manage your billing details whenever you like.
            </Trans>
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-border/60 bg-card/60 p-6 space-y-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>What's next</Trans>
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-emerald-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span>
                  <Trans>Unlimited call summaries are enabled right away.</Trans>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span>
                  <Trans>Priority support is available through the in-app help menu.</Trans>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">•</span>
                <span>
                  <Trans>Billing details can be updated anytime from the billing dashboard.</Trans>
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/60 p-6 space-y-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>Quick actions</Trans>
            </p>
            <div className="space-y-3">
              <Button className="w-full" asChild>
                <Link href={`/${lang}/dashboard`} prefetch={false}>
                  <Trans>Return to dashboard</Trans>
                </Link>
              </Button>
              <Button variant="secondary" className="w-full" asChild>
                <Link href={`/${lang}/billing`} prefetch={false}>
                  <Trans>Manage billing</Trans>
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>Your new plan is active. We'll keep your saved conversations safe and synced.</Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
