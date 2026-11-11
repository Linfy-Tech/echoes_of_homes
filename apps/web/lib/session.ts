export const SESSION_COOKIE_NAME = 'eoh_session';

export type Viewer = { id: string; email: string };

export function apiBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return (environment.API_BASE_URL ?? environment.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

export function isProtectedPathname(pathname: string): boolean {
  return [
    '/families',
    '/consent',
    '/record',
    '/transcription',
    '/review',
    '/translation',
    '/story',
    '/profile',
    '/sessions',
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function safeReturnPath(next: string | null, origin: string): string | null {
  if (!next?.startsWith('/')) return null;
  try {
    const target = new URL(next, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : null;
  } catch {
    return null;
  }
}

export async function viewerForSession(token: string | undefined, fetcher: typeof fetch = fetch): Promise<Viewer | null> {
  if (!token) return null;

  try {
    const response = await fetcher(`${apiBaseUrl()}/v1/me`, {
      cache: 'no-store',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const value = await response.json() as Partial<Viewer>;
    return typeof value.id === 'string' && typeof value.email === 'string' ? { id: value.id, email: value.email } : null;
  } catch {
    return null;
  }
}
