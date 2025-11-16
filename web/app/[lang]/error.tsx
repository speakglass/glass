'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Trans } from '@lingui/react/macro';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-sm shadow-lg">
        <p className="text-foreground">
          <Trans>An error occurred</Trans>{' '}
          <span className="text-muted-foreground">· {error.message}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="rounded-full px-3" asChild>
            <Link href="https://www.speakglass.com/" target="_blank">
              <Trans>Docs</Trans>
            </Link>
          </Button>
          <Button size="sm" className="rounded-full px-3" onClick={reset}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
