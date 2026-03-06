import { NextRequest, NextResponse } from 'next/server';

type Role = 'ADMIN' | 'MANAGER' | 'REP';

function parseSession(request: NextRequest): { role: Role } | null {
  const raw = request.cookies.get('session')?.value;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { role: Role };
    return parsed;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const session = parseSession(request);

  const isPublic = pathname === '/login' || pathname === '/forbidden' || pathname.startsWith('/api/auth/');

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (!session) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/forbidden', request.url));
  }

  if (pathname.startsWith('/manager') && !['ADMIN', 'MANAGER'].includes(session.role)) {
    return NextResponse.redirect(new URL('/forbidden', request.url));
  }

  if (pathname.startsWith('/rep') && session.role !== 'REP') {
    return NextResponse.redirect(new URL('/forbidden', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
