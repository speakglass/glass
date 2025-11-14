import { NextResponse } from 'next/server';

const apiBase = process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export async function POST(request: Request) {
  const payload = await request.json();
  const response = await fetch(`${apiBase}/accounts/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }
  return NextResponse.json(data);
}
