import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { issueSessionToken } from '@/lib/session-token';

const API_BASE_URL =
  process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

/**
 * Updates the user's UTM attribution data.
 * This is called after OAuth login to ensure UTM data is captured.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse UTM data from request
    const body = await request.json();
    const { utm_source, utm_campaign, utm_content } = body;

    // If no UTM data provided, nothing to update
    if (!utm_source && !utm_campaign && !utm_content) {
      return NextResponse.json({ success: true, message: 'No UTM data to update' });
    }

    // Get user token
    const token = await issueSessionToken(session.user);

    // Update UTM data in backend
    const response = await fetch(`${API_BASE_URL}/accounts/me/utm`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        utm_source: utm_source || null,
        utm_campaign: utm_campaign || null,
        utm_content: utm_content || null,
      }),
    });

    if (!response.ok) {
      console.error('[update-utm] Failed to update UTM:', response.status);
      return NextResponse.json({ error: 'Failed to update UTM data' }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[update-utm] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
