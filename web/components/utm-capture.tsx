'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ensureFirstTouchUtm, getStoredUtmParams, hasAnyUtmParam } from '@/lib/utm';

/**
 * Component that captures and syncs UTM parameters.
 *
 * Responsibilities:
 * 1. Capture UTM parameters from URL and store in localStorage/cookie
 * 2. Send UTM parameters to backend when user logs in via OAuth
 */
export function UtmCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const hasSyncedUtm = useRef(false);

  // Capture UTM parameters from URL
  useEffect(() => {
    ensureFirstTouchUtm(searchParams);
  }, [pathname, searchParams]);

  // Sync UTM to backend after OAuth login
  useEffect(() => {
    // Only run once per session and only when authenticated
    if (status !== 'authenticated' || !session?.user || hasSyncedUtm.current) {
      return;
    }

    const syncUtmToBackend = async () => {
      try {
        const utmParams = getStoredUtmParams();

        // Only sync if we have UTM data
        if (!hasAnyUtmParam(utmParams)) {
          return;
        }

        // Send UTM data to backend
        const response = await fetch('/api/update-utm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utmParams),
        });

        if (response.ok) {
          console.log('[UtmCapture] Successfully synced UTM to backend');
          hasSyncedUtm.current = true;
        } else {
          console.warn('[UtmCapture] Failed to sync UTM:', response.status);
        }
      } catch (error) {
        console.error('[UtmCapture] Error syncing UTM:', error);
      }
    };

    // Small delay to ensure session is fully established
    const timer = setTimeout(syncUtmToBackend, 1000);
    return () => clearTimeout(timer);
  }, [status, session]);

  return null;
}
