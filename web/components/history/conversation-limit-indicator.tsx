'use client';

import { Info } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

import { useAccountSession } from '@/contexts/account-session-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils';

type ConversationLimitIndicatorProps = {
  className?: string;
};

export function ConversationLimitIndicator({ className }: ConversationLimitIndicatorProps) {
  const { snapshot, status } = useAccountSession();
  const limits = snapshot?.limits?.conversations || null;

  const quotaEnabled = Boolean(limits?.enabled && limits.limit);
  if (!quotaEnabled) {
    return null;
  }

  const limitMax = limits!.limit ?? 0;
  const limitUsed = limits!.used ?? 0;
  const isAtLimit = Boolean(limits!.blocked || limitUsed >= limitMax);

  const labelText = t`${limitUsed}개 / ${limitMax}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-2 shadow-sm',
        className
      )}
    >
      <div className="flex flex-col leading-tight">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>History limit</Trans>
        </p>
        <p className={cn('text-base font-semibold', isAtLimit ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
          {labelText}
        </p>
      </div>

      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'rounded-full p-1 transition-colors',
              isAtLimit
                ? 'text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label={t`Conversation limit info`}
          >
            <Info className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-xs text-xs leading-relaxed">
          {status === 'loading' ? (
            <Trans>Checking your plan…</Trans>
          ) : (
            <Trans>Free plan keeps up to {limitMax} saved conversations. Upgrade to unlock unlimited history.</Trans>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
