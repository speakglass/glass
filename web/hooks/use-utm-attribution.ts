'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ensureFirstTouchUtm,
  getCookieStoredUtmParams,
  getStoredUtmParams,
  hasAnyUtmParam,
  type UtmParams,
} from '@/lib/utm';

export function useFirstTouchAttribution(): UtmParams {
  const searchParams = useSearchParams();
  const [utm, setUtm] = useState<UtmParams>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    const stored = getStoredUtmParams();
    if (hasAnyUtmParam(stored)) {
      return stored;
    }
    return getCookieStoredUtmParams();
  });

  useEffect(() => {
    const next = ensureFirstTouchUtm(searchParams);
    setUtm(next);
  }, [searchParams]);

  return utm;
}
