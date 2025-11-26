import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConversationPartner, deletePartner } from '@/lib/account-api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from '@/utils/toast';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

interface PartnerDeleteDialogProps {
  open: boolean;
  partner: ConversationPartner | null;
  token: string | null;
  onClose: () => void;
  onPartnerDeleted?: (partnerId: string) => void;
}

export function PartnerDeleteDialog({
  open,
  partner,
  token,
  onClose,
  onPartnerDeleted,
}: PartnerDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleClose = useCallback(() => {
    if (!isDeleting) {
      onClose();
    }
  }, [isDeleting, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!token || !partner) {
      toast.error(t`Unable to delete partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    setIsDeleting(true);
    try {
      await deletePartner(token, partner.id);
      queryClient.setQueryData<ConversationPartner[] | undefined>(
        ['partners', token],
        (previous) =>
          (previous || []).filter((existing) => existing.id !== partner.id)
      );
      toast.success(t`Partner deleted`);
      onPartnerDeleted?.(partner.id);
      onClose();
    } catch (error) {
      console.error('[PartnerDeleteDialog] Failed to delete partner', error);
      toast.error(t`Unable to delete partner`);
    } finally {
      setIsDeleting(false);
    }
  }, [token, partner, queryClient, onClose, onPartnerDeleted]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && handleClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete partner</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {partner ? (
              <Trans>
                Are you sure you want to delete {partner.name}? This action
                cannot be undone.
              </Trans>
            ) : (
              <Trans>This action cannot be undone.</Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} disabled={isDeleting}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleConfirmDelete();
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isDeleting}
          >
            {isDeleting && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            <Trans>Delete</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
