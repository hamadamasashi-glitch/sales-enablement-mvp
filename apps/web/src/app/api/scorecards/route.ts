import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decodeSession } from '@/lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  const session = decodeSession(cookies().get('session')?.value);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';

  const response = await fetch(`${apiBase}/v1/scorecards`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
