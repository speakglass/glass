'use client';

import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Loader2, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PartnerSearchEmptyStateProps = {
  searchTerm?: string;
  isCreating?: boolean;
  onCreate?: () => void;
  isSearching?: boolean;
};

export function PartnerSearchEmptyState({
  searchTerm,
  isCreating,
  onCreate,
  isSearching = true,
}: PartnerSearchEmptyStateProps) {
  const hasSearch = Boolean(searchTerm);
  const canCreate = typeof onCreate === 'function';
  const displayTerm = searchTerm || '';
  const title = isSearching ? (
    <Trans>No matching partners.</Trans>
  ) : (
    <Trans>No partners yet.</Trans>
  );
  const subtitle = isSearching ? null : (
    <p className="text-[11px] text-muted-foreground/80">
      <Trans>Create a partner to link this conversation.</Trans>
    </p>
  );

  return (
    <div className="px-3 pb-1 pt-1">
      <div className="mt-1 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-muted/30 px-2.5 py-2 text-center">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
        </div>
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {subtitle}
        {canCreate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full justify-center gap-2 border border-dashed border-border bg-card/80 text-foreground"
            onClick={() => onCreate?.()}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            {isSearching && displayTerm ? (
              <span className="truncate font-medium">{t`New ${displayTerm}`}</span>
            ) : (
              <span className="font-medium">
                <Trans>Create partner</Trans>
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
