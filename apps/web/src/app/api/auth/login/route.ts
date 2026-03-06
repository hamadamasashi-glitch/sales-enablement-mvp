import { NextResponse } from 'next/server';
import { encodeSession } from '@/lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';

    const response = await fetch(`${apiBase}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    const payload = (await response.json()) as {
      message?: string;
      accessToken?: string;
      user?: {
        id: string;
        role: 'ADMIN' | 'MANAGER' | 'REP';
        email: string;
        name: string;
        teamIds: string[];
      };
    };

    if (!response.ok || !payload.accessToken || !payload.user) {
      return NextResponse.json({ message: payload.message ?? 'ログインに失敗しました' }, { status: response.status || 500 });
    }

    const session = encodeSession({
      token: payload.accessToken,
      role: payload.user.role,
      userId: payload.user.id,
      email: payload.user.email,
      name: payload.user.name,
      teamIds: payload.user.teamIds
    });

    const nextResponse = NextResponse.json({ ok: true, role: payload.user.role });
    nextResponse.cookies.set('session', session, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    });

    return nextResponse;
  } catch {
    return NextResponse.json(
      { message: '認証APIに接続できません。docker compose ps で api が Up か確認してください。' },
      { status: 502 }
    );
  }
}
