import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getApiBase } from '@/lib/account-api';
import { issueSessionToken } from '@/lib/session-token';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { feedback, reaction } = await request.json();

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return NextResponse.json({ error: 'Feedback is required' }, { status: 400 });
    }

    const token = await issueSessionToken(session.user);
    const base = getApiBase();
    const response = await fetch(`${base}/feedback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feedback: feedback.trim(),
        reaction,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[feedback] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: response.status >= 400 ? response.status : 500 }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
