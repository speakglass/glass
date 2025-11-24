'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ensureFirstTouchUtm, getStoredUtmParams, type UtmParams } from '@/lib/utm';

export function useFirstTouchAttribution(): UtmParams {
  const searchParams = useSearchParams();
  const [utm, setUtm] = useState<UtmParams>(() => (typeof window === 'undefined' ? {} : getStoredUtmParams()));

  useEffect(() => {
    const next = ensureFirstTouchUtm(searchParams);
    setUtm(next);
  }, [searchParams]);

  return utm;
}
