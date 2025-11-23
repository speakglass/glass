import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Trash2, Users } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { Button } from '@/components/ui/button';

type LimitDialogVariant = 'conversations' | 'partners';

interface CallLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitUsageLabel: string | null;
  limitDisplayUsed: number;
  limitMax: number | null;
  checkoutLoading: boolean;
  onManageClick: () => void;
  onUpgradeClick: () => void;
  variant?: LimitDialogVariant;
}

export function CallLimitDialog({
  open,
  onOpenChange,
  limitUsageLabel,
  limitDisplayUsed,
  limitMax,
  checkoutLoading,
  onManageClick,
  onUpgradeClick,
  variant = 'conversations',
}: CallLimitDialogProps) {
  const isPartnerVariant = variant === 'partners';
  const limitNumber = limitMax ?? (isPartnerVariant ? 3 : 10);
  const ManageIcon = isPartnerVariant ? Users : Trash2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {isPartnerVariant ? <Trans>AI partner limit reached</Trans> : <Trans>Saved call limit reached</Trans>}
          </DialogTitle>
          <DialogDescription>
            {isPartnerVariant ? (
              <Trans>
                Free accounts can create up to {limitNumber} AI partners. Delete one or upgrade to unlock more.
              </Trans>
            ) : (
              <Trans>
                Free accounts can keep up to {limitNumber} conversations. Delete old calls or upgrade for unlimited
                history.
              </Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-border/60 bg-muted/50 px-4 py-5 text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium text-muted-foreground">
              <Trans>Current usage</Trans>
            </span>
          </div>
          <div className="text-3xl font-semibold tracking-tight">{limitUsageLabel || limitDisplayUsed}</div>
          <p className="text-xs text-muted-foreground">
            {isPartnerVariant ? (
              <Trans>Delete a saved partner or upgrade to keep creating new ones.</Trans>
            ) : (
              <Trans>Delete a saved call or upgrade to keep recording new ones.</Trans>
            )}
          </p>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onManageClick} className="cursor-pointer">
            <ManageIcon className="h-3.5 w-3.5" />
            {isPartnerVariant ? <Trans>Manage partners</Trans> : <Trans>Manage history</Trans>}
          </Button>
          <Button onClick={onUpgradeClick} className="cursor-pointer" disabled={checkoutLoading}>
            {checkoutLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Trans>Upgrade plan</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
