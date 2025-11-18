'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Memory } from './columns';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

interface MemoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { value: string }) => void;
  memory?: Memory | null;
  isLoading?: boolean;
  readOnly?: boolean;
}

export function MemoryDialog({ open, onClose, onSave, memory, isLoading, readOnly = false }: MemoryDialogProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (memory) {
      setValue(memory.fact);
    } else {
      setValue('');
    }
  }, [memory, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || readOnly) return;

    onSave({
      value: value.trim(),
    });
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={readOnly ? 'sm:max-w-[500px]' : 'sm:max-w-[600px]'}>
        <form onSubmit={handleSubmit}>
          <DialogHeader className={readOnly ? 'pb-3' : ''}>
            <DialogTitle className={readOnly ? 'text-base' : ''}>
              {readOnly ? (
                <Trans>Memory</Trans>
              ) : memory ? (
                <Trans>Edit memory</Trans>
              ) : (
                <Trans>Add new memory</Trans>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className={readOnly ? 'py-2' : 'grid gap-4 py-4'}>
            <div className={readOnly ? '' : 'grid gap-2'}>
              {!readOnly && (
                <Label htmlFor="value">
                  <Trans>What would you like to remember?</Trans>
                </Label>
              )}
              <Textarea
                id="value"
                placeholder={t`e.g., I love hiking in the mountains, My favorite food is sushi, I'm learning Spanish...`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isLoading || readOnly}
                rows={readOnly ? 8 : 8}
                required={!readOnly}
                className={readOnly ? 'resize-none border-none bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm' : 'resize-none'}
              />
              {!readOnly && (
                <p className="text-xs text-muted-foreground">
                  <Trans>AI will organize and categorize this automatically, which can take up to 2 minutes.</Trans>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className={readOnly ? 'pt-2' : ''}>
            {readOnly ? (
              <Button type="button" onClick={handleClose} size="sm">
                <Trans>Close</Trans>
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button type="submit" disabled={isLoading || !value.trim()}>
                  {isLoading ? (
                    <Trans>Saving...</Trans>
                  ) : memory ? (
                    <Trans>Update</Trans>
                  ) : (
                    <Trans>Create</Trans>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
