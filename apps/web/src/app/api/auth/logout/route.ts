import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });

  return response;
}
