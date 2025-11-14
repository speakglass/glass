import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { fetchAccountSnapshot } from '@/lib/account-api';
import { issueSessionToken } from '@/lib/session-token';

export async function GET() {
  console.log('[session] GET /api/session called');

  const session = await auth();
  console.log('[session] Auth result:', {
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
    userEmail: session?.user?.email,
  });

  if (!session?.user?.id || !session.user.email) {
    console.warn('[session] Missing user id or email in session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[session] Issuing session token...');
    const token = await issueSessionToken(session.user);
    console.log('[session] Token issued, fetching account snapshot...');

    const snapshot = await fetchAccountSnapshot(token);
    console.log('[session] Snapshot fetched successfully');

    return NextResponse.json({ token, snapshot });
  } catch (error) {
    // Log detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const status = error instanceof Error && 'status' in error ? (error as Error & { status: number }).status : 500;
    
    console.error('[session] Failed to initialize account snapshot:', {
      error: errorMessage,
      stack: errorStack,
      status,
      userId: session.user.id,
      userEmail: session.user.email,
    });

    // Also log the raw error
    console.error('[session] Raw error:', error);

    // Return the appropriate status code (401 for auth errors, 500 for others)
    return NextResponse.json(
      {
        error: status === 401 ? 'Unauthorized' : 'Failed to initialize account snapshot',
        details: errorMessage,
      },
      { status }
    );
  }
}
