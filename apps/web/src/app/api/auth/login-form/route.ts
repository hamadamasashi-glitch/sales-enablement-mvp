import { NextResponse } from 'next/server';
import { encodeSession } from '@/lib/session';

function buildUrl(request: Request, path: string): URL {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
  return new URL(`${protocol}://${host}${path}`);
}

function loginRedirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(buildUrl(request, path), { status: 303 });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const email = formData.get('email');
    const password = formData.get('password');

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return loginRedirect(request, '/login?error=email%20and%20password%20are%20required');
    }

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:4000';
    const response = await fetch(`${apiBase}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password }),
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
      const message = encodeURIComponent(payload.message ?? 'ログインに失敗しました');
      return loginRedirect(request, `/login?error=${message}`);
    }

    const session = encodeSession({
      token: payload.accessToken,
      role: payload.user.role,
      userId: payload.user.id,
      email: payload.user.email,
      name: payload.user.name,
      teamIds: payload.user.teamIds
    });

    const nextResponse = loginRedirect(request, '/dashboard');
    nextResponse.cookies.set('session', session, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    });

    return nextResponse;
  } catch {
    return loginRedirect(request, '/login?error=%E8%AA%8D%E8%A8%BCAPI%E3%81%AB%E6%8E%A5%E7%B6%9A%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%9B%E3%82%93');
  }
}
