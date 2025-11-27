'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Trans } from '@lingui/react/macro';
import Feedback from '@/components/feedback';
import { Home } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const pathname = usePathname();
  const segments = pathname?.split('/').filter(Boolean) ?? [];
  const langSegment = segments[0] || 'en';
  const homeHref = `/${langSegment}/dashboard`;

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-sm shadow-lg">
        <p className="text-foreground">
          <Trans>An error occurred</Trans> <span className="text-muted-foreground">· {error.message}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-full px-3 gap-1.5" asChild>
            <Link href={homeHref}>
              <Home className="size-3.5" />
              <Trans>Home</Trans>
            </Link>
          </Button>
          <Feedback />
        </div>
      </div>
    </div>
  );
}
