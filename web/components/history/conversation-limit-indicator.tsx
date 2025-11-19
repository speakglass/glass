'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Trans } from '@lingui/react/macro';

import { useAccountSession } from '@/contexts/account-session-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/utils';

type ConversationLimitIndicatorProps = {
  className?: string;
};

export function ConversationLimitIndicator({ className }: ConversationLimitIndicatorProps) {
  const { snapshot, status } = useAccountSession();
  const locale = useLocale();
  const limits = snapshot?.limits?.conversations || null;

  const quotaEnabled = Boolean(limits?.enabled && limits.limit);
  if (!quotaEnabled) {
    return null;
  }

  const limitMax = limits!.limit ?? 0;
  const limitUsed = limits!.used ?? 0;
  const cappedUsage = Math.min(limitUsed, limitMax);
  const isAtLimit = Boolean(limits!.blocked || limitUsed >= limitMax);
  const usagePercent = limitMax > 0 ? Math.min(100, Math.round((cappedUsage / limitMax) * 100)) : 0;
  const billingHref = `/${locale}/billing`;

  return (
    <div
      className={cn(
        'w-full rounded-3xl border border-border/50 bg-card/60 px-4 py-3 shadow-sm backdrop-blur',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            'flex size-11 items-center justify-center rounded-2xl text-primary',
            isAtLimit ? 'bg-red-500/10 text-red-500' : 'bg-primary/10'
          )}
        >
          <MessageSquare className="size-5" />
        </div>

        <div className="min-w-[160px] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Saved conversations</Trans>
          </p>
          <div className="flex items-baseline gap-2">
            <p className={cn('text-xl font-semibold', isAtLimit ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
              {cappedUsage}/{limitMax}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === 'loading' ? (
                <Trans>Checking your plan…</Trans>
              ) : isAtLimit ? (
                <Trans>Free plan limit reached</Trans>
              ) : (
                <Trans>Free plan limit</Trans>
              )}
            </p>
          </div>
          <div className="mt-2">
            <Progress value={usagePercent} className={isAtLimit ? 'bg-red-500/20 [&>div]:bg-red-500' : undefined} />
          </div>
        </div>

        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Button
              variant={isAtLimit ? 'default' : 'ghost'}
              size="sm"
              className="rounded-full px-4"
              asChild
            >
              <Link href={billingHref}>
                <Trans>Upgrade</Trans>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-xs text-xs leading-relaxed">
            {status === 'loading' ? (
              <Trans>Checking your plan…</Trans>
            ) : (
              <Trans>Upgrade to keep unlimited conversation history.</Trans>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
