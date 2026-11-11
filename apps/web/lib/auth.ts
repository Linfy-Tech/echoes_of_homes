import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, viewerForSession, type Viewer } from './session';

/** Resolves the opaque API session on the server before app UI is rendered. */
export async function currentViewer(): Promise<Viewer | null> {
  const cookieStore = await cookies();
  return viewerForSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}
