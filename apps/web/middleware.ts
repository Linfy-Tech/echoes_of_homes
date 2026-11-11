import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, isProtectedPathname, viewerForSession } from './lib/session';

export async function middleware(request: NextRequest) {
  if (!isProtectedPathname(request.nextUrl.pathname)) return NextResponse.next();

  const viewer = await viewerForSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (viewer) return NextResponse.next();

  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/families/:path*', '/consent/:path*', '/record/:path*', '/transcription/:path*', '/review/:path*', '/translation/:path*', '/story/:path*', '/profile/:path*', '/sessions/:path*'],
};
