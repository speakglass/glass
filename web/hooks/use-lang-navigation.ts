'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

export type LangNavigation = {
  langSegment: string;
  dashboardHref: string;
  historyHref: string;
  memoryHref: string;
  billingHref: string;
};

export const useLangNavigation = (): LangNavigation => {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname?.split('/').filter(Boolean) ?? [];
    const langSegment = segments[0] || 'en';
    const basePath = `/${langSegment}`;

    return {
      langSegment,
      dashboardHref: `${basePath}/dashboard`,
      historyHref: `${basePath}/history`,
      memoryHref: `${basePath}/memory`,
      billingHref: `${basePath}/billing`,
    };
  }, [pathname]);
};
