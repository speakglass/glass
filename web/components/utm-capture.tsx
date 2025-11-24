'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ensureFirstTouchUtm } from '@/lib/utm';

export function UtmCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    ensureFirstTouchUtm(searchParams);
  }, [pathname, searchParams]);

  return null;
}
